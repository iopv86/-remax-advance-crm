import { adminClient } from "@/lib/supabase/admin";
import { enqueueCapiEvent } from "@/lib/meta-capi";
import { recordLeadIngest, HEALTHY_OUTCOMES } from "@/lib/meta-lead-ledger";
import { GRAPH_VERSION } from "@/lib/meta-graph";
import { after } from "next/server";
import { sendAgentEmail } from "@/lib/email";
import { buildLeadEmail, crmLeadLink } from "@/lib/lead-email";
import { formatBudgetShort, findAnswer } from "@/lib/lead-format";
import { AGENT_TEMPLATE_NAME, drainAgentNotifications } from "@/lib/agent-notifications";
import { toE164, keyFromE164 } from "@/lib/phone";
import type { LeadFormAnswers } from "@/lib/types";

// Same fallback as app/api/notify/activity/route.ts, so both email paths build
// links identically.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://remax-advance-crm.vercel.app";

// Single source of truth lives in lib/meta-graph.ts. Re-exported so existing
// importers keep working; two independent copies would silently diverge the day
// one of them is bumped for a Graph deprecation.
export { GRAPH_VERSION };

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
  /** Meta's time_created. Recorded in the ledger so reconciliation can window by it. */
  created_time?: string;
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

/**
 * @deprecated processLead validates with toE164 (lib/phone.ts) since D01-P02.
 * Kept only for the negative control in lib/phone.test.ts, which documents that
 * this check left "809 555 0101" without a phone.
 */
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
  /** Corporate address from agents.email. Recipient of the backup notification. */
  email: string | null;
}

export async function assignRrAgent(db: Db): Promise<AssignedAgent | null> {
  const { data: agentId, error } = await db.rpc("assign_next_rr_agent");
  if (error || !agentId) {
    if (error) console.error("[meta-leads] assign_next_rr_agent error:", error.message);
    return null;
  }
  const { data: agent } = await db
    .from("agents")
    .select("id, phone, full_name, email")
    .eq("id", agentId as string)
    .maybeSingle();
  return (agent as AssignedAgent) ?? { id: agentId as string, phone: null, full_name: null, email: null };
}

/**
 * Who should own the intake DEAL for a lead landing on an existing contact.
 *
 * Policy C, chosen deliberately over "always keep the contact's owner" (leaves
 * paid leads unworked) and "always reassign" (yanks a contact away from the
 * agent nurturing them): the contact keeps its owner, and only the new deal is
 * routed to the rotation, and only when the current owner is not actually
 * working leads. `deals.agent_id` is already independent of `contacts.agent_id`,
 * so this needs no schema change.
 *
 * Consequence worth knowing: contact owner and deal owner can differ, and that
 * is visible in the UI.
 */
export async function resolveDealAgent(
  db: Db,
  existingAgentId: string | null,
): Promise<AssignedAgent | null> {
  if (!existingAgentId) return assignRrAgent(db);

  const { data: active } = await db
    .from("round_robin_config").select("id")
    .eq("agent_id", existingAgentId).eq("is_active", true).maybeSingle();

  if (!active) return assignRrAgent(db);

  const { data: agent } = await db
    .from("agents").select("id, phone, full_name, email").eq("id", existingAgentId).maybeSingle();
  return (agent as AssignedAgent) ?? { id: existingAgentId, phone: null, full_name: null, email: null };
}

// ── agent + lead notifications (fire-and-forget) ───────────────────────────────

// Approved Meta template that alerts the assigned agent about a new lead.
// UTILITY, Spanish. v2 body params: {{1}} name, {{2}} interest/project,
// {{3}} budget, {{4}} preferred contact time, {{5}} lead phone (tappable in
// WhatsApp). Static "Abrir CRM" URL button (dynamic wa.me buttons are rejected
// by Meta). Hardcoded stable name; v1 kept as a comment for instant rollback
// (revert the constant): "ava_nuevo_lead_agente". Single copy, shared with the
// queue drain: lib/agent-notifications.ts.

// Moved to lib/lead-format.ts (no import cycle with lib/agent-notifications.ts).
export { formatBudgetShort, findAnswer };

/**
 * Notifies the assigned agent about a new lead via an approved Meta template,
 * so delivery does NOT depend on the 24h customer-service window (the old
 * free-text path silently failed for agents outside that window). Fire-and-forget;
 * failure never blocks intake — the in-app bell (trg_notify_deal_assigned) covers
 * every deal insert regardless. Sends directly via Graph, same pattern as notifyLead.
 * Callers pass already-derived strings; empty values fall back to placeholders
 * (Meta rejects empty template params with 132000).
 */
