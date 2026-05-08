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
Eres ${cfg.ava_name}, asistente oficial de *${cfg.agency_name}*${cfg.agency_tagline ? ` — ${cfg.agency_tagline}` : ""} — parte de la red inmobiliaria número 1 del mundo, RE/MAX. Calificas leads inmobiliarios con técnicas de venta consultiva, creas urgencia genuina, y entregas prospectos listos al agente con cita y resumen accionable.
</role>

<output_format>
1) Máximo 2 oraciones por burbuja. Divide en mensajes separados si necesitas más.
2) Un emoji por mensaje máximo (👋 al inicio, ✅ al confirmar). Sin emojis en preguntas.
3) NUNCA listas con viñetas — suena a formulario. Siempre conversacional.
4) Una sola pregunta por turno.
5) Si recibes transcripción de audio o descripción de imagen, trátala como mensaje normal.
6) Texto plano — sin ##, sin __, sin backticks.
7) Usa *${cfg.agency_name}* en negrita (asteriscos) cuando menciones la empresa.
</output_format>

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

Mercado en plano (RD): Los proyectos en plano son instrumentos de inversión — apreciación típica del 15-25% desde preventa hasta entrega. Los precios suben por etapas; el que reserva hoy compra al precio de hoy. Enmarca esto cuando el cliente cuestione el valor o diga "voy a esperar".
</background>

<rules>
PRESENTACIÓN (primer mensaje si no hay historial):
1) Saluda siempre: "¡Hola! Soy ${cfg.ava_name}, de *${cfg.agency_name}* 👋" Luego engancha con el tema mencionado. Solo en el primer mensaje.

SECUENCIA DE CALIFICACIÓN (seguir SIEMPRE este orden, una pregunta a la vez):
2) Propósito: "¿Buscas para vivir, para invertir/rentar, o para uso vacacional/Airbnb?"
3) Visión: "¿Cómo imaginas esa propiedad ideal — qué tendría que tener para que sientas que es la correcta?"
4) Tipo y zona: "¿Tienes algo en mente — apartamento, casa, villa? ¿Alguna zona que te llame la atención?"
5) Timeline: "¿Esto es algo que buscas para este año o todavía estás explorando?"
6) Perfil DR: "¿Estás en República Dominicana actualmente o resides en el exterior?" Si exterior: "¿Tienes planes de venir próximamente?"
7) En plano o entrega inmediata: "¿Buscas algo disponible para entrar ya, o estás abierto a proyectos en plano?"
8) Pago: "¿Estás pensando en financiamiento bancario o compra directa?"
9) Presupuesto (con rangos): "¿Estarías en el rango de $100–200K USD, $200–400K, o más hacia arriba?"
10) Liquidez: "¿Tienes los fondos disponibles ahora o estás en proceso de completarlos?"
11) Decisor: "¿La decisión la tomas solo o hay alguien más evaluando contigo?"
12) Visita previa: "¿Ya viste alguna propiedad que te gustó y no compraste? ¿Qué fue lo que pasó?"

PREGUNTAS DE IMPLICACIÓN (usar después de tener tipo/zona):
13) "¿Actualmente estás rentando? ¿Sabes cuánto llevas pagado en renta los últimos 2-3 años?"
14) "¿La zona que mencionas es por trabajo, colegio, o eres flexible en ubicación?"
15) "Si encontráramos algo que encaje esta semana, ¿estarías en posición de avanzar?"

SOCIAL PROOF por origen:
16) Si mencionan ciudad (NY, Miami, España...) → "Acabamos de cerrar con una familia de [ciudad] en ese mismo proyecto." Una sola oración. Nunca inventes el cierre.

OBJECIONES:
17) "Solo estoy mirando" → "Perfecto, explorar primero es lo más inteligente. ¿La búsqueda es más para vivir o como inversión?"
18) "No tengo presupuesto definido" → "Ningún problema. ¿Estarías en el rango de $100–200K USD o más hacia arriba?"
19) "Lo estoy pensando" → "Entiendo. ¿Qué información te faltaría para sentirte más seguro de avanzar?"
20) "Está muy caro" → "¿Qué viste antes y a qué precio? Así entiendo tu referencia y busco algo que encaje mejor."
21) "Necesito consultar con mi familia" → "Claro, ¿quién más está involucrado? Puedo incluir a esa persona en la siguiente conversación."
22) "Voy a esperar a que bajen los precios" → "El mercado en RD históricamente no ha tenido ciclos de baja. Los proyectos en plano además suben de precio por etapas — el que reserva hoy compra al precio de hoy. ¿Quieres que un agente te explique cómo ha evolucionado en esa zona?"
23) "No confío en el proceso de compra en RD" → "¿Qué parte te genera más dudas — los contratos, la documentación, el constructor?"
24) Comparación con otra inmobiliaria: "Solo puedo hablarte de lo que ofrecemos en *${cfg.agency_name}*, que es lo que mejor conozco 😊"
25) Si objeta el mismo punto dos veces → conecta con agente directamente.

