import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendAgentEmail } from "@/lib/email";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://remax-advance-crm.vercel.app";

interface NotifyRow {
  id: string;
  deal_id: string | null;
  agent_id: string | null;
  title: string | null;
  due_date?: string | null;
}

// POST /api/notify/activity  { kind: "activity" | "task", id: uuid }
// Immediate confirmation email to the deal's ASSIGNED agent when an activity is
// logged or a follow-up (task) is scheduled. Fired client-side after the insert.
//
// Anti-IDOR: the just-created row is re-read with the USER-scoped client, so RLS
// rejects any id the caller cannot see (returns 403). The service-role client is
// used only AFTER that check, to look up the assigned agent's email (which the
// caller's own RLS may not expose). Self-notifications are skipped
// (creator === assigned agent) so an agent isn't emailed about their own logging.
// Best-effort: returns 200 on non-security failures so the UI never breaks.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const kind = body?.kind;
    const id = body?.id;
    if ((kind !== "activity" && kind !== "task") || typeof id !== "string" || !UUID_RE.test(id)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: caller } = await supabase
      .from("agents").select("id").eq("email", user.email).maybeSingle();
    if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const creatorAgentId = caller.id as string;

    // RLS-scoped read of the just-created row. Null => caller can't see it => 403.
    const table = kind === "activity" ? "activities" : "tasks";
    const cols = kind === "activity"
      ? "id, deal_id, agent_id, title"
      : "id, deal_id, agent_id, title, due_date";
    const { data, error: rowErr } = await supabase.from(table).select(cols).eq("id", id).maybeSingle();
    if (rowErr) {
      console.error(`[notify/activity] ${table} read error:`, rowErr.message);
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    if (!data) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const row = data as unknown as NotifyRow;

    // Recipient = the deal's assigned agent (fallback to the row owner for
    // contact-level rows with no deal).
    let recipientAgentId = row.agent_id;
    const dealId = row.deal_id;
    if (dealId) {
      const { data: deal } = await supabase
        .from("deals").select("agent_id").eq("id", dealId).maybeSingle();
      if (deal?.agent_id) recipientAgentId = deal.agent_id as string;
    }
    if (!recipientAgentId) return NextResponse.json({ ok: true, skipped: "no-recipient" });

    // Don't email an agent about their own action.
    if (recipientAgentId === creatorAgentId) return NextResponse.json({ ok: true, skipped: "self" });

    // Post-authorization service-role lookup for the recipient's email.
    const admin = adminClient();
    const { data: agent } = await admin
      .from("agents").select("email").eq("id", recipientAgentId).maybeSingle();
    const to = (agent?.email as string | null) ?? null;
    if (!to) return NextResponse.json({ ok: true, skipped: "no-email" });

    // Notify-once: claim the row (guarded on IS NULL) before sending so repeat
    // POSTs of the same id can't spam the agent / burn Resend quota. Uses the
    // service-role client — the RLS read above already authorized this caller.
    const { data: claimed } = await admin
      .from(table)
      .update({ notified_at: new Date().toISOString() })
      .eq("id", id)
      .is("notified_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) return NextResponse.json({ ok: true, skipped: "already-notified" });

    const title = row.title?.trim() || "(sin titulo)";
    const link = dealId ? `${APP_URL}/dashboard/pipeline/${dealId}` : APP_URL;
    let subject: string;
    let text: string;
    if (kind === "task") {
      const due = row.due_date ? ` (vence ${String(row.due_date).slice(0, 10)})` : "";
      subject = `Nuevo seguimiento: ${title}`;
      text = `Se agendo un seguimiento en tu oportunidad:\n\n${title}${due}\n\nAbrir en el CRM: ${link}`;
    } else {
      subject = `Nueva actividad: ${title}`;
      text = `Se registro una actividad en tu oportunidad:\n\n${title}\n\nAbrir en el CRM: ${link}`;
    }

    await sendAgentEmail({ to, subject, text });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify/activity] error:", (err as Error).message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
