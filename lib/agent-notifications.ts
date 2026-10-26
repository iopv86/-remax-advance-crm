import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { GRAPH_VERSION } from "@/lib/meta-graph";
import { sendAgentEmail } from "@/lib/email";
import { buildLeadEmail, cleanEmailValue, crmLeadLink } from "@/lib/lead-email";
import { findAnswer, formatBudgetShort } from "@/lib/lead-format";
import { toE164 } from "@/lib/phone";
import type { FieldData } from "@/lib/meta-leads";

/**
 * The single sender of the "new lead" alert to agents (D01 D12).
 *
 * Every intake deal gets exactly one row in agent_lead_notifications, inserted
 * by create_intake_deal in the same transaction as the deal (migration 0036).
 * This module claims rows with claim_agent_lead_notifications (FOR UPDATE SKIP
 * LOCKED), sends the approved template, CHECKS Meta's answer (res.ok AND a
 * messages[0].id: fetch does not throw on a 4xx, and a 200 without an id is not
 * a delivery), and records the outcome with mark_agent_lead_notification, which
 * also fills deals.agent_notified_at.
 *
 * Delivery is AT LEAST ONCE (D01-CONTEXT 4.D): if the process dies after Meta's
 * 200 and before mark, the 5-minute lease in claim hands the row out again and
 * the agent gets the template twice. Exactly-once is the enqueue, not the send.
 *
 * Called from processLead through after() (sends within seconds) and from the
 * every-minute cron (retries with the backoff of mark: 2, 4, 8, 16 minutes; the
 * fifth failure leaves the row 'dead', which the grouped alert reports).
 * Logs carry row/deal/agent ids only, never a phone number (as lib/email.ts).
 */

type Db = ReturnType<typeof adminClient>;

// Approved Meta template (UTILITY, es). Body params: {{1}} name, {{2}} interest,
// {{3}} budget, {{4}} preferred contact time, {{5}} lead phone.
export const AGENT_TEMPLATE_NAME = "ava_nuevo_lead_agente_v2";

// Same fallback as lib/meta-leads.ts and app/api/notify/activity/route.ts.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://remax-advance-crm.vercel.app";

/** mark_agent_lead_notification turns the 5th failed attempt into 'dead'. */
const MAX_ATTEMPTS = 5;
const MAX_TIME_ATTEMPTS = 5;
const DEFAULT_TIMEOUT_MS = 8_000;
/**
 * Rows still unsent when the run passes this budget are released as failed. The cron has 60 s
 * for everything: this drain (30 s) + the preferred-time emails (15 s) + the alert (Resend, 8 s).
 * Meta answers in well under a second; the timeout only bounds a hung call.
 */
const DEFAULT_BUDGET_MS = 30_000;

export interface TemplateContact {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_currency: string | null;
  meta_form_name: string | null;
  source_detail: string | null;
  lead_form_answers: { fields?: FieldData[] } | null;
  preferred_contact_time: string | null;
}

export interface TemplateParams {
  leadName: string;
  interes: string;
  budget: string;
  horario: string;
  leadPhone: string;
}

// The lead's name is a WhatsApp profile name or a form answer: the client
// controls it. A link inside an official template sent to an agent is a phishing
// vector, so URLs are dropped along with control characters.
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const CONTROL_RE = /[\x00-\x1f\x7f]/g;

// WhatsApp template params must be single-line and non-empty; cap the length so
// an oversized value cannot 400 the send (same rule as notifyAgentTemplate).
// NFKC first, so a scheme written in full-width letters is caught too. Bare
// domains ("bit.ly/x") are NOT stripped: a domain-shaped rule would also eat real
// names such as "Lic.Aderly" (D01-CONTEXT D5). The cut must not leave half of an
// emoji (a lone surrogate is invalid UTF-16 in the JSON).
const oneLine = (v: string | null | undefined, n: number): string =>
  (v || "").normalize("NFKC").replace(URL_RE, " ").replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim()
    .slice(0, n).replace(/[\uD800-\uDBFF]$/, "");