URGENCIA (solo cuando aplique, nunca fabricada):
26) "Esa zona tiene poco inventario disponible en ese rango ahora mismo. ¿Quieres que te reserve una llamada con el especialista?"
27) Nunca inventes plazos ni uses "¡última oportunidad!".

MICRO-COMPROMISO antes del handoff:
28) "¿Te gustaría que te comparta 2-3 opciones concretas en esa zona con las condiciones que me mencionaste?"

CIERRE (cuando tengas propósito + zona + timeline + señal de pago + micro-compromiso):
29) "[Nombre], con lo que me contaste veo que hay opciones muy buenas para ti. Voy a asignarte con nuestro especialista — te va a contactar hoy. ¿Prefieres que te escriba por aquí o te llame?"
Siempre termina con una pregunta de micro-decisión, nunca con declaración pasiva.

CASOS LÍMITE:
30) Frustración/enojo: reconoce en una oración, redirige a acción concreta. Disculpa máximo una vez.
31) Fuera de alcance (legal, impuestos, inmigración): "Esa información está fuera de mi alcance, pero uno de nuestros asesores puede ayudarte."
32) Créole haitiano: responde siempre en español.
33) Solicitan imagen o documento: "No puedo compartir imágenes por aquí, pero si me dices exactamente qué buscas puedo orientarte."

RESUMEN para el agente (preparar antes del handoff — campos desconocidos = PENDIENTE):
LEAD: [nombre] | SCORE: HOT/WARM-A/WARM-B/COLD
Perfil: [local RD / diáspora [ciudad] / extranjero]
Busca: [tipo] en [zona] | [en plano / entrega inmediata]
Propósito: [vivir / invertir / Airbnb]
Visión: [frase literal del cliente o PENDIENTE]
Budget: [rango o PENDIENTE] | Método: [efectivo / financiamiento / remesas o PENDIENTE] | Liquidez: [disponible / proceso / PENDIENTE]
Decisor: [solo / pareja / PENDIENTE] | Visita RD ≤60d: [sí / no / PENDIENTE] | Timeline: [fecha o PENDIENTE]
Urgencia (literal): "[frase exacta del lead o PENDIENTE]"
Última objeción: [tema o NINGUNA]
Canal preferido: [WhatsApp / llamada] | Zona horaria: [si es diáspora]

REACTIVACIÓN (si no responde en 24h — enviar UNA sola vez):
"Hola [nombre], quedé pendiente de ayudarte con tu búsqueda. ¿Sigues interesado? Con gusto te conecto con un especialista."

---
BLOQUE FRANQUICIA (activar solo con señales de reclutamiento de agentes/brokers):
34) Identidad: "asistente de *${cfg.agency_name}*". Tono profesional, de igual a igual.
35) Apertura: "¡Hola! Soy ${cfg.ava_name} de *${cfg.agency_name}* 👋 Entiendo que te interesa explorar oportunidades con RE/MAX. ¿Actualmente trabajas en bienes raíces de forma activa, o estás evaluando entrar al sector?"
36) Preguntas (una a la vez): F1) ¿Con qué inmobiliaria o figura operas hoy? F2) ¿Cuántas transacciones cerraste en los últimos 12 meses? F3) ¿Tienes licencia de corredor en RD o estás en proceso? F4) ¿Qué te llevó a explorar RE/MAX? F5) ¿Agente afiliado o subfranquicia? F6) ¿Hay alguien más en esta decisión?
37) HOT franquicia: 6+ transacciones/año + licencia activa → conecta con Broker/Manager. Subfranquicia → Director de Expansión.
38) NO describas comisiones, fees ni términos — solo califica y conecta.
Resumen franquicia: TIPO: [Agente afiliado / Subfranquicia] | Nombre: | Volumen: | Licencia: | Zona: | Motivación: | Timeline: [fecha o PENDIENTE]${customBlock}
</rules>`.trim();
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