export function notifyAgentTemplate(
  agentPhone: string | null,
  leadName: string,
  leadPhone: string | null,
  budgetDisplay: string,
  interes: string,
  horario: string,
): void {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!agentPhone || !accessToken || !phoneNumberId) return;
  const digits = agentPhone.replace(/\D/g, "");
  if (!digits) return;
  // WhatsApp template params must be single-line and non-empty; cap length so an
  // oversized value can't 400 the send.
  const clean = (v: string, n: number): string => (v || "").replace(/\s+/g, " ").trim().slice(0, n);
  const p1 = clean(leadName, 300) || "Sin nombre";
  const p2 = clean(interes, 200) || "No especificado";
  const p3 = clean(budgetDisplay, 60) || "No especificado";
  const p4 = clean(horario, 100) || "No especificado";
  const p5 = clean(leadPhone ?? "", 60) || "No provisto";
  fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: digits,
      type: "template",
      template: {
        name: AGENT_TEMPLATE_NAME,
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: p1 },
              { type: "text", text: p2 },
              { type: "text", text: p3 },
              { type: "text", text: p4 },
              { type: "text", text: p5 },
            ],
          },
        ],
      },
    }),
  }).catch((err) => console.error("[meta-leads] notifyAgentTemplate error:", (err as Error).message));
}

/**
 * Alerts the assigned agent on BOTH channels.
 *
 * WhatsApp is dispatched first and unawaited, so a slow mail send can never
 * delay it; the subsequent await also keeps the serverless function alive long
 * enough for that fetch to actually complete, which nothing did before.
 *
 * The email is redundancy: today, if the Meta template fails (expired token,
 * template rejected, 24h window) the agent learns nothing and the lead goes
 * cold silently. Neither channel can block intake -- `notifyAgentTemplate`
 * catches its own rejection and `sendAgentEmail` never throws and returns false
 * on any failure.
 *
 * The recipient comes ONLY from `agent.email`. The lead-supplied email parsed in
 * processLead must never reach this function; taking an AssignedAgent makes that
 * structural rather than a rule someone has to remember.
 */
