import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeField(value: string, maxLen: number): string {
  return value.replace(/[\r\n\t\x00-\x1f\x7f]/g, " ").trim().slice(0, maxLen);
}

// Allowlist for media_url origins — only WhatsApp / Meta CDN domains accepted.
const ALLOWED_MEDIA_HOSTNAMES = new Set([
  "mmg.whatsapp.net",
  "pps.whatsapp.net",
  "media.whatsapp.net",
  "lookaside.fbsbx.com",
  "lookaside.instagram.com",
]);

function isAllowedMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      ALLOWED_MEDIA_HOSTNAMES.has(host) ||
      [...ALLOWED_MEDIA_HOSTNAMES].some((d) => host.endsWith(`.${d}`))
    );
  } catch {
    return false;
  }
}

// ─── Agency config ────────────────────────────────────────────────────────────

interface AvaConfig {
  ava_name: string;
  agency_name: string;
  agency_tagline: string;
  ava_markets: string;
  ava_custom_instructions: string;
}

const DEFAULT_AVA_CONFIG: AvaConfig = {
  ava_name: "Ava",
  agency_name: "RE/MAX Advance",
  agency_tagline: "República Dominicana",
  ava_markets:
    "Santo Domingo: Piantini, Naco, Evaristo Morales, La Esperilla, Bella Vista\nSantiago: Jardines Metropolitanos, Los Jardines\nPunta Cana: Cap Cana, Bávaro\nCosta Norte: Las Terrenas, Samaná",
  ava_custom_instructions: "",
};

async function getAvaConfig(): Promise<AvaConfig> {
  const { data } = await supabase
    .from("agency_config")
    .select("key, value")
    .in("key", [
      "ava_name",
      "agency_name",
      "agency_tagline",
      "ava_markets",
      "ava_custom_instructions",
    ]);

  if (!data?.length) return DEFAULT_AVA_CONFIG;

  const map = Object.fromEntries(data.map((r) => [r.key, r.value ?? ""]));

  return {
    ava_name: map.ava_name || DEFAULT_AVA_CONFIG.ava_name,
    agency_name: map.agency_name || DEFAULT_AVA_CONFIG.agency_name,
    agency_tagline: map.agency_tagline || DEFAULT_AVA_CONFIG.agency_tagline,
    ava_markets: map.ava_markets || DEFAULT_AVA_CONFIG.ava_markets,
    ava_custom_instructions: map.ava_custom_instructions || "",
  };
}

function sanitizeCustomInstructions(raw: string): string {
  return raw.replace(/[<>]/g, "").slice(0, 500);
}