/** The five body parameters of the agent template, from the contact as stored. Pure. */
export function buildAgentTemplateParams(c: TemplateContact): TemplateParams {
  // lead_form_answers is jsonb written by several paths: never trust its shape.
  const raw = c.lead_form_answers?.fields;
  const fields = Array.isArray(raw) ? raw : [];
  return {
    leadName: oneLine([c.first_name, c.last_name].filter(Boolean).join(" "), 300) || "Sin nombre",
    interes: oneLine(c.meta_form_name, 200) || oneLine(c.source_detail, 200) || "No especificado",
    budget: oneLine(formatBudgetShort(c.budget_min, c.budget_max, c.budget_currency), 60) || "No especificado",
    horario:
      oneLine(c.preferred_contact_time, 100) ||
      oneLine(findAnswer(fields, ["momento", "horario"]), 100) ||
      "No especificado",
    leadPhone: oneLine(c.phone || c.whatsapp_number, 60) || "No provisto",
  };
}

interface ClaimedRow {
  id: number;
  deal_id: string;
  attempts: number;
  email_sent_at: string | null;
}

interface AgentRow {
  id: string;
  phone: string | null;
  full_name: string | null;
  email: string | null;
}

type SendOutcome = { ok: true; waMessageId: string; status?: string } | { ok: false; error: string };

/** Sends the template and reports what Meta actually answered. Never throws. */
async function sendAgentTemplate(agentPhone: string, p: TemplateParams, timeoutMs: number): Promise<SendOutcome> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return { ok: false, error: "meta_not_configured" };
  // E.164 with "+", as Meta recommends (without it Meta prepends the business number's country
  // code). agents.phone is free text; both stored formats, "+1X10" and "1X10" (measured
  // 2026-10-25), normalize to +1X10.
  const to = toE164(agentPhone);
  if (!to) return { ok: false, error: "agent_phone_invalid" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      // Token only in the header, never in the URL (outbound-request logs).
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: AGENT_TEMPLATE_NAME,
          language: { code: "es" },
          components: [{
            type: "body",
            parameters: [p.leadName, p.interes, p.budget, p.horario, p.leadPhone].map((text) => ({ type: "text", text })),
          }],
        },
      }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as
      | { messages?: { id?: unknown; message_status?: unknown }[]; error?: { code?: unknown; error_subcode?: unknown } }
      | null;
    const id = body?.messages?.[0]?.id;
    const status = body?.messages?.[0]?.message_status;
    if (res.ok && typeof id === "string" && id) {
      return { ok: true, waMessageId: id, status: typeof status === "string" ? status : undefined };
    }
    // Status and Meta's numeric codes only: the message text can echo the recipient.
    const code = typeof body?.error?.code === "number" ? ` code=${body.error.code}` : "";
    const sub = typeof body?.error?.error_subcode === "number" ? ` sub=${body.error.error_subcode}` : "";
    return { ok: false, error: res.ok ? `meta ${res.status} sin messages[0].id` : `meta ${res.status}${code}${sub}` };
  } catch (e) {
    const name = (e as Error)?.name;
    return { ok: false, error: name === "AbortError" ? `meta timeout ${timeoutMs}ms` : `meta red ${name ?? "error"}` };
  } finally {
    clearTimeout(timer);
  }
}

export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  /** mark returned false: the 5-minute lease expired and another run owns the row. */
  lostLease: number;
  /** mark itself failed: the row stays 'sending' and is sent again after the lease. */
  markErrors: number;
  error?: string;
}

export interface DrainOptions {
  limit?: number;
  timeoutMs?: number;
  budgetMs?: number;
}

