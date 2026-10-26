import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { sendAgentEmail } from "@/lib/email";
import { cleanEmailValue } from "@/lib/lead-email";

/**
 * Grouped alert to LEAD_ALERT_EMAIL for the leads that need a human (D01 D7,
 * REQ 3 and 15): resolve_contact events 'ambiguous' (two or more candidates,
 * nothing created), 'no_agent' (round-robin returned nobody) and 'dup_group'
 * (an existing duplicate group was hit), agent notifications that ended 'dead'
 * after 5 attempts, and preferred-time emails (D14) that ran out of attempts.
 * 'variant' and 'unarchived' are informational and are not alerted.
 *
 * Same discipline as app/api/cron/lead-audit: one email for everything pending,
 * at most one every 30 minutes (an alert channel that repeats gets muted), and
 * an item is marked alerted ONLY after the send succeeded. The cooldown row is
 * claimed with a conditional update before sending, so two overlapping cron runs
 * cannot both send; a failed send gives the claim back so the next run retries.
 * The email carries only the last 4 digits of a phone and links to the CRM.
 */

type Db = ReturnType<typeof adminClient>;

export const MATCH_ALERT_EVERY_MS = 30 * 60 * 1000;
const COOLDOWN_KEY = "match_alert_last_at";
const ALERT_KINDS = ["ambiguous", "no_agent", "dup_group"];
// One lead repeats its event on every poller pass (see groupEvents): read far more
// rows than lines, so a burst cannot outgrow what one email drains.
const MAX_EVENTS = 1000;
const MAX_DEAD = 50;
const MAX_TIME = 50;
// agent_time_notifications has no alerted_at column (0036): attempts 5 = given up,
// 6 = given up and already reported. drainTimeNotifications only reads attempts < 5.
const TIME_GIVEN_UP = 5;
const TIME_REPORTED = 6;

// Same fallback as lib/meta-leads.ts.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://remax-advance-crm.vercel.app").replace(/\/+$/, "");

export interface MatchAlertResult {
  ok: boolean;
  reason?: string;
  events: number;
  dead: number;
  time: number;
}

interface EventRow {
  id: number;
  created_at: string;
  kind: string;
  caller: string;
  key_last4: string | null;
  contact_id: string | null;
  candidate_ids: string[] | null;
}

interface DealRow {
  id: number;
  deal_id: string;
  last_error: string | null;
}

const codeOf = (e: { code?: string; message: string }) => e.code ?? e.message;
const last4 = (v: string | null) => cleanEmailValue(v, 40).replace(/\D/g, "").slice(-4) || "----";

const eventIds = (e: EventRow) =>
  [...new Set([e.contact_id, ...(e.candidate_ids ?? [])].filter((x): x is string => !!x))].sort();

/**
 * The same lead produces one identical event per poller pass while it sits in
 * the 15-minute overlap (ambiguous has no 24h window in the RPC): one line per
 * distinct event, with the repeat count.
 */
function groupEvents(events: EventRow[]): { e: EventRow; count: number }[] {
  const groups = new Map<string, { e: EventRow; count: number }>();
  for (const e of events) {
    const k = [e.kind, e.caller, last4(e.key_last4), ...eventIds(e)].join("|");
    const g = groups.get(k);
    if (g) g.count++;
    else groups.set(k, { e, count: 1 });
  }
  return [...groups.values()];
}

function eventLine({ e, count }: { e: EventRow; count: number }): string {
  const ids = eventIds(e);
  const times = count > 1 ? ` (x${count})` : "";
  const head = `${cleanEmailValue(e.created_at, 40)} ${cleanEmailValue(e.kind, 20)} origen=${cleanEmailValue(e.caller, 10)} ...${last4(e.key_last4)}${times}`;
  if (ids.length === 0) return `  ${head}`;
  return ids.map((id) => `  ${head} -> ${APP_URL}/dashboard/contacts/${cleanEmailValue(id, 40)}`).join("\n");
}

const dealLink = (d: DealRow) => `${APP_URL}/dashboard/pipeline/${cleanEmailValue(d.deal_id, 40)}`;
const reason = (d: DealRow) => cleanEmailValue(d.last_error, 120) || "sin detalle";
const deadLine = (d: DealRow) => `  aviso del deal ${dealLink(d)} sin enviar tras 5 intentos: ${reason(d)}`;
const timeLine = (d: DealRow) => `  correo de hora preferida del deal ${dealLink(d)} sin enviar: ${reason(d)}`;