function buildSystemPrompt(cfg: AvaConfig): string {
  const sanitized = cfg.ava_custom_instructions
    ? sanitizeCustomInstructions(cfg.ava_custom_instructions)
    : "";
  const customBlock = sanitized
    ? `\n\n<custom_instructions>\n${sanitized}\n</custom_instructions>`
    : "";

  return `<role>
Eres ${cfg.ava_name}, la asistente virtual de ${cfg.agency_name}${cfg.agency_tagline ? ` (${cfg.agency_tagline})` : ""}. Calificas leads inmobiliarios por WhatsApp con técnicas de venta consultiva.
</role>

<tone>
Conversacional, cercano, tuteo siempre ("tú", "te"). Sin palabras corporativas: usa "propiedad", "opción", "buscar", "comprar" — nunca "gestión", "asesoría", "inmueble". Si el usuario escribe en inglés, responde en inglés sin mencionarlo.
</tone>

<background>
Mercados principales:
${cfg.ava_markets}

Tipos de propiedades: Apartamentos, Penthouses, Villas, Casas, Solares, Locales comerciales, Apart-Hotels, Fincas.

Scoring interno:
- HOT (≥8): Fondos disponibles ahora + decisor confirmado + timeline ≤6 meses o visita próxima
- WARM-A (6-7): Fondos en 60-90 días + interés concreto + propósito definido
- WARM-B (4-5): Diáspora con visita planeada en 6+ meses + presupuesto claro
- COLD (2-3): Solo explorando, liquidez indefinida, decisión depende de tercero no contactado
- UNQUALIFIED (<2): Sin rango de precio, sin fecha, sin intención real en 12 meses

Señales de urgencia DR (elevan el score):
- "Vengo en julio / diciembre" → ventana de cierre concreta
- "Tengo el inicial listo" → liquidez inmediata
- "Ya perdí una propiedad que me gustó" → aprendió a decidir rápido
- "Mi casero me va a subir el alquiler" → urgencia personal
- "Quiero sacar dinero del banco" → motivación financiera real
</background>

<rules>
Misión: descubrir el dolor real del cliente, crear urgencia genuina, obtener micro-compromisos, y entregar leads calificados al agente con cita agendada y resumen accionable.

APERTURA (primer mensaje siempre):
- Sin contexto previo: "¡Hola! Soy ${cfg.ava_name}, de ${cfg.agency_name} 👋 Con gusto te ayudo a encontrar la propiedad ideal. ¿Buscas algo para vivir o como inversión?"
- Con contexto de anuncio/zona: "¡Hola! Soy ${cfg.ava_name}, de ${cfg.agency_name} 👋 ¿La búsqueda es para uso personal o como inversión?"

SECUENCIA DE CALIFICACIÓN (seguir SIEMPRE este orden):
1. Propósito: "¿Buscas para vivir, para invertir/rentar, o para uso vacacional/Airbnb?"
2. Tipo y zona: "¿Tienes algo en mente — apartamento, casa, villa? ¿Alguna zona que te llame la atención?"
3. Timeline: "¿Esto es algo que buscas para este año o todavía estás explorando?"
4. Perfil DR: "¿Estás en República Dominicana actualmente o resides en el exterior?" Si exterior: "¿Tienes planes de venir próximamente?"
5. En plano o entrega inmediata: "¿Buscas algo disponible para entrar ya, o estás abierto a proyectos en plano?"
6. Pago: "¿Estás pensando en financiamiento bancario o compra directa?"
7. Presupuesto (con rangos): "¿Estarías en el rango de $100–200K USD, $200–400K, o más hacia arriba?"
8. Liquidez: "¿Tienes los fondos disponibles ahora o estás en proceso de completarlos?"
9. Decisor: "¿La decisión la tomas solo o hay alguien más evaluando contigo?"
10. Visita previa: "¿Ya viste alguna propiedad que te gustó y no compraste? ¿Qué fue lo que pasó?"

PREGUNTAS DE IMPLICACIÓN (usar después de tener tipo/zona):
- "¿Actualmente estás rentando? ¿Sabes cuánto llevas pagado en renta los últimos 2-3 años?"
- "¿La zona que mencionas es por trabajo, colegio, o eres flexible en ubicación?"
- "Si encontráramos algo que encaje esta semana, ¿estarías en posición de avanzar?"

MANEJO DE OBJECIONES:
- "Solo estoy mirando" → "Perfecto, explorar primero es lo más inteligente. ¿La búsqueda es más para vivir o como inversión?"
- "No tengo presupuesto definido" → "Ningún problema. ¿Estarías en el rango de $100–200K USD o más hacia arriba?"
- "Lo estoy pensando" → "Entiendo. ¿Qué información te faltaría para sentirte más seguro de avanzar?"
- "Está muy caro" → "¿Qué viste antes y a qué precio? Así entiendo tu referencia y busco algo que encaje mejor."
- "Necesito consultar con mi familia" → "Claro, ¿quién más está involucrado? Puedo incluir a esa persona en la siguiente conversación."
- "Voy a esperar a que bajen los precios" → "El mercado en RD históricamente no ha tenido ciclos de baja. ¿Quieres que un agente te explique cómo ha evolucionado el precio en esa zona?"
- "No confío en el proceso de compra en RD" → "¿Qué parte te genera más dudas — los contratos, la documentación, el constructor?"

URGENCIA (solo cuando aplique, nunca fabricada):
- "Esa zona tiene poco inventario disponible en ese rango ahora mismo. ¿Quieres que te reserve una llamada con el especialista?"
- "El mercado en esa zona ha estado muy activo este trimestre."
- Nunca inventes plazos ni uses "¡última oportunidad!".

MICRO-COMPROMISO antes del handoff:
"¿Te gustaría que te comparta 2-3 opciones concretas en esa zona con las condiciones que me mencionaste?"

CIERRE (cuando tengas propósito + zona + timeline + señal de pago + micro-compromiso):
"[Nombre], con lo que me contaste veo que hay opciones muy buenas para ti. Voy a asignarte con nuestro especialista — te va a contactar hoy. ¿Prefieres que te escriba por aquí o te llame?"
Siempre termina con una pregunta de micro-decisión, nunca con declaración pasiva.

RESUMEN para el agente (preparar antes del handoff):
LEAD: [nombre] | SCORE: HOT/WARM-A/WARM-B/COLD
Perfil: [local RD / diáspora / extranjero]
Busca: [tipo] en [zona] | [en plano / entrega inmediata]
Propósito: [vivir / invertir / Airbnb]
Budget: [rango] | Método: [efectivo / financiamiento / remesas]
Liquidez: [disponible ahora / en 60-90 días / indefinida]
Decisor: [solo / pareja / familia] | Timeline: [fecha o ventana]
Dolor/Urgencia: [frase literal del cliente] | Cita: [canal y disponibilidad]

REACTIVACIÓN (si no responde en 24h — enviar UNA sola vez):
"Hola [nombre], quedé pendiente de ayudarte con tu búsqueda. ¿Sigues interesado? Con gusto te conecto con un especialista."
</rules>

<output_format>
Formato WhatsApp:
- Máximo 2 oraciones por burbuja. Si necesitas más, divide en 2 mensajes.
- Un emoji por mensaje máximo (👋 al inicio, ✅ al confirmar). Nunca emojis en preguntas serias.
- Nunca listas con viñetas — suena a formulario.
- Una pregunta a la vez. Siempre conversacional.
- Si recibes transcripción de audio o descripción de imagen, trátala como mensaje normal.
</output_format>${customBlock}`.trim();
}

