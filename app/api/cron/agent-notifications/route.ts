import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { drainAgentNotifications, drainTimeNotifications } from "@/lib/agent-notifications";
import { sendGroupedMatchAlerts } from "@/lib/match-alerts";
import { assignStalePrefilledContacts } from "@/lib/prefilled-sweep";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Runs one stage; a throw becomes null plus a reported error, instead of skipping the stages after it. */
async function stage<T>(name: string, fn: () => Promise<T>, errors: string[]): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[cron/agent-notifications] ${name} threw:`, (e as Error).message);
    errors.push(`${name} threw`);
    return null;
  }
}

// GET /api/cron/agent-notifications
// Vercel cron (every minute). In order: the D18 sweep (so a swept contact's
// notification goes out in the same run), the agent notification queue, the
// preferred-time emails (D14) and the grouped alert to LEAD_ALERT_EMAIL.
// Every counter is in the body and `ok` is false whenever something did not
// happen that should have (an alert that did not go out included), so a curl
// is a real observation.
// Auth: Authorization: Bearer {CRON_SECRET}
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !safeCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminClient();
  const errors: string[] = [];
  const sweep = await stage("sweep", () => assignStalePrefilledContacts(db), errors);
  // 5 rows: even with every Meta call hitting its 8 s timeout they fit in the drain's 30 s budget,
  // so no claimed row is released unattempted. Normal volume is a few rows a day.
  const drain = await stage("drain", () => drainAgentNotifications(db, { limit: 5 }), errors);
  const time = await stage("time", () => drainTimeNotifications(db, { limit: 20 }), errors);
  const alert = await stage("alert", () => sendGroupedMatchAlerts(db, { to: process.env.LEAD_ALERT_EMAIL }), errors);

  if (sweep?.error) errors.push(`sweep: ${sweep.error}`);
  if (sweep && sweep.errors > 0) errors.push(`sweep: ${sweep.errors} fila(s) con error`);
  if (drain?.error) errors.push(`drain: ${drain.error}`);
  if (time?.error) errors.push(`time: ${time.error}`);
  // cooldown, nothing_to_alert and claimed_by_other_run come back with ok: true.
  if (alert && !alert.ok) errors.push(`alert: ${alert.reason ?? "unknown"}`);

  const body = {
    ok: errors.length === 0,
    swept: sweep?.swept ?? 0,
    sweptNoAgent: sweep?.sweptNoAgent ?? 0,
    sweepSkipped: sweep?.skipped,
    sweepErrors: sweep?.errors ?? 0,
    claimed: drain?.claimed ?? 0,
    sent: drain?.sent ?? 0,
    failed: drain?.failed ?? 0,
    dead: drain?.dead ?? 0,
    lostLease: drain?.lostLease ?? 0,
    markErrors: drain?.markErrors ?? 0,
    timeEmailsSent: time?.sent ?? 0,
    timeEmailsFailed: time?.failed ?? 0,
    alertOk: alert?.ok ?? false,
    alertReason: alert?.reason,
    errors,
  };
  console.log(
    `[cron/agent-notifications] swept=${body.swept} sweptNoAgent=${body.sweptNoAgent} claimed=${body.claimed} ` +
    `sent=${body.sent} failed=${body.failed} dead=${body.dead} timeSent=${body.timeEmailsSent} ` +
    `alertOk=${body.alertOk} alertReason=${body.alertReason ?? "-"} errors=${errors.length}`,
  );
  if (errors.length) console.error(`[cron/agent-notifications] errors: ${errors.join("; ")}`);
  return NextResponse.json(body);
}
