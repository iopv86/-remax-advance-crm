import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { enqueueCapiEvent } from "@/lib/meta-capi";

// POST /api/meta/capi  { deal_id, stage }
// Enqueues a Meta Conversions API event for a pipeline stage change.
// Auth: authenticated CRM user. PII (email/phone/ctwa_clid) and value are
// resolved SERVER-SIDE from the deal — the client only names the deal + stage.
// Anti-IDOR: the deal is read through the USER client (RLS); if the user can't
// see it, nothing is enqueued. The outbox write uses the service-role client.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const rl = await checkRateLimit(`meta-capi:${user.id}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  let body: { deal_id?: string; stage?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }); }
  if (!body.deal_id || !body.stage) return NextResponse.json({ ok: false });

  // RLS-enforced read: only deals the user may see come back.
  const { data: deal } = await supabase
    .from("deals")
    .select("id, deal_value, currency, contact_id")
    .eq("id", body.deal_id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ ok: false }, { status: 404 });

  let contact: { email?: string | null; phone?: string | null; ctwa_clid?: string | null } | null = null;
  if (deal.contact_id) {
    const { data } = await supabase
      .from("contacts").select("email, phone, ctwa_clid").eq("id", deal.contact_id).maybeSingle();
    contact = data;
  }

  const db = adminClient();

  // D2 gate — applies ONLY to the negative (closed_lost) signal: don't tell Meta
  // a lead is bad unless Meta already saw it (a CTWA click, or a prior enqueued event).
  if (body.stage === "closed_lost") {
    let gateOpen = !!contact?.ctwa_clid;
    if (!gateOpen && deal.contact_id) {
      const { data: prior } = await db
        .from("capi_outbox").select("id").eq("contact_id", deal.contact_id).limit(1).maybeSingle();
      gateOpen = !!prior;
    }
    if (!gateOpen) return NextResponse.json({ ok: true, skipped: "no_prior_capi" });
  }

  await enqueueCapiEvent(db, {
    stage:     body.stage,
    dealId:    deal.id,
    contactId: deal.contact_id,
    email:     contact?.email,
    phone:     contact?.phone,
    ctwaClid:  contact?.ctwa_clid,
    dealValue: deal.deal_value,
    currency:  deal.currency,
  });

  return NextResponse.json({ ok: true });
}