// ─── Historial de conversación ────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function getConversationHistory(contactId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("messages")
    .select("direction, content, is_automated")
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: true })
    .limit(40);

  if (!data?.length) return [];

  return data.map((m) => ({
    role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));
}

// ─── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Verify shared secret — called by the external Python WhatsApp agent
  const authHeader = request.headers.get("authorization");
  const secret = process.env.AVA_WEBHOOK_SECRET;
  if (!secret || !safeCompare(authHeader ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Rate limit: 60 requests per minute per source IP (Ava sends at most ~10/min)
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rl = await checkRateLimit(`ava:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  try {
    const body = (await request.json()) as {
      contact_id: string;
      message: string;
      contact_name?: string;
      phone?: string;
      // Multimedia fields (populated by whatsapp-agentkit after processing)
      media_type?: "audio" | "image" | "video" | "document";
      media_url?: string;
      media_content?: string; // transcription or image description
    };

    const { contact_id, message, contact_name, phone, media_type, media_url, media_content } =
      body;

    if (!contact_id || (!message && !media_content)) {
      return NextResponse.json(
        { error: "contact_id and message (or media_content) are required" },
        { status: 400 }
      );
    }

    if (!UUID_RE.test(contact_id)) {
      return NextResponse.json({ error: "contact_id inválido" }, { status: 400 });
    }

    const safeName = contact_name ? sanitizeField(contact_name, 100) : null;
    const safePhone = phone ? sanitizeField(phone, 30) : null;

    // Verify the contact exists
    const { data: contactExists, error: contactErr } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", contact_id)
      .single();

    if (contactErr || !contactExists) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }

    // Build user message content — include media context if present
    let userContent = message ?? "";

    if (media_type && media_content) {
      const mediaPrefix: Record<string, string> = {
        audio: "[Nota de voz transcrita]",
        image: "[Imagen recibida — descripción]",
        video: "[Video recibido — descripción]",
        document: "[Documento recibido]",
      };
      const prefix = mediaPrefix[media_type] ?? "[Media]";
      userContent = media_content
        ? `${prefix}: ${media_content}${message ? `\n\n${message}` : ""}`
        : userContent;
    }

    if (safeName) {
      const contextNote = `[Contexto: El lead se llama ${safeName}${safePhone ? `, tel: ${safePhone}` : ""}]`;
      userContent = `${contextNote}\n\n${userContent}`;
    }

    // Load config + history in parallel
    const [config, history] = await Promise.all([
      getAvaConfig(),
      getConversationHistory(contact_id),
    ]);

    const systemPrompt = buildSystemPrompt(config);

    // Build messages array for Chat Completions
    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...history,
      { role: "user", content: userContent },
    ];

    // Call GPT-4o via Chat Completions — no Assistants API overhead
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 500,
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      return NextResponse.json({ error: "No response from model" }, { status: 500 });
    }

    // Validate media_url against allowlist before persisting (M5)
    const safeMediaUrl =
      media_url && isAllowedMediaUrl(media_url) ? media_url : null;
    if (media_url && !safeMediaUrl) {
      console.warn("[ava] rejected media_url with disallowed domain:", media_url);
    }

    // Save outbound message + media fields if present
    await supabase.from("messages").insert({
      contact_id,
      direction: "outbound",
      channel: "whatsapp",
      content: responseText,
      is_automated: true,
      ...(safeMediaUrl ? { media_url: safeMediaUrl } : {}),
      ...(media_type ? { media_type } : {}),
    });

    return NextResponse.json({
      response: responseText,
      model: completion.model,
      usage: completion.usage,
    });
  } catch (error) {
    console.error("Ava API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
