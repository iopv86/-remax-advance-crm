import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendAgentEmail } from "@/lib/email";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://remax-advance-crm.vercel.app";

// GET /api/cron/task-reminders
// Daily sweep (Vercel cron, noon DR). Emails the assigned agent a reminder for
// each follow-up (task) whose due_date has arrived (<= now) and is still
// pending/in_progress, exactly once. Notify-once via tasks.reminder_sent_at,
// claimed BEFORE sending so cron retries/overlap never double-send. due_date is
// stored at midnight UTC of the selected day, so a noon-UTC (16:00) run fires on
// the due calendar day for DR (UTC-4). Service-role client (trusted server job);
// the CRON_SECRET bearer is the only auth.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !safeCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("tasks")
    .select("id, deal_id, agent_id, title, due_date")
    .not("due_date", "is", null)
    .lte("due_date", nowIso)
    .in("status", ["pending", "in_progress"])
    .is("reminder_sent_at", null)
    .limit(100);

  if (error) {
    console.error("[cron/task-reminders] query error:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  for (const t of due ?? []) {
    // Claim first (guard on still-null) so concurrent runs don't double-send.
    // The claim is RELEASED below if the send ultimately fails, so a transient
    // Resend/DB error is retried on the next daily run instead of being lost.
    const { data: claimed, error: claimErr } = await db
      .from("tasks")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", t.id)
      .is("reminder_sent_at", null)
      .select("id")
      .maybeSingle();
    if (claimErr) { console.error("[cron/task-reminders] claim error:", claimErr.message); skipped++; continue; }
    if (!claimed) { skipped++; continue; }

    // Recipient = the deal's assigned agent if the task is on a deal, else the task owner.
    let ok = false;
    let recipientId = t.agent_id as string | null;
    if (t.deal_id) {
      const { data: deal, error: dealErr } = await db.from("deals").select("agent_id").eq("id", t.deal_id).maybeSingle();
      if (dealErr) console.error("[cron/task-reminders] deal read error:", dealErr.message);
      if (deal?.agent_id) recipientId = deal.agent_id as string;
    }
    if (recipientId) {
      const { data: agent, error: agentErr } = await db.from("agents").select("email").eq("id", recipientId).maybeSingle();
      if (agentErr) console.error("[cron/task-reminders] agent read error:", agentErr.message);
      const to = (agent?.email as string | null) ?? null;
      if (to) {
        const title = (t.title as string | null)?.trim() || "(sin titulo)";
        const link = t.deal_id ? `${APP_URL}/dashboard/pipeline/${t.deal_id}` : APP_URL;
        ok = await sendAgentEmail({
          to,
          subject: `Recordatorio de seguimiento: ${title}`,
          text: `Tienes un seguimiento pendiente:\n\n${title} (vence ${String(t.due_date).slice(0, 10)})\n\nAbrir en el CRM: ${link}`,
        });
      }
    }

    if (ok) {
      sent++;
    } else {
      // Release the claim so the next daily run retries (transient send failure
      // or a fixable data gap, e.g. the agent email was missing).
      await db.from("tasks").update({ reminder_sent_at: null }).eq("id", t.id);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, total: (due ?? []).length });
}
