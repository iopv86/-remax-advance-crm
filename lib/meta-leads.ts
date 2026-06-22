import { adminClient } from "@/lib/supabase/admin";
import { fireCapiEvent } from "@/lib/meta-capi";

export const GRAPH_VERSION = "v19.0";

export interface FieldData {
  name: string;
  values: string[];
}

export interface LeadFormData {
  id: string;
  field_data: FieldData[];
  ad_id?: string;
  campaign_id?: string;
}

type Db = ReturnType<typeof adminClient>;

// ── field parsing ─────────────────────────────────────────────────────────────

/** Find a field value by trying several candidate names (Meta uses snake_case standard fields). */
export function pickField(fields: FieldData[], names: string[]): string | null {
  for (const n of names) {
    const f = fields.find((x) => x.name === n);
    const v = f?.values?.[0]?.trim();
    if (v) return v;
  }
  return null;
}

// ── phone validation (E.164, rejects UUIDs/placeholders) ───────────────────────

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const E164_RE = /^\+?[1-9]\d{7,14}$/;

export function isValidPhone(phone: string | null): boolean {
  if (!phone) return false;
  if (UUID_RE.test(phone)) return false;
  if (phone.includes("[") || phone.includes(" ")) return false;
  return E164_RE.test(phone);
}

// ── round-robin (single authority: SQL RPC) ────────────────────────────────────

export interface AssignedAgent {
  id: string;
  phone: string | null;
  full_name: string | null;
}

export async function assignRrAgent(db: Db): Promise<AssignedAgent | null> {
  const { data: agentId, error } = await db.rpc("assign_next_rr_agent");
  if (error || !agentId) {
    if (error) console.error("[meta-leads] assign_next_rr_agent error:", error.message);
    return null;
  }
  const { data: agent } = await db
    .from("agents")
    .select("id, phone, full_name")
    .eq("id", agentId as string)
    .maybeSingle();
  return (agent as AssignedAgent) ?? { id: agentId as string, phone: null, full_name: null };
}

// ── agent + lead notifications (fire-and-forget) ───────────────────────────────

export function notifyAgent(agent: AssignedAgent, leadName: string, leadPhone: string | null): void {
  const webhookUrl = process.env.AVA_WEBHOOK_URL;
  if (!webhookUrl) return;
  const phone = agent.phone ?? process.env.AVA_NOTIFY_PHONE;
  if (!phone) return;
  const agentLabel = agent.full_name ?? "Agente";
  const digits = leadPhone?.replace(/\D/g, "") ?? "";
  const waLink = digits ? `\nWhatsApp: https://wa.me/${digits}` : "";
  const message =
    `*LEAD NUEVO (Formulario) -- ${leadName || "Sin nombre"}*\n` +
    `Asignado a: ${agentLabel}\n` +
    `Telefono: ${leadPhone || "No provisto"}${waLink}\n` +
    `\nContacta en los proximos 5 minutos -- las probabilidades de cierre caen 80% despues de 30 min.\n` +
    `CRM: https://remax-advance-crm.vercel.app/dashboard/leads-entrantes`;
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Notify-Secret": process.env.NOTIFY_SECRET ?? "" },
    body: JSON.stringify({ phone, message }),
  }).catch(() => {});
}

export async function notifyLead(leadPhone: string | null, leadFirstName: string): Promise<void> {
  const templateName = process.env.META_LEAD_TEMPLATE_NAME;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!templateName || !leadPhone || !accessToken || !phoneNumberId) return;
  const digits = leadPhone.replace(/\D/g, "");
  if (!digits) return;
  await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: digits,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es" },
        components: [{ type: "body", parameters: [{ type: "text", text: leadFirstName || "hola" }] }],
      },
    }),
  }).catch((err) => console.error("[meta-leads] notifyLead error:", (err as Error).message));
}

// ── core: process one leadgen lead into the CRM ────────────────────────────────

export interface ProcessResult {
  created: boolean;
  contactId: string | null;
  reason: string;
}

/**
 * Idempotent: creates a contact (source=lead_form) + intake deal (nuevo_sin_contactar)
 * with a round-robin agent, fires CAPI Lead, notifies. Safe to call repeatedly for the
 * same lead (deduped by phone, then meta_lead_id; intake deal deduped per contact).
 * Used by BOTH the push webhook and the pull poller.
 */
