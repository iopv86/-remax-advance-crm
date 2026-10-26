import "server-only";
import type { adminClient } from "@/lib/supabase/admin";

/**
 * D18: a WhatsApp contact that arrived with the Lead Form's prefilled text
 * ("Enlace: ..." / "Link: ...") and, 15 minutes later, still has no agent.
 *
 * That text means the person submitted a Lead Form; normally the form reaches
 * the CRM within a minute and resolve_contact attaches it to this contact and
 * assigns the agent. When it never does (a different or invalid phone on the
 * form; measured 1 of 8), the contact would sit unassigned forever. This sweep
 * assigns it by round-robin, opens the intake deal and thereby enqueues the
 * agent notification. It does not contradict D10: the text never assigns an
 * agent, the expiry without a form does.
 *
 * Idempotent by the database: resolve_contact assigns under its advisory lock
 * with `where agent_id is null`, and create_intake_deal under its own lock.
 * The 7-day window keeps the first deploy from assigning old contacts.
 * Runs only while agent_notify_queue_live is on: without the queue, the deal
 * would be created with a 'skipped' notification and nobody would tell the agent.
 */

type Db = ReturnType<typeof adminClient>;

/** Same pattern as TEXTO_PRELLENADO in Ava, checked on the first inbound message. */
export const PREFILLED_RE = /^\W*(enlace|link)\s*:/i;

export interface SweepOptions {
  now?: number;
  minAgeMs?: number;
  maxAgeMs?: number;
  limit?: number;
}

export interface SweepResult {
  skipped?: string;
  candidates: number;
  swept: number;
  sweptNoAgent: number;
  errors: number;
  error?: string;
}

const codeOf = (e: { code?: string; message: string }) => e.code ?? e.message;

/** Same reading of the flag as create_intake_deal (migration 0036). */
export function isQueueLive(value: unknown): boolean {
  return typeof value === "string" && ["true", '"true"'].includes(value.trim().toLowerCase());
}

export async function assignStalePrefilledContacts(db: Db, opts: SweepOptions = {}): Promise<SweepResult> {
  const { now = Date.now(), minAgeMs = 15 * 60_000, maxAgeMs = 7 * 24 * 3_600_000, limit = 100 } = opts;
  const result: SweepResult = { candidates: 0, swept: 0, sweptNoAgent: 0, errors: 0 };

  const { data: flag, error: flagErr } = await db
    .from("agency_config").select("value").eq("key", "agent_notify_queue_live").maybeSingle();
  if (flagErr) return { ...result, error: `read flag: ${codeOf(flagErr)}` };
  if (!isQueueLive(flag?.value)) return { ...result, skipped: "queue_not_live" };

  const since = new Date(now - maxAgeMs).toISOString();
  const until = new Date(now - minAgeMs).toISOString();

  // Unassigned WhatsApp contacts in the window, newest first: measured 4 in the last 7 days
  // (2026-10-25), so `limit` is a safety cap, not a working limit. Querying contacts (not
  // messages) keeps already-assigned contacts out of the page entirely.
  const { data: cands, error: candErr } = await db
    .from("contacts")
    .select("id, phone_key, created_at")
    .eq("source", "ctwa_ad")
    .is("agent_id", null)
    .not("phone_key", "is", null)
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (candErr) return { ...result, error: `read contacts: ${codeOf(candErr)}` };

  for (const c of (cands ?? []) as { id: string; phone_key: string }[]) {
    // The FIRST inbound message decides: a client who said "hola" and pasted the link later is not this case.
    const { data: first, error: firstErr } = await db
      .from("messages")
      .select("content")
      .eq("contact_id", c.id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstErr) {
      result.errors++;
      console.error("[prefilled-sweep] first message read failed for contact", c.id, ":", codeOf(firstErr));
      continue;
    }
    if (!PREFILLED_RE.test((first?.content as string | null) ?? "")) continue;
    result.candidates++;

    // phone_key('+' || k) = k, so the pair always passes the RPC's key check.
    const { data: rows, error: resErr } = await db.rpc("resolve_contact", {
      p_phone: `+${c.phone_key}`,
      p_key: c.phone_key,
      p_meta_lead_id: null,
      p_first_name: null,
      p_last_name: null,
      p_source: "ctwa_ad",
      p_assign_rr: true,
      p_create_without_agent: false,
    });
    if (resErr) {
      result.errors++;
      console.error("[prefilled-sweep] resolve_contact failed for contact", c.id, ":", codeOf(resErr));
      continue;
    }
    const r = ((rows ?? []) as { outcome: string; contact_id: string | null; agent_id: string | null; agent_assigned_now: boolean }[])[0];
    if (r?.outcome === "no_agent") {
      result.sweptNoAgent++;
      continue;
    }
    // Somebody else assigned it in the meantime (or it belongs to a group whose survivor has an agent): nothing to do.
    if (r?.outcome !== "found" || !r.agent_assigned_now || !r.contact_id || !r.agent_id) continue;

    const args = { p_contact_id: r.contact_id, p_agent_id: r.agent_id };
    let { data: dealId, error: dealErr } = await db.rpc("create_intake_deal", args);
    // Once assigned, the contact is no longer a candidate: this is the only chance to open its deal.
    if (dealErr) ({ data: dealId, error: dealErr } = await db.rpc("create_intake_deal", args));
    if (dealErr) {
      // The agent is set but there is no deal: the sweep will not see it again. Loud on purpose.
      result.errors++;
      console.error("[prefilled-sweep] create_intake_deal FAILED after assignment for contact", r.contact_id, ":", codeOf(dealErr));
      continue;
    }
    if (dealId) result.swept++;
  }
  return result;
}