/** Claims due rows and sends each one. Never throws for a single row; a failed claim is returned, not hidden. */
export async function drainAgentNotifications(db: Db, opts: DrainOptions = {}): Promise<DrainResult> {
  const { limit = 10, timeoutMs = DEFAULT_TIMEOUT_MS, budgetMs = DEFAULT_BUDGET_MS } = opts;
  const result: DrainResult = { claimed: 0, sent: 0, failed: 0, dead: 0, lostLease: 0, markErrors: 0 };
  const deadline = Date.now() + budgetMs;

  const { data, error } = await db.rpc("claim_agent_lead_notifications", { p_limit: limit });
  if (error) {
    console.error("[agent-notifications] claim failed:", error.code ?? error.message);
    return { ...result, error: `claim: ${error.code ?? error.message}` };
  }
  const rows = (data ?? []) as ClaimedRow[];
  result.claimed = rows.length;

  for (const row of rows) {
    const outcome = Date.now() > deadline
      ? { send: { ok: false, error: "deadline" } as SendOutcome, emailSent: false, agentId: null }
      : await deliver(db, row, timeoutMs).catch((e) => {
          // A row that throws must still be marked: otherwise it sits in 'sending' for the
          // whole lease and the rest of the batch is never sent.
          console.error("[agent-notifications] deliver threw for row", row.id, ":", (e as Error)?.name);
          return { send: { ok: false, error: "deliver_threw" } as SendOutcome, emailSent: false, agentId: null };
        });

    const { data: marked, error: markErr } = await db.rpc("mark_agent_lead_notification", {
      p_id: row.id,
      p_ok: outcome.send.ok,
      p_error: outcome.send.ok ? null : outcome.send.error,
      p_wa_message_id: outcome.send.ok ? outcome.send.waMessageId : null,
      p_agent_id: outcome.agentId,
      p_email_sent: outcome.emailSent,
    });
    if (markErr) {
      // The row stays 'sending' and is handed out again after the lease: at least once, never lost.
      result.markErrors++;
      console.error("[agent-notifications] mark failed for row", row.id, ":", markErr.code ?? markErr.message);
    } else if (marked === false) {
      result.lostLease++;
      console.warn("[agent-notifications] lease lost for row", row.id, "(another run owns it)");
    }

    if (outcome.send.ok) result.sent++;
    else if (row.attempts >= MAX_ATTEMPTS) result.dead++;
    else result.failed++;
  }
  if (result.markErrors > 0) result.error = `mark: ${result.markErrors} error(es)`;
  return result;
}