export async function sendGroupedMatchAlerts(
  db: Db,
  { to, now = Date.now() }: { to: string | undefined; now?: number },
): Promise<MatchAlertResult> {
  const none = { events: 0, dead: 0, time: 0 };
  if (!to) return { ok: false, reason: "LEAD_ALERT_EMAIL not set", ...none };

  const { data: cfg, error: cfgErr } = await db
    .from("agency_config").select("value").eq("key", COOLDOWN_KEY).maybeSingle();
  if (cfgErr) return { ok: false, reason: `read cooldown: ${codeOf(cfgErr)}`, ...none };
  const last = (cfg?.value as string | null | undefined) ?? null;
  const lastMs = last ? new Date(last).getTime() : NaN;
  if (Number.isFinite(lastMs) && now - lastMs < MATCH_ALERT_EVERY_MS) return { ok: true, reason: "cooldown", ...none };

  const { data: evData, error: evErr } = await db
    .from("contact_match_events")
    .select("id, created_at, kind, caller, key_last4, contact_id, candidate_ids")
    .in("kind", ALERT_KINDS)
    .is("alerted_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_EVENTS);
  if (evErr) return { ok: false, reason: `read events: ${codeOf(evErr)}`, ...none };
  const { data: deadData, error: deadErr } = await db
    .from("agent_lead_notifications")
    .select("id, deal_id, last_error")
    .eq("status", "dead")
    .is("alerted_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_DEAD);
  if (deadErr) return { ok: false, reason: `read dead: ${codeOf(deadErr)}`, ...none };
  const { data: timeData, error: timeErr } = await db
    .from("agent_time_notifications")
    .select("id, deal_id, last_error")
    .is("email_sent_at", null)
    .eq("attempts", TIME_GIVEN_UP)
    .order("created_at", { ascending: true })
    .limit(MAX_TIME);
  if (timeErr) return { ok: false, reason: `read time: ${codeOf(timeErr)}`, ...none };

  const events = (evData ?? []) as EventRow[];
  const dead = (deadData ?? []) as DealRow[];
  const time = (timeData ?? []) as DealRow[];
  if (events.length === 0 && dead.length === 0 && time.length === 0) return { ok: true, reason: "nothing_to_alert", ...none };
  const counts = { events: events.length, dead: dead.length, time: time.length };

  // Claim the cooldown before sending: only one overlapping run gets past this.
  const nowIso = new Date(now).toISOString();
  let claimed: boolean;
  if (cfg) {
    // PostgREST eq.null compares with the TEXT "null": a NULL value needs is().
    const q = db.from("agency_config").update({ value: nowIso }).eq("key", COOLDOWN_KEY);
    const { data: upd, error: updErr } = await (last === null ? q.is("value", null) : q.eq("value", last)).select("key");
    if (updErr) return { ok: false, reason: `claim cooldown: ${codeOf(updErr)}`, ...counts };
    claimed = (upd as unknown[] | null)?.length === 1;
  } else {
    const { error: insErr } = await db.from("agency_config").insert({ key: COOLDOWN_KEY, value: nowIso });
    if (insErr && insErr.code !== "23505") return { ok: false, reason: `claim cooldown: ${codeOf(insErr)}`, ...counts };
    claimed = !insErr;
  }
  if (!claimed) return { ok: true, reason: "claimed_by_other_run", ...counts };

  const grouped = groupEvents(events);
  const total = grouped.length + dead.length + time.length;
  const sent = await sendAgentEmail({
    to,
    subject: `[CRM] Leads que requieren revision (${total})`,
    text: [
      "Estos leads necesitan que alguien los revise en el CRM:",
      "",
      ...grouped.map(eventLine),
      ...(dead.length ? ["", ...dead.map(deadLine)] : []),
      ...(time.length ? ["", ...time.map(timeLine)] : []),
      "",
      "ambiguous: el telefono casa con 2 o mas contactos; no se creo ni se eligio ninguno.",
      "no_agent: el round-robin no devolvio agente; el lead queda sin asignar.",
      "dup_group: el cliente ya tiene contactos duplicados (se fusionan en la Etapa 2c).",
    ].join("\n"),
  });

  if (!sent) {
    // Give the claim back: the next run retries instead of waiting 30 minutes.
    const { error: relErr } = await db
      .from("agency_config").update({ value: last ?? new Date(0).toISOString() })
      .eq("key", COOLDOWN_KEY).eq("value", nowIso);
    if (relErr) console.error("[match-alerts] cooldown release failed:", codeOf(relErr));
    console.error(`[match-alerts] alert send FAILED for ${total} item(s); will retry next run`);
    return { ok: false, reason: "send_failed", ...counts };
  }

  // The email went out. A failed mark means the same items come back in 30 minutes: say so.
  const marks = [
    events.length ? db.from("contact_match_events").update({ alerted_at: nowIso }).in("id", events.map((e) => e.id)) : null,
    dead.length ? db.from("agent_lead_notifications").update({ alerted_at: nowIso }).in("id", dead.map((d) => d.id)) : null,
    time.length ? db.from("agent_time_notifications").update({ attempts: TIME_REPORTED }).in("id", time.map((d) => d.id)) : null,
  ];
  let markFailed = false;
  for (const m of marks) {
    if (!m) continue;
    const { error } = await m;
    if (error) {
      markFailed = true;
      console.error("[match-alerts] alerted mark failed:", codeOf(error));
    }
  }
  return markFailed ? { ok: false, reason: "mark_alerted_failed", ...counts } : { ok: true, ...counts };
}