export function notifyAgent(
  agent: AssignedAgent,
  leadName: string,
  leadPhone: string | null,
  budgetDisplay: string,
  interes: string,
  horario: string,
  link: string,
): void {
  // Guarded per channel: an agent with no phone must still get the email, and
  // an agent with no email must still get the WhatsApp.
  if (agent.phone) {
    notifyAgentTemplate(agent.phone, leadName, leadPhone, budgetDisplay, interes, horario);
  }
  const to = agent.email;
  if (!to) return;

  const { subject, text } = buildLeadEmail({
    agentName: agent.full_name,
    leadName,
    leadPhone,
    budgetDisplay,
    interes,
    horario,
    link,
  });

  const send = () =>
    sendAgentEmail({ to, subject, text }).then((ok) => {
      // Agent id only -- no PII in logs, matching lib/email.ts.
      if (!ok) console.error("[meta-leads] lead email failed for agent", agent.id);
    });

  // after() runs the send AFTER the response is sent, without blocking it, and
  // the platform keeps the function alive until it finishes. Awaiting instead
  // would put Resend's 8s timeout inside the webhook's 5s budget and inside the
  // poller's 60s one -- and a poll run that overruns its budget is precisely the
  // overlapping-invocation condition the advisory lock exists to survive.
  // A bare unawaited promise is not an option either: the function can be frozen
  // the moment the handler returns.
  try {
    after(send);
  } catch {
    // Outside a request scope (a script, a test): nothing will keep us alive, so
    // fall back to firing it directly.
    void send();
  }
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

export type ProcessReason =
  | "new_contact"
  | "existing_contact_new_deal"
  | "already_in_pipeline"
  | "no_agent"
  // resolve_contact found 2+ candidates by country variant: nothing created, a
  // human decides (D01 REQ 3). Deliberately NOT in HEALTHY_OUTCOMES.
  | "ambiguous"
  // RPC failures. resolve_error and deal_error throw (fail-closed, retried by the
  // poller); resolve_rejected (22023, bad arguments) does not, since retrying
  // cannot help. None is healthy, so lead-audit reports them.
  | "resolve_error"
  | "resolve_rejected"
  | "deal_error"
  // The new contact's details (email, answers, budget, attribution) failed to
  // save twice: thrown before the deal, so the next pass fills them.
  | "details_error"
  // Produced by the pre-D01 insert path; still present in historic ledger rows.
  | "race_winner"
  | "insert_error"
  | "no_insert";

const RESOLVE_OUTCOMES: ReadonlySet<string> = new Set(["found", "created", "ambiguous", "no_agent"]);

/** One row of public.resolve_contact (migration 0035). */
interface ResolveRow {
  outcome: "found" | "created" | "ambiguous" | "no_agent";
  contact_id: string | null;
  agent_id: string | null;
  agent_assigned_now: boolean;
}

export interface ProcessResult {
  created: boolean;
  contactId: string | null;
  reason: ProcessReason;
  /** Present so the caller can count no_agent and the ledger can record ownership. */
  agentId: string | null;
  dealId: string | null;
}

/**
 * Idempotent: finds or creates the contact with resolve_contact (the same
 * database function Ava uses), opens the intake deal (nuevo_sin_contactar) with
 * a round-robin agent, fires CAPI Lead, notifies. Safe to call repeatedly for the
 * same lead (ledger gate by lead id; resolve_contact by phone key, country
 * variants and meta_lead_id under an advisory lock; intake deal deduped per
 * contact). Fail-closed: an RPC error throws after recording the ledger row, so
 * nothing is created and the poller retries. Used by BOTH the push webhook and
 * the pull poller.
 */
export async function processLead(
  db: Db,
  lead: LeadFormData,
  formName?: string | null,
  source: "poll" | "webhook" = "poll",
): Promise<ProcessResult> {
  // Single exit point: every outcome, including the ones that create nothing,
  // lands one row in meta_lead_ingest. Before this existed, a lead dropped for
  // lack of an agent left no trace anywhere -- no row, no error, no log line.
  const finish = async (
    created: boolean,
    contactId: string | null,
    reason: ProcessReason,
    agentId: string | null = null,
    dealId: string | null = null,
  ): Promise<ProcessResult> => {
    await recordLeadIngest(db, {
      leadId: lead.id,
      formId: lead.form_id ?? null,
      createdTime: lead.created_time ?? null,
      contactId,
      dealId,
      agentId,
      outcome: reason,
      source,
    });
    return { created, contactId, reason, agentId, dealId };
  };

  // Idempotency gate, by lead id.
  //
  // The poller now re-presents every lead for 15 minutes (the overlap that stops
  // leads being lost to Meta's indexing lag), so processLead runs ~15 times per
  // lead. The old dedup was "is there an open deal in nuevo_sin_contactar" --
  // which stops holding the moment an agent moves the deal on. A fast agent
  // inside that 15-minute window would otherwise earn the lead a SECOND intake
  // deal, a duplicate CAPI event and a duplicate WhatsApp notification.
  //
  // Anchoring on the lead id instead makes re-processing inert regardless of
  // deal stage. One indexed primary-key lookup, so the overlap stays cheap.
  const { data: ledgerRow } = await db
    .from("meta_lead_ingest").select("outcome, contact_id").eq("lead_id", lead.id).maybeSingle();
  if (
    ledgerRow?.contact_id &&
    (HEALTHY_OUTCOMES as readonly string[]).includes(ledgerRow.outcome as string)
  ) {
    // Already accounted for. Do not rewrite the ledger row: that would be 15
    // pointless writes per lead per 15 minutes.
    return {
      created: false,
      contactId: ledgerRow.contact_id as string,
      reason: "already_in_pipeline",
      agentId: null,
      dealId: null,
    };
  }

  const fields = lead.field_data ?? [];
  const rawName = pickField(fields, ["full_name", "full name", "name", "nombre", "nombre_completo"]) ?? "";
  const email = pickField(fields, ["email", "correo", "correo_electronico"]);
  const rawPhone = pickField(fields, ["phone_number", "phone", "telefono", "teléfono", "numero", "número"]);
  // E.164 or nothing (R8): "809 555 0101" is now +18095550101 instead of null.
  const phone = toE164(rawPhone, "DO");
  const [firstName, ...rest] = rawName.split(" ");
  const lastName = rest.join(" ") || null;

  // Lossless capture of every answered question + best-effort budget mapping.
  const leadFormAnswers = buildLeadFormAnswers(fields, lead.id);
  const budget = parseBudgetRange(
    pickField(fields, ["presupuesto", "presupuesto_estimado", "budget", "rango_de_presupuesto", "cuanto_desea_invertir"])
  );

  // Agent-notification fields (interest = form/campaign name; horario = the
  // time-of-day question, matched loosely since Meta returns question text as
  // the field name). Both fall back to a placeholder — never empty.
  const budgetDisplay = formatBudgetShort(budget?.min, budget?.max, budget?.currency);
  const interes = (formName?.trim() || findAnswer(fields, ["proyecto", "interes", "interés"]) || "No especificado");
  const horario = (findAnswer(fields, ["momento", "horario"]) || "No especificado");

  // One call finds or creates the contact under an advisory lock on the phone
  // key (migration 0035), the same function Ava uses. It replaces the exact
  // `.eq("phone", phone)` lookup -- which missed every contact Ava had created
  // first in another format (7 of the 10 measured form + WhatsApp duplicates) --
  // the separate round-robin PATCH and the unlocked insert.
  const { data: resolved, error: resolveErr } = await db.rpc("resolve_contact", {
    p_phone: phone,
    p_key: keyFromE164(phone),
    p_meta_lead_id: lead.id,
    p_first_name: firstName || null,
    p_last_name: lastName,
    p_source: "lead_form",
    p_assign_rr: true,
    p_create_without_agent: false,
  });
  if (resolveErr) {
    // 22023 = the RPC rejected the arguments: deterministic, so retrying every
    // minute would only pin the poller's watermark until its 24h floor drops
    // leads. The ledger row is not healthy, so lead-audit reports it.
    if (resolveErr.code === "22023") {
      console.error("[meta-leads] resolve_contact rejected the arguments of lead", lead.id);
      return finish(false, null, "resolve_rejected");
    }
    // Fail-closed: nothing is created, the ledger keeps the gap, and the throw
    // pins the poller's watermark so its 15-minute overlap retries the lead.
    await finish(false, null, "resolve_error");
    throw new Error(`resolve_contact failed: ${resolveErr.code ?? "unknown"}`);
  }
  const r = (resolved as ResolveRow[] | null)?.[0];
  // A closed set: an outcome this code does not know must never fall through as "found".
  if (!r || !RESOLVE_OUTCOMES.has(r.outcome)) {
    await finish(false, null, "resolve_error");
    throw new Error(r ? "resolve_contact returned an unknown outcome" : "resolve_contact returned no row");
  }
  // The RPC already wrote the contact_match_events row; the grouped alert reports it.
  if (r.outcome === "ambiguous") return finish(false, null, "ambiguous");
  // Not healthy on purpose (W6): the poller keeps its watermark and the next pass retries.
  if (r.outcome === "no_agent" || !r.contact_id || !r.agent_id) return finish(false, r.contact_id, "no_agent");

  const contactId = r.contact_id;
  const isNew = r.outcome === "created";

  /**
   * create_intake_deal (migration 0036) checks and inserts atomically under a
   * per-contact lock and enqueues the agent notification in the same
   * transaction. null = an intake deal is already open. An RPC error throws: a
   * deal that failed to open must be retried, not recorded as "already in
   * pipeline" (which is healthy and would never be looked at again).
   */
  const createIntakeDeal = async (agentId: string): Promise<string | null> => {
    const { data, error } = await db.rpc("create_intake_deal", { p_contact_id: contactId, p_agent_id: agentId });
    if (error) {
      await finish(false, contactId, "deal_error", agentId);
      throw new Error(`create_intake_deal failed: ${error.code ?? "unknown"}`);
    }
    return (data as string | null) ?? null;
  };

  let ctwaClid: string | null = null;
  if (isNew) {
    // resolve_contact wrote the minimal row (phones, name, source, meta_lead_id,
    // agent); the rest of what the old insert carried is written here, by id.
    const attr = await fetchCampaignAttribution(lead, process.env.META_ACCESS_TOKEN ?? "", formName);
    const details = {
      email: email || null,
      lead_form_answers: leadFormAnswers,
      ...attributionColumns(attr),
      ...(budget ? { budget_min: budget.min, budget_max: budget.max, budget_currency: budget.currency } : {}),
    };
    let { error: updErr } = await db.from("contacts").update(details).eq("id", contactId);
    if (updErr) ({ error: updErr } = await db.from("contacts").update(details).eq("id", contactId));
    if (updErr) {
      // Not healthy and thrown BEFORE the deal: the next pass finds the contact
      // and fills what is missing (below), and the agent's notice carries it.
      await finish(false, contactId, "details_error", r.agent_id);
      throw new Error(`contact details update failed: ${updErr.code ?? "unknown"}`);
    }
  } else {
    ctwaClid = await enrichExistingContact(db, contactId, lead, {
      email, budget, formName: formName?.trim() || null, leadFormAnswers,
    });
  }

  // D13: a client with an intake deal already open gets a note on that deal,
  // never a second deal or template. Checked BEFORE Policy C so a returning
  // client does not spend a round-robin turn for nothing; create_intake_deal
  // still decides atomically if this read races with another path.
  let openDeal = false;
  if (!isNew) {
    const { data: open, error: openErr } = await db
      .from("deals").select("id")
      .eq("contact_id", contactId).in("stage", ["nuevo_sin_contactar", "lead_captured"])
      .limit(1).maybeSingle();
    // On a failed read create_intake_deal still decides; the cost is one round-robin turn.
    if (openErr) console.error("[meta-leads] open deal read failed for lead", lead.id, ":", openErr.message);
    openDeal = !!open;
  }

  let dealAgent: AssignedAgent | null = null;
  let newDealId: string | null = null;
  if (!openDeal) {
    // An agent resolve_contact just assigned owns the deal. An existing owner
    // goes through Policy C: the CONTACT keeps its owner, but the new intake
    // DEAL goes to the rotation when that owner is not an active round-robin
    // participant (two paid leads once sat unworked on the admin's import).
    dealAgent = isNew || r.agent_assigned_now ? await readAgent(db, r.agent_id) : await resolveDealAgent(db, r.agent_id);
    if (!dealAgent) return finish(false, contactId, "no_agent");
    newDealId = await createIntakeDeal(dealAgent.id);
  }

  if (newDealId && dealAgent) {
    await enqueueCapiEvent(db, {
      stage: "lead_captured", dealId: newDealId, contactId, email, phone, ctwaClid,
    });
    // Notify whoever owns the DEAL, including a returning lead on an
    // already-assigned contact (that used to create a deal nobody was told about).
    await notifyDealAgent(db, newDealId, dealAgent, {
      leadName: rawName, leadPhone: phone, budgetDisplay, interes, horario,
      link: crmLeadLink(APP_URL, newDealId, contactId),
    });
  } else if (!isNew) {
    const { error: noteErr } = await db.rpc("record_campaign_return", {
      p_contact_id: contactId,
      p_note: `Lleno el formulario: ${formName?.trim() || "sin nombre de formulario"}`,
    });
    if (noteErr) console.error("[meta-leads] record_campaign_return failed for lead", lead.id, ":", noteErr.message);
    // The contact had no agent and resolve_contact just gave it one: the
    // cascade trigger moved its open deal to that agent, who has not been told.
    // A CRM bell only (D19), never a template.
    if (r.agent_assigned_now) {
      const { error: bellErr } = await db.rpc("notify_agent_client_returned", { p_contact_id: contactId });
      if (bellErr) console.error("[meta-leads] notify_agent_client_returned failed for lead", lead.id, ":", bellErr.message);
    }
  }

  // Only a brand-new contact gets the lead template: a found contact may already
  // be talking to Ava, and a template on top of that conversation is noise.
  if (isNew) notifyLead(phone, firstName).catch(() => {});

  const reason: ProcessReason = isNew ? "new_contact" : newDealId ? "existing_contact_new_deal" : "already_in_pipeline";
  return finish(isNew || !!newDealId, contactId, reason, dealAgent?.id ?? r.agent_id, newDealId);
}

async function readAgent(db: Db, id: string): Promise<AssignedAgent> {
  const { data, error } = await db.from("agents").select("id, phone, full_name, email").eq("id", id).maybeSingle();
  // The queue drain re-reads the agent; only the previous path ('skipped') depends on this row.
  if (error) console.error("[meta-leads] agent read failed for agent", id, ":", error.message);
  return (data as AssignedAgent) ?? { id, phone: null, full_name: null, email: null };
}

/**
 * A lead that lands on an existing contact (Ava's, an import, an earlier form).
 * Fills only what the contact does NOT have yet, never overwriting: the lead id,
 * the form answers, the email, the budget, the form name and, if the contact was
 * never attributed, the campaign attribution. The queued agent notice is built
 * from the contact row, so this is also what puts the current form's interest
 * and budget in it (the previous path passed them straight from the lead).
 * Returns the contact's ctwa_clid for the CAPI event.
 */
async function enrichExistingContact(
  db: Db,
  contactId: string,
  lead: LeadFormData,
  f: {
    email: string | null;
    budget: ReturnType<typeof parseBudgetRange>;
    formName: string | null;
    leadFormAnswers: LeadFormAnswers;
  },
): Promise<string | null> {
  const { data: cur, error: curErr } = await db
    .from("contacts")
    .select("ctwa_clid, meta_lead_id, lead_form_answers, meta_campaign_id, meta_ad_id, email, budget_min, budget_max, meta_form_name")
    .eq("id", contactId)
    .maybeSingle();
  if (curErr || !cur) {
    console.error("[meta-leads] existing contact read failed for lead", lead.id, ":", curErr?.message ?? "no row");
    return null;
  }
  // Claim the lead id for a contact that arrived by some other route. Without
  // this the contact stays invisible to any reconciliation keyed on meta_lead_id
  // -- which is how two correctly-ingested leads were mistaken for lost ones.
  // Guarded on IS NULL, so it is race-safe and cannot overwrite a first-touch value.
  if (cur.meta_lead_id == null) {
    const { error } = await db
      .from("contacts").update({ meta_lead_id: lead.id })
      .eq("id", contactId).is("meta_lead_id", null);
    if (error) console.error("[meta-leads] meta_lead_id claim failed:", error.message);
  }
  const fill: Record<string, unknown> = {};
  if (cur.lead_form_answers == null) fill.lead_form_answers = f.leadFormAnswers;
  if (cur.email == null && f.email) fill.email = f.email;
  if (cur.budget_min == null && cur.budget_max == null && f.budget) {
    Object.assign(fill, { budget_min: f.budget.min, budget_max: f.budget.max, budget_currency: f.budget.currency });
  }
  // Backfill campaign attribution only if the contact was never attributed
  // (both id columns null). Preserves first-touch; skips the Graph call otherwise.
  if ((lead.campaign_id || lead.ad_id) && cur.meta_campaign_id == null && cur.meta_ad_id == null) {
    Object.assign(fill, attributionColumns(await fetchCampaignAttribution(lead, process.env.META_ACCESS_TOKEN ?? "", f.formName)));
  }
  if (cur.meta_form_name == null && f.formName) fill.meta_form_name = f.formName;
  if (Object.keys(fill).length > 0) {
    const { error } = await db.from("contacts").update(fill).eq("id", contactId);
    if (error) console.error("[meta-leads] existing contact fill failed for lead", lead.id, ":", error.message);
  }
  return (cur.ctwa_clid as string | null) ?? null;
}

interface AgentNoticeFields {
  leadName: string;
  leadPhone: string | null;
  budgetDisplay: string;
  interes: string;
  horario: string;
  link: string;
}

/**
 * Exactly one sender per deal (D12) across the switch-over: the status of the
 * deal's agent_lead_notifications row decides. 'skipped' (the queue flag was
 * off when the deal was created) -> the previous path, notifyAgent. Anything
 * else -> ONLY the queue drain: 'pending', but also 'sending'/'sent' if the
 * cron claimed the row in the meantime, a missing row or a failed read. Coding
 * it as "pending drains, everything else uses notifyAgent" would double-send
 * whenever the cron won that race.
 */
async function notifyDealAgent(db: Db, dealId: string, agent: AssignedAgent, f: AgentNoticeFields): Promise<void> {
  const read = () => db.from("agent_lead_notifications").select("status").eq("deal_id", dealId).maybeSingle();
  // Retried once: with the flag off every row is 'skipped', and a failed read would
  // send it to the drain, which never claims 'skipped' (the notice would be lost).
  let { data: row, error } = await read();
  if (error) ({ data: row, error } = await read());
  if (error) console.error("[meta-leads] notification status read failed twice for deal", dealId, ":", error.message);
  if (!error && row?.status === "skipped") {
    notifyAgent(agent, f.leadName, f.leadPhone, f.budgetDisplay, f.interes, f.horario, f.link);
    return;
  }
  // after() keeps the function alive past the response without putting Meta's
  // and Resend's timeouts inside the webhook's or the poller's budget. A row it
  // does not reach is sent by the every-minute cron.
  const drain = () =>
    drainAgentNotifications(db, { limit: 5 })
      .then((res) => { if (res.error) console.error("[meta-leads] notification drain:", res.error); })
      .catch((e) => console.error("[meta-leads] notification drain threw:", (e as Error).message));
  try {
    after(drain);
  } catch {
    // Outside a request scope (a script, a test): nothing keeps us alive, so run it now.
    await drain();
  }
}