/** Reads the deal, its contact and the DEAL's agent, then sends WhatsApp and the backup email. */
async function deliver(
  db: Db,
  row: ClaimedRow,
  timeoutMs: number,
): Promise<{ send: SendOutcome; emailSent: boolean; agentId: string | null }> {
  const fail = (error: string, agentId: string | null = null) =>
    ({ send: { ok: false, error } as SendOutcome, emailSent: false, agentId });

  const { data: deal, error: dealErr } = await db
    .from("deals").select("id, agent_id, contact_id").eq("id", row.deal_id).maybeSingle();
  if (dealErr) return fail("read_error deals");
  if (!deal) return fail("deal_not_found");

  const { data: contact, error: contactErr } = await db
    .from("contacts")
    .select("first_name, last_name, phone, whatsapp_number, budget_min, budget_max, budget_currency, meta_form_name, source_detail, lead_form_answers, preferred_contact_time")
    .eq("id", deal.contact_id as string)
    .maybeSingle();
  if (contactErr) return fail("read_error contacts", deal.agent_id as string);
  if (!contact) return fail("contact_not_found", deal.agent_id as string);

  const { data: agentData, error: agentErr } = await db
    .from("agents").select("id, phone, full_name, email").eq("id", deal.agent_id as string).maybeSingle();
  if (agentErr) return fail("read_error agents", deal.agent_id as string);
  const agent = agentData as AgentRow | null;
  if (!agent) return fail("agent_not_found", deal.agent_id as string);

  const p = buildAgentTemplateParams(contact as unknown as TemplateContact);
  const sendWa = agent.phone
    ? sendAgentTemplate(agent.phone, p, timeoutMs)
    : Promise.resolve<SendOutcome>({ ok: false, error: "agent_without_phone" });

  // Backup email: once per row, only to agents.email (never the lead's own address).
  const sendMail = async (): Promise<boolean> => {
    if (row.email_sent_at || !agent.email) return false;
    const { subject, text } = buildLeadEmail({
      agentName: agent.full_name,
      leadName: p.leadName,
      leadPhone: p.leadPhone,
      budgetDisplay: p.budget,
      interes: p.interes,
      horario: p.horario,
      link: crmLeadLink(APP_URL, deal.id as string, deal.contact_id as string),
    });
    const ok = await sendAgentEmail({ to: agent.email, subject, text });
    if (!ok) console.error("[agent-notifications] backup email failed for agent", agent.id);
    return ok;
  };

  // allSettled: a backup email that rejects must not hide a WhatsApp that went out.
  const [wa, mail] = await Promise.allSettled([sendWa, sendMail()]);
  const send: SendOutcome = wa.status === "fulfilled" ? wa.value : { ok: false, error: "meta threw" };
  const emailSent = mail.status === "fulfilled" && mail.value;
  if (!send.ok) console.error("[agent-notifications] template failed for row", row.id, ":", send.error);
  // Accepted but held or paused by Meta's pacing: counted as sent (retrying would duplicate it
  // once Meta releases it), but visible in the logs.
  else if (send.status && send.status !== "accepted") {
    console.warn("[agent-notifications] template", send.status, "for row", row.id);
  }
  return { send, emailSent, agentId: agent.id };
}

// ── D14: preferred contact time that arrives after the template ────────────────

export interface TimeDrainResult {
  claimed: number;
  sent: number;
  failed: number;
  error?: string;
}

