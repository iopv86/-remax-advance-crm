import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Service-role client — used only after session auth is verified
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// E.164: optional leading +, then 7–15 digits
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;

interface SendMessageBody {
  contact_id: string;
  phone: string;
  content: string;
}

export async function POST(req: NextRequest) {
  // Explicit auth check (middleware already guards this route, but defense-in-depth)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  let body: SendMessageBody;
  try {
    body = await req.json() as SendMessageBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { contact_id, phone, content } = body;

  if (!contact_id || !phone || !content?.trim()) {
    return NextResponse.json(
      { error: "contact_id, phone y content son requeridos" },
      { status: 400 }
    );
  }

  if (!UUID_RE.test(contact_id)) {
    return NextResponse.json({ error: "contact_id inválido" }, { status: 400 });
  }

  const cleanPhone = phone.replace(/[\s\-().]/g, "");
  if (!PHONE_RE.test(cleanPhone)) {
    return NextResponse.json({ error: "Número de teléfono inválido" }, { status: 400 });
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length > 4096) {
    return NextResponse.json(
      { error: "El mensaje excede el límite de 4096 caracteres" },
      { status: 400 }
    );
  }

  // Verify contact_id exists to prevent orphan messages
  const { data: contactExists, error: contactErr } = await serviceSupabase
    .from("contacts")
    .select("id")
    .eq("id", contact_id)
    .single();

  if (contactErr || !contactExists) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  // Send via Meta Cloud API if credentials are available
  if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
    const normalizedPhone = cleanPhone.startsWith("+") ? cleanPhone.slice(1) : cleanPhone;
    const metaUrl = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
    const metaRes = await fetch(metaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizedPhone,
        type: "text",
        text: { body: trimmedContent },
      }),
    });

    if (!metaRes.ok) {
      const errBody = await metaRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: "Error enviando por WhatsApp", details: errBody },
        { status: 502 }
      );
    }
  }

  const { data: message, error } = await serviceSupabase
    .from("messages")
    .insert({
      contact_id,
      direction: "outbound",
      channel: "whatsapp",
      content: trimmedContent,
      is_automated: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message });
}
