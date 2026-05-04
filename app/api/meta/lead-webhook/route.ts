import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { fireCapiEvent } from "@/lib/meta-capi";

const GRAPH_VERSION = "v19.0";

// ── helpers ──────────────────────────────────────────────────────────────────

function verifySignature(rawBody: Buffer, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface FieldData {
  name: string;
  values: string[];
}

interface LeadFormData {
  id: string;
  field_data: FieldData[];
  ad_id?: string;
  campaign_id?: string;
}

function parseField(fields: FieldData[], name: string): string | null {
  return fields.find((f) => f.name === name)?.values?.[0]?.trim() || null;
}

async function fetchLeadData(leadgenId: string): Promise<LeadFormData | null> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}` +
    `?fields=field_data,ad_id,campaign_id&access_token=${token}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    console.error(`[lead-webhook] Graph API ${res.status} for leadgen_id ${leadgenId}`);
    return null;
  }
  return res.json() as Promise<LeadFormData>;
}

interface AssignedAgent {
  id: string;
  phone: string | null;
  full_name: string | null;
}

async function roundRobinAgent(db: ReturnType<typeof adminClient>): Promise<AssignedAgent | null> {
  // Pick the active agent with the fewest contacts assigned in the last 30 days
  const { data } = await db
    .from("agents")
    .select("id, phone, full_name")
    .eq("is_active", true)
    .in("role", ["agent", "admin"])
    .order("created_at")
    .limit(20);

  if (!data || data.length === 0) return null;
  if (data.length === 1) return data[0] as AssignedAgent;

  // Simple count-based round-robin: pick agent with fewest contacts in last 30d
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const counts: Record<string, number> = {};
  for (const a of data) counts[a.id] = 0;

  const { data: recent } = await db
    .from("contacts")
    .select("agent_id")
    .in("agent_id", (data as Array<{ id: string }>).map((a) => a.id))
    .gte("created_at", thirtyDaysAgo);

  for (const c of (recent ?? []) as Array<{ agent_id: string }>) {
    if (c.agent_id in counts) counts[c.agent_id]++;
  }

  const sorted = [...data].sort(
    (a: { id: string }, b: { id: string }) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0)
  );
  return sorted[0] as AssignedAgent;
}

function notifyAgent(agent: AssignedAgent, leadName: string, leadPhone: string | null): void {
  const webhookUrl = process.env.AVA_WEBHOOK_URL;
  if (!webhookUrl) return;

  const phone = agent.phone ?? process.env.AVA_NOTIFY_PHONE;
  if (!phone) return;

  const agentLabel = agent.full_name ?? "Agente";
  const digits = leadPhone?.replace(/\D/g, "") ?? "";
  const waLink = digits ? `\n📲 WhatsApp: https://wa.me/${digits}` : "";
  const message =
    `🔥 *LEAD NUEVO — ${leadName || "Sin nombre"}*\n` +
    `Asignado a: ${agentLabel}\n` +
    `📱 Teléfono: ${leadPhone || "No provisto"}${waLink}\n` +
    `\n⚡ Contacta en los próximos 5 minutos — las probabilidades de cierre caen 80% después de 30 min.\n` +
    `📋 CRM: https://remax-advance-crm.vercel.app/dashboard/contacts`;

  fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Notify-Secret": process.env.NOTIFY_SECRET ?? "",
    },
    body: JSON.stringify({ phone, message }),
  }).catch(() => {});
}

// Sends a WhatsApp template message directly to the lead on first contact.
// Requires: META_PHONE_NUMBER_ID in env + META_LEAD_TEMPLATE_NAME set after
// the template is approved in Meta Business Manager (24-48h review).
// Template should follow: "Hola {{1}}, soy Ava de RE/MAX Advance. Vi que te
// interesaste en nuestras propiedades. ¿Tienes un momento para contarme qué
// estás buscando?" — language: es, category: UTILITY
async function notifyLead(leadPhone: string | null, leadFirstName: string): Promise<void> {
  const templateName = process.env.META_LEAD_TEMPLATE_NAME;
  const accessToken  = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!templateName || !leadPhone || !accessToken || !phoneNumberId) return;

  const digits = leadPhone.replace(/\D/g, "");
  if (!digits) return;

  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: digits,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: leadFirstName || "hola" }],
          },
        ],
      },
    }),
  }).catch((err) => console.error("[lead-webhook] notifyLead error:", (err as Error).message));
}

// ── GET — Meta challenge verification ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode      = params.get("hub.mode");
  const token     = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ── POST — Lead intake ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Buffer raw body for HMAC verification
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload
  let payload: {
    object?: string;
    entry?: Array<{
      id: string;
      changes?: Array<{
        field: string;
        value: { leadgen_id: string; page_id?: string; ad_id?: string };
      }>;
    }>;
  };

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object !== "page") {
    // Not a leadgen event — acknowledge silently
    return NextResponse.json({ received: true });
  }

  const db = adminClient();

  // 3. Process each leadgen change
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;

      const { leadgen_id } = change.value;
      if (!leadgen_id) continue;

      // Fetch field_data from Meta Graph API
      const lead = await fetchLeadData(leadgen_id);
      if (!lead?.field_data) continue;

      const fields = lead.field_data;
      const rawName  = parseField(fields, "full_name") ??
                       parseField(fields, "name") ?? "";
      const email    = parseField(fields, "email");
      const phone    = parseField(fields, "phone_number") ??
                       parseField(fields, "phone");
      const [firstName, ...rest] = rawName.split(" ");
      const lastName = rest.join(" ") || null;

      // 4. Insert contact — ON CONFLICT (meta_lead_id) DO NOTHING
      const agent = await roundRobinAgent(db);
      if (!agent) {
        console.error("[lead-webhook] No active agents found for assignment");
        continue;
      }
      const agentId = agent.id;

      const { data: inserted, error: insertErr } = await db
        .from("contacts")
        .insert({
          first_name:       firstName || "Lead",
          last_name:        lastName,
          email:            email || null,
          phone:            phone || null,
          whatsapp_number:  phone || null,
          source:           "lead_form",
          meta_lead_id:     leadgen_id,
          meta_campaign_id: lead.campaign_id ?? change.value.ad_id ?? null,
          agent_id:         agentId,
        })
        .select("id, email, phone")
        .maybeSingle();

      // Duplicate — meta_lead_id already exists; skip silently
      if (insertErr) {
        const isDuplicate =
          insertErr.code === "23505" ||
          insertErr.message.includes("idx_contacts_meta_lead_id");
        if (!isDuplicate) {
          console.error("[lead-webhook] Insert error:", insertErr.message);
        }
        continue;
      }

      if (!inserted) continue;

      // 5. Create deal at lead_captured stage
      await db.from("deals").insert({
        contact_id:   inserted.id,
        agent_id:     agentId,
        stage:        "lead_captured",
        currency:     "USD",
      });

      // 6. Fire CAPI Lead event (fire-and-forget — must not block <5s response)
      fireCapiEvent({
        stage: "lead_captured",
        email: inserted.email,
        phone: inserted.phone,
      }).catch((err) =>
        console.error("[lead-webhook] CAPI error:", (err as Error).message)
      );

      // 7. Notify assigned agent + attempt first-contact to lead (fire-and-forget)
      notifyAgent(agent, rawName, phone);
      notifyLead(phone, firstName).catch(() => {});
    }
  }

  // Meta requires 200 in < 5 s
  return NextResponse.json({ received: true });
}