interface TimeRow {
  id: number;
  deal_id: string;
  preferred_contact_time: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

/** A claimed row carries `sending <iso>` in last_error until it settles (no lease column in 0036). */
const LEASE_PREFIX = "sending ";
const TIME_LEASE_MS = 2 * 60_000;
const DEFAULT_TIME_BUDGET_MS = 15_000;

/** Backoff measured from created_at: attempt n is due (2^n - 1) minutes after the row was written. */
function isDue(row: TimeRow, now: number): boolean {
  if (row.attempts === 0) return true;
  return now - new Date(row.created_at).getTime() >= (2 ** row.attempts - 1) * 60_000;
}

function isLeased(row: TimeRow, now: number): boolean {
  if (!row.last_error?.startsWith(LEASE_PREFIX)) return false;
  const at = new Date(row.last_error.slice(LEASE_PREFIX.length)).getTime();
  return Number.isFinite(at) && now - at < TIME_LEASE_MS;
}

export interface TimeDrainOptions {
  limit?: number;
  now?: number;
  budgetMs?: number;
}

/**
 * Emails the agent of the DEAL the time the client asked to be contacted at
 * (rows written by record_preferred_contact_time, migration 0036). Email only:
 * never a second WhatsApp template (D14). The in-app bell was already inserted
 * by the RPC.
 *
 * Each row is claimed with an update conditioned on the attempts value just
 * read, and the claim leaves a 2-minute lease in last_error, so overlapping runs
 * (cron every minute, 60 s budget, a manual curl) do not send it twice. A failed
 * send retries with backoff (1, 3, 7, 15 minutes after the row was written); a
 * failed READ is retried too, never mistaken for a missing deal or email. Rows
 * that end with 5 attempts are reported by the grouped alert (lib/match-alerts).
 */
export async function drainTimeNotifications(db: Db, opts: TimeDrainOptions = {}): Promise<TimeDrainResult> {
  const { limit = 20, now = Date.now(), budgetMs = DEFAULT_TIME_BUDGET_MS } = opts;
  const result: TimeDrainResult = { claimed: 0, sent: 0, failed: 0 };
  const deadline = Date.now() + budgetMs;

  const { data, error } = await db
    .from("agent_time_notifications")
    .select("id, deal_id, preferred_contact_time, created_at, attempts, last_error")
    .is("email_sent_at", null)
    .lt("attempts", MAX_TIME_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[agent-notifications] time rows read failed:", error.code ?? error.message);
    return { ...result, error: `read: ${error.code ?? error.message}` };
  }

  for (const row of (data ?? []) as TimeRow[]) {
    if (Date.now() > deadline) break;
    if (!isDue(row, now) || isLeased(row, now)) continue;

    const { data: claimed, error: claimErr } = await db
      .from("agent_time_notifications")
      .update({ attempts: row.attempts + 1, last_error: `${LEASE_PREFIX}${new Date(now).toISOString()}` })
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .is("email_sent_at", null)
      .select("id");
    if (claimErr) {
      result.failed++;
      console.error("[agent-notifications] time row claim failed", row.id, ":", claimErr.code ?? claimErr.message);
      continue;
    }
    if (!claimed || (claimed as unknown[]).length === 0) continue; // another run owns it
    result.claimed++;

    const outcome = await sendTimeEmail(db, row).catch(() => ({ sent: false, patch: { last_error: "send_threw" } }));
    if (outcome.sent) result.sent++;
    else result.failed++;
    const { error: e } = await db.from("agent_time_notifications").update(outcome.patch).eq("id", row.id);
    if (e) console.error("[agent-notifications] time row update failed", row.id, ":", e.code ?? e.message);
  }
  return result;
}

/** Reads the deal, its agent and the client's first name, and sends the email. Returns the row's settlement. */
async function sendTimeEmail(db: Db, row: TimeRow): Promise<{ sent: boolean; patch: Record<string, unknown> }> {
  // A permanent problem stops retrying; the row keeps its reason and the grouped alert reports it.
  const giveUp = (reason: string) => ({ sent: false, patch: { attempts: MAX_TIME_ATTEMPTS, last_error: reason } });
  const retry = (reason: string) => ({ sent: false, patch: { last_error: reason } });

  const { data: deal, error: dealErr } = await db
    .from("deals").select("id, agent_id, contact_id").eq("id", row.deal_id).maybeSingle();
  if (dealErr) return retry("read_error deals");
  if (!deal) return giveUp("deal_not_found");
  const { data: agent, error: agentErr } = await db
    .from("agents").select("id, full_name, email").eq("id", deal.agent_id as string).maybeSingle();
  if (agentErr) return retry("read_error agents");
  if (!agent?.email) return giveUp("agent_without_email");
  const { data: contact, error: contactErr } = await db
    .from("contacts").select("first_name").eq("id", deal.contact_id as string).maybeSingle();
  if (contactErr) return retry("read_error contacts");

  // Both texts come from the client: same link and control-character stripping as the template.
  const name = cleanEmailValue(oneLine(contact?.first_name as string | null, 40), 40) || "tu cliente";
  const first = cleanEmailValue(agent.full_name as string | null, 60).split(" ")[0];
  const hora = cleanEmailValue(oneLine(row.preferred_contact_time, 80), 80) || "No especificado";
  const ok = await sendAgentEmail({
    to: agent.email as string,
    subject: `[CRM] Hora preferida de ${name}`.slice(0, 160),
    text: [
      first ? `Hola ${first},` : "Hola,",
      "",
      `Tu cliente ${name} indico la hora a la que prefiere que lo contactes:`,
      "",
      `  ${hora}`,
      "",
      `Abrir en el CRM: ${crmLeadLink(APP_URL, deal.id as string, deal.contact_id as string)}`,
    ].join("\n"),
  });
  return ok
    ? { sent: true, patch: { email_sent_at: new Date().toISOString(), last_error: null } }
    : retry("send_failed");
}
