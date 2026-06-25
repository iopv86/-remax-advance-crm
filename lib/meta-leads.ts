import { adminClient } from "@/lib/supabase/admin";
import { enqueueCapiEvent } from "@/lib/meta-capi";
import type { LeadFormAnswers } from "@/lib/types";

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
  form_id?: string;
  platform?: string;
}

type Db = ReturnType<typeof adminClient>;

// ── campaign attribution ────────────────────────────────────────────────────

/** Full Meta attribution captured at intake. IDs always; names best-effort. */
export interface CampaignAttribution {
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  form_name: string | null;
  platform: string | null;
}

interface AdNode {
  name?: string;
  adset?: { id?: string; name?: string };
  campaign?: { id?: string; name?: string };
}

/**
 * Resolves campaign/adset/ad/form/platform for a lead. IDs come straight off the
 * lead node (always stored). Names require a follow-up `/{ad_id}` call that needs
 * ads_read on the token — wrapped so ANY failure degrades to null names without
 * ever throwing. Lead intake must never block on enrichment.
 *
 * Pass the USER token (META_ACCESS_TOKEN) — ads permissions live there, not on
 * the derived page token. `formName` lets the poller supply the name it already
 * lists (the lead node only exposes form_id).
 */
export async function fetchCampaignAttribution(
  lead: LeadFormData,
  token: string,
  formName?: string | null,
): Promise<CampaignAttribution> {
  const adId = lead.ad_id ?? null;
  const attr: CampaignAttribution = {
    campaign_id: lead.campaign_id ?? null,
    campaign_name: null,
    adset_id: null,
    adset_name: null,
    ad_id: adId,
    ad_name: null,
    form_name: formName ?? null,
    platform: lead.platform ?? null,
  };
  if (!adId || !token) return attr;
  // 4s budget so a slow Graph call can never block lead intake (webhook 5s SLA).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const fields = encodeURIComponent("name,adset{id,name},campaign{id,name}");
    // Token in Authorization header (NOT the query string) so it never lands in
    // outbound-request logs/APM traces.
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${adId}?fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, next: { revalidate: 0 } },
    );
    if (!res.ok) {
      console.error(`[meta-leads] ad enrichment ${res.status} for ad ${adId}`);
      return attr;
    }
    const node = (await res.json()) as AdNode;
    attr.ad_name = node.name ?? null;
    attr.adset_id = node.adset?.id ?? null;
    attr.adset_name = node.adset?.name ?? null;
    // campaign.id should equal lead.campaign_id; keep the lead-node id canonical.
    attr.campaign_id = lead.campaign_id ?? node.campaign?.id ?? null;
    attr.campaign_name = node.campaign?.name ?? null;
  } catch (e) {
    console.error("[meta-leads] ad enrichment error:", (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
  return attr;
}

/** Map a CampaignAttribution into the contacts column set (insert/update payload). */
export function attributionColumns(attr: CampaignAttribution) {
  return {
    meta_campaign_id: attr.campaign_id,
    meta_campaign_name: attr.campaign_name,
    meta_adset_id: attr.adset_id,
    meta_adset_name: attr.adset_name,
    meta_ad_id: attr.ad_id,
    meta_ad_name: attr.ad_name,
    meta_form_name: attr.form_name,
    meta_platform: attr.platform,
  };
}

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

// ── lead form answer capture (lossless) ────────────────────────────────────────

/** Field names already mapped to typed contact columns — excluded from "custom answers". */
const CORE_FIELD_NAMES = new Set([
  "full_name", "full name", "name", "nombre", "nombre_completo",
  "email", "correo", "correo_electronico",
  "phone_number", "phone", "telefono", "teléfono", "numero", "número",
]);

/**
 * Builds the lossless jsonb captured into contacts.lead_form_answers.
 * Stores EVERY field (name + values) so no answered question is ever discarded.
 * Meta's leads edge does not return the human question text, so label === name.
 */
export function buildLeadFormAnswers(fields: FieldData[], leadId: string, formId?: string | null): LeadFormAnswers {
  return {
    lead_id: leadId,
    form_id: formId ?? null,
    captured_at: new Date().toISOString(),
    fields: (fields ?? []).map((f) => ({
      name: f.name,
      label: f.name,
      values: Array.isArray(f.values) ? f.values : [],
    })),
  };
}

/** True when the lead has at least one custom (non name/email/phone) answer worth keeping. */
export function hasCustomAnswers(fields: FieldData[]): boolean {
  return (fields ?? []).some((f) => !CORE_FIELD_NAMES.has(f.name) && (f.values?.[0]?.trim()));
}

/**
 * Best-effort parse of a free-text budget answer into { min, max, currency }.
 * Fails safe: returns null on no confident match (raw answer stays in jsonb).
 * Handles: "50000", "50k", "50,000-80,000", "US$50000 a 80000", "RD$ 3.5M".
 */
export function parseBudgetRange(raw: string | null): { min: number | null; max: number | null; currency: "USD" | "DOP" } | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  const currency: "USD" | "DOP" = /rd\$|rd |dop|pesos/.test(text) ? "DOP" : "USD";
  // Extract numbers, expanding k/m suffixes; strip thousands separators.
  const matches = [...text.matchAll(/(\d[\d.,]*)\s*(k|m|mil|millones|millón|millon)?/g)];
  const nums: number[] = [];
  for (const m of matches) {
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(n)) continue;
    const suffix = m[2];
    if (suffix === "k" || suffix === "mil") n *= 1_000;
    else if (suffix === "m" || suffix === "millones" || suffix === "millón" || suffix === "millon") n *= 1_000_000;
    if (n >= 1000) nums.push(n); // ignore stray small numbers (e.g. "2 habitaciones")
  }
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max: max === min ? null : max, currency };
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
export async function processLead(db: Db, lead: LeadFormData, formName?: string | null): Promise<ProcessResult> {
  const fields = lead.field_data ?? [];
  const rawName = pickField(fields, ["full_name", "full name", "name", "nombre", "nombre_completo"]) ?? "";
  const email = pickField(fields, ["email", "correo", "correo_electronico"]);
  const rawPhone = pickField(fields, ["phone_number", "phone", "telefono", "teléfono", "numero", "número"]);
  const phone = isValidPhone(rawPhone) ? rawPhone : null;
  const [firstName, ...rest] = rawName.split(" ");
  const lastName = rest.join(" ") || null;

  // Lossless capture of every answered question + best-effort budget mapping.
  const leadFormAnswers = buildLeadFormAnswers(fields, lead.id);
  const budget = parseBudgetRange(
    pickField(fields, ["presupuesto", "presupuesto_estimado", "budget", "rango_de_presupuesto", "cuanto_desea_invertir"])
  );

  // Dedup by phone, then meta_lead_id
  let existingId: string | null = null;
  let existingAgentId: string | null = null;
  let existingCtwa: string | null = null;
  if (phone) {
    const { data } = await db.from("contacts").select("id, agent_id, ctwa_clid").eq("phone", phone).maybeSingle();
    if (data) { existingId = data.id; existingAgentId = data.agent_id; existingCtwa = data.ctwa_clid; }
  }
  if (!existingId) {
    const { data } = await db.from("contacts").select("id, agent_id, ctwa_clid").eq("meta_lead_id", lead.id).maybeSingle();
    if (data) { existingId = data.id; existingAgentId = data.agent_id; existingCtwa = data.ctwa_clid; }
  }

  // Returns the new deal's id, or null if one already exists in the holding stages.
  const createIntakeDeal = async (contactId: string, agentId: string): Promise<string | null> => {
    const { data: openDeal } = await db
      .from("deals").select("id").eq("contact_id", contactId)
      .in("stage", ["nuevo_sin_contactar", "lead_captured"]).limit(1).maybeSingle();
    if (openDeal) return null;
    const { data: newDeal } = await db.from("deals").insert({
      contact_id: contactId, agent_id: agentId, stage: "nuevo_sin_contactar", currency: "USD",
    }).select("id").maybeSingle();
    return newDeal?.id ?? null;
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
    // Capture form answers if we have custom ones and the contact has none yet
    // (never clobber a richer manual edit).
    if (hasCustomAnswers(fields)) {
      const { data: cur } = await db.from("contacts").select("lead_form_answers").eq("id", existingId).maybeSingle();
      if (cur && cur.lead_form_answers == null) {
        await db.from("contacts").update({ lead_form_answers: leadFormAnswers }).eq("id", existingId);
      }
    }
    // Backfill campaign attribution only if the contact was never attributed
    // (both id columns null). Preserves first-touch; skips the Graph call otherwise.
    if (lead.campaign_id || lead.ad_id) {
      const { data: cur } = await db
        .from("contacts").select("meta_campaign_id, meta_ad_id").eq("id", existingId).maybeSingle();
      if (cur && cur.meta_campaign_id == null && cur.meta_ad_id == null) {
        const attr = await fetchCampaignAttribution(lead, process.env.META_ACCESS_TOKEN ?? "", formName);
        await db.from("contacts").update(attributionColumns(attr)).eq("id", existingId);
      }
    }
    const newDealId = await createIntakeDeal(existingId, agentId);
    if (newDealId) {
      await enqueueCapiEvent(db, {
        stage: "lead_captured", dealId: newDealId, contactId: existingId, email, phone, ctwaClid: existingCtwa,
      });
      if (agent) notifyAgent(agent, rawName, phone);
    }
    return { created: !!newDealId, contactId: existingId, reason: newDealId ? "existing_contact_new_deal" : "already_in_pipeline" };
  }

  // New contact
  const agent = await assignRrAgent(db);
  if (!agent) return { created: false, contactId: null, reason: "no_agent" };
  const agentId = agent.id;

  // De-conflated, enriched Meta attribution (IDs always; names best-effort).
  const attr = await fetchCampaignAttribution(lead, process.env.META_ACCESS_TOKEN ?? "", formName);

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
      ...attributionColumns(attr),
      agent_id: agentId,
      assigned_at: new Date().toISOString(),
      lead_form_answers: leadFormAnswers,
      ...(budget ? { budget_min: budget.min, budget_max: budget.max, budget_currency: budget.currency } : {}),
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

  const newDealId = await createIntakeDeal(inserted.id, agentId);
  if (newDealId) {
    // New lead-form contact: never CTWA-sourced, so no ctwa_clid enrichment.
    await enqueueCapiEvent(db, {
      stage: "lead_captured", dealId: newDealId, contactId: inserted.id,
      email: inserted.email, phone: inserted.phone, ctwaClid: null,
    });
  }
  notifyAgent(agent, rawName, phone);
  notifyLead(phone, firstName).catch(() => {});
  return { created: true, contactId: inserted.id, reason: "new_contact" };
}
