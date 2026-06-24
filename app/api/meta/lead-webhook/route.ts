import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { fireCapiEvent } from "@/lib/meta-capi";
import { attributionColumns, buildLeadFormAnswers, fetchCampaignAttribution, hasCustomAnswers, parseBudgetRange, pickField } from "@/lib/meta-leads";

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
  form_id?: string;
  platform?: string;
}

function parseField(fields: FieldData[], name: string): string | null {
  return fields.find((f) => f.name === name)?.values?.[0]?.trim() || null;
}

async function fetchLeadData(leadgenId: string): Promise<LeadFormData | null> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}` +
    `?fields=field_data,ad_id,campaign_id,form_id,platform`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
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

// E.164-like phone validation — single source of truth ported from Ava (tools.py).
// Rejects UUIDs and placeholders so junk never lands in contacts.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const E164_RE = /^\+?[1-9]\d{7,14}$/;

function isValidPhone(phone: string | null): boolean {
  if (!phone) return false;
  if (UUID_RE.test(phone)) return false;
  if (phone.includes("[") || phone.includes(" ")) return false;
  return E164_RE.test(phone);
}

// Single round-robin authority: the atomic SQL RPC `assign_next_rr_agent()`
// (SECURITY DEFINER, FOR UPDATE SKIP LOCKED). Same authority Ava uses — no
// second JS implementation that could split-brain the agent pool.
async function assignRrAgent(db: ReturnType<typeof adminClient>): Promise<AssignedAgent | null> {
  const { data: agentId, error } = await db.rpc("assign_next_rr_agent");
  if (error || !agentId) {
    if (error) console.error("[lead-webhook] assign_next_rr_agent error:", error.message);
    return null;
  }
  const { data: agent } = await db
    .from("agents")
    .select("id, phone, full_name")
    .eq("id", agentId as string)
    .maybeSingle();
  return (agent as AssignedAgent) ?? { id: agentId as string, phone: null, full_name: null };
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

  // Gate: only process leads when explicitly enabled.
  // Set META_LEAD_WEBHOOK_ENABLED=true in Vercel env vars to activate.
  // Keeps the HMAC check + 200 response active (Meta requires it) without
  // creating contacts from campaigns not yet routed through this CRM.
  if (process.env.META_LEAD_WEBHOOK_ENABLED !== "true") {
    console.log("[lead-webhook] Intake disabled (META_LEAD_WEBHOOK_ENABLED != true). Payload acknowledged but not processed.");
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
      const rawPhone = parseField(fields, "phone_number") ??
                       parseField(fields, "phone");
      // E.164 validation — reject junk/UUIDs so they never enter contacts.
      const phone    = isValidPhone(rawPhone) ? rawPhone : null;
      if (rawPhone && !phone) {
        console.warn("[lead-webhook] Invalid phone rejected, falling back to meta_lead_id dedup");
      }
      const [firstName, ...rest] = rawName.split(" ");
      const lastName = rest.join(" ") || null;

      // Lossless capture of every answered question + best-effort budget mapping.
      const leadFormAnswers = buildLeadFormAnswers(fields, leadgen_id);
      const budget = parseBudgetRange(
        pickField(fields, ["presupuesto", "presupuesto_estimado", "budget", "rango_de_presupuesto", "cuanto_desea_invertir"])
      );

      // 4. Upsert contact — deduplicate on phone first, then meta_lead_id.
      //    Never overwrite agent_id on an existing contact (would steal the lead).
      let existingId: string | null = null;
      let existingAgentId: string | null = null;
      if (phone) {
        const { data: byPhone } = await db
          .from("contacts")
          .select("id, agent_id")
          .eq("phone", phone)
          .maybeSingle();
        if (byPhone) { existingId = byPhone.id; existingAgentId = byPhone.agent_id; }
      }
      if (!existingId) {
        const { data: byMeta } = await db
          .from("contacts")
          .select("id, agent_id")
          .eq("meta_lead_id", leadgen_id)
          .maybeSingle();
        if (byMeta) { existingId = byMeta.id; existingAgentId = byMeta.agent_id; }
      }

      // Helper: create the holding-stage deal, never with a null agent (agent_id is NOT NULL).
      // Idempotent: skip if the contact already has an open intake deal.
      const createIntakeDeal = async (contactId: string, agentId: string) => {
        const { data: openDeal } = await db
          .from("deals")
          .select("id")
          .eq("contact_id", contactId)
          .in("stage", ["nuevo_sin_contactar", "lead_captured"])
          .limit(1)
          .maybeSingle();
        if (openDeal) return; // already in intake/pipeline — don't duplicate
        await db.from("deals").insert({
          contact_id: contactId,
          agent_id:   agentId,
          stage:      "nuevo_sin_contactar",
          currency:   "USD",
        });
      };

      if (existingId) {
        // Contact exists. Resolve a non-null agent: keep current, else assign via RPC.
        let agent: AssignedAgent | null = null;
        let agentId = existingAgentId;
        if (!agentId) {
          agent = await assignRrAgent(db);
          if (!agent) { console.error("[lead-webhook] No agent for existing contact"); continue; }
          agentId = agent.id;
          await db.from("contacts")
            .update({ agent_id: agentId, assigned_at: new Date().toISOString() })
            .eq("id", existingId);
        }
        if (hasCustomAnswers(fields)) {
          const { data: cur } = await db.from("contacts").select("lead_form_answers").eq("id", existingId).maybeSingle();
          if (cur && cur.lead_form_answers == null) {
            await db.from("contacts").update({ lead_form_answers: leadFormAnswers }).eq("id", existingId);
          }
        }
        // Backfill campaign attribution only if never attributed (first-touch wins).
        if (lead.campaign_id || lead.ad_id || change.value.ad_id) {
          const { data: cur } = await db
            .from("contacts").select("meta_campaign_id, meta_ad_id").eq("id", existingId).maybeSingle();
          if (cur && cur.meta_campaign_id == null && cur.meta_ad_id == null) {
            const attrInput = { ...lead, ad_id: lead.ad_id ?? change.value.ad_id };
            // Webhook does not list forms, so it has no form name to supply.
            const attr = await fetchCampaignAttribution(attrInput, process.env.META_ACCESS_TOKEN ?? "", null);
            await db.from("contacts").update(attributionColumns(attr)).eq("id", existingId);
          }
        }
        await createIntakeDeal(existingId, agentId);
        fireCapiEvent({ stage: "lead_captured", email, phone }).catch((err) =>
          console.error("[lead-webhook] CAPI error:", (err as Error).message));
        if (agent) { notifyAgent(agent, rawName, phone); }
        continue;
      }

      // New contact — assign agent via the single RPC authority.
      const agent = await assignRrAgent(db);
      if (!agent) {
        console.error("[lead-webhook] No active agents found for assignment");
        continue;
      }
      const agentId = agent.id;

      // De-conflated, enriched Meta attribution (IDs always; names best-effort).
      // The lead node's ad_id is canonical; fall back to the webhook change value.
      const attrInput = { ...lead, ad_id: lead.ad_id ?? change.value.ad_id };
      const attr = await fetchCampaignAttribution(attrInput, process.env.META_ACCESS_TOKEN ?? "", null);

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
          ...attributionColumns(attr),
          agent_id:         agentId,
          assigned_at:      new Date().toISOString(),
          lead_form_answers: leadFormAnswers,
          ...(budget ? { budget_min: budget.min, budget_max: budget.max, budget_currency: budget.currency } : {}),
        })
        .select("id, email, phone")
        .maybeSingle();

      if (insertErr) {
        // 23505 = unique violation — race condition, another request won
        if (insertErr.code === "23505") {
          console.warn("[lead-webhook] Race condition on insert, skipping:", insertErr.message);
        } else {
          console.error("[lead-webhook] Insert error:", insertErr.message);
        }
        continue;
      }

      if (!inserted) continue;

      // 5. Create holding-stage deal (nuevo_sin_contactar) with the assigned agent
      await createIntakeDeal(inserted.id, agentId);

      // 6. Fire CAPI Lead event — pass "lead_captured" (the Meta event key); the
      //    internal stage is nuevo_sin_contactar, which is not in the CAPI map.
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