export async function processLead(db: Db, lead: LeadFormData): Promise<ProcessResult> {
  const fields = lead.field_data ?? [];
  const rawName = pickField(fields, ["full_name", "full name", "name", "nombre", "nombre_completo"]) ?? "";
  const email = pickField(fields, ["email", "correo", "correo_electronico"]);
  const rawPhone = pickField(fields, ["phone_number", "phone", "telefono", "teléfono", "numero", "número"]);
  const phone = isValidPhone(rawPhone) ? rawPhone : null;
  const [firstName, ...rest] = rawName.split(" ");
  const lastName = rest.join(" ") || null;

  // Dedup by phone, then meta_lead_id
  let existingId: string | null = null;
  let existingAgentId: string | null = null;
  if (phone) {
    const { data } = await db.from("contacts").select("id, agent_id").eq("phone", phone).maybeSingle();
    if (data) { existingId = data.id; existingAgentId = data.agent_id; }
  }
  if (!existingId) {
    const { data } = await db.from("contacts").select("id, agent_id").eq("meta_lead_id", lead.id).maybeSingle();
    if (data) { existingId = data.id; existingAgentId = data.agent_id; }
  }

  const createIntakeDeal = async (contactId: string, agentId: string) => {
    const { data: openDeal } = await db
      .from("deals").select("id").eq("contact_id", contactId)
      .in("stage", ["nuevo_sin_contactar", "lead_captured"]).limit(1).maybeSingle();
    if (openDeal) return false;
    await db.from("deals").insert({
      contact_id: contactId, agent_id: agentId, stage: "nuevo_sin_contactar", currency: "USD",
    });
    return true;
  };

  if (existingId) {
    let agent: AssignedAgent | null = null;
    let agentId = existingAgentId;
    if (!agentId) {
      agent = await assignRrAgent(db);
      if (!agent) return { created: false, contactId: existingId, reason: "no_agent" };
      agentId = agent.id;
      await db.from("contacts").update({ agent_id: agentId, assigned_at: new Date().toISOString() }).eq("id", existingId);
    }
    const dealCreated = await createIntakeDeal(existingId, agentId);
    if (dealCreated) {
      fireCapiEvent({ stage: "lead_captured", email, phone }).catch(() => {});
      if (agent) notifyAgent(agent, rawName, phone);
    }
    return { created: dealCreated, contactId: existingId, reason: dealCreated ? "existing_contact_new_deal" : "already_in_pipeline" };
  }

  // New contact
  const agent = await assignRrAgent(db);
  if (!agent) return { created: false, contactId: null, reason: "no_agent" };
  const agentId = agent.id;

  const { data: inserted, error: insertErr } = await db
    .from("contacts")
    .insert({
      first_name: firstName || "Lead",
      last_name: lastName,
      email: email || null,
      phone: phone || null,
      whatsapp_number: phone || null,
      source: "lead_form",
      meta_lead_id: lead.id,
      meta_campaign_id: lead.campaign_id ?? lead.ad_id ?? null,
      agent_id: agentId,
      assigned_at: new Date().toISOString(),
    })
    .select("id, email, phone")
    .maybeSingle();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // race: another path won — find winner and ensure a deal exists
      const { data: winner } = await db.from("contacts").select("id").eq("meta_lead_id", lead.id).maybeSingle();
      if (winner) { await createIntakeDeal(winner.id, agentId); return { created: false, contactId: winner.id, reason: "race_winner" }; }
    }
    console.error("[meta-leads] insert error:", insertErr.message);
    return { created: false, contactId: null, reason: "insert_error" };
  }
  if (!inserted) return { created: false, contactId: null, reason: "no_insert" };

  await createIntakeDeal(inserted.id, agentId);
  fireCapiEvent({ stage: "lead_captured", email: inserted.email, phone: inserted.phone }).catch(() => {});
  notifyAgent(agent, rawName, phone);
  notifyLead(phone, firstName).catch(() => {});
  return { created: true, contactId: inserted.id, reason: "new_contact" };
}
