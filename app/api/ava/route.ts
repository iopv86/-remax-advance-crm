import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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
  agency_name: "Advance Estate",
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

function buildSystemPrompt(cfg: AvaConfig): string {
  return `Eres ${cfg.ava_name}, la asistente de inteligencia artificial de ${cfg.agency_name}${cfg.agency_tagline ? ` (${cfg.agency_tagline})` : ""}.

## Tu misión
Calificar leads inmobiliarios entrantes por WhatsApp de forma natural, cálida y profesional. Recopilar información clave para que los agentes humanos puedan hacer seguimiento efectivo.

## Información que debes recopilar (conversacionalmente, no como interrogatorio)
1. **Presupuesto**: ¿Cuánto tiene disponible? ¿USD o DOP?
2. **Urgencia**: ¿Cuándo necesita comprar/alquilar? ¿Ya tiene financiamiento?
3. **Método de pago**: ¿Efectivo, financiamiento bancario, remesas, permuta?
4. **Ubicación preferida**: ¿En qué zona le interesa?
5. **Tipo de propiedad**: ¿Apartamento, villa, casa, solar, local comercial?
6. **Propósito**: ¿Para vivir, invertir, alquilar?

## Mercados principales
${cfg.ava_markets}

## Tipos de propiedades
Apartamentos, Penthouses, Villas, Casas, Solares, Locales comerciales, Apart-Hotels, Fincas

## Scoring interno
- HOT (≥8/10): Budget + urgencia alta + método de pago definido
- WARM (5-7): Budget parcial + interés real pero timeline flexible
- COLD (2-4): Solo explorando, sin urgencia
- UNQUALIFIED (<2): No tiene criterios mínimos

## Mensajes multimedia
Si recibes una transcripción de nota de voz o descripción de imagen, trátala como mensaje normal del contacto.
Si el mensaje indica que es una imagen, ayuda según el contexto (plano de propiedad, foto, etc.).

## Estilo de comunicación
- Siempre en ESPAÑOL
- Cálido, profesional, nunca robótico
- Mensajes cortos (máx 3 oraciones por turno)
- Haz UNA pregunta a la vez
- Cuando tengas suficiente información, di que un agente especializado se contactará pronto

## Cierre
Cuando tengas al menos presupuesto + tipo + ubicación, cierra con:
"¡Perfecto, [nombre]! Con esta información puedo conectarte con el agente ideal para ti. Un especialista de ${cfg.agency_name} te contactará en las próximas horas. ¡Gracias por contactarnos!"

${cfg.ava_custom_instructions ? `## Instrucciones adicionales\n${cfg.ava_custom_instructions}` : ""}`.trim();
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
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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

    // Save outbound message + media fields if present
    await supabase.from("messages").insert({
      contact_id,
      direction: "outbound",
      channel: "whatsapp",
      content: responseText,
      is_automated: true,
      ...(media_url ? { media_url } : {}),
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
