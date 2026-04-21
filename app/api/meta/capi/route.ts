import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { fireCapiEvent } from "@/lib/meta-capi";

// POST /api/meta/capi
// Fires a Meta Conversions API event for a pipeline stage change.
// Auth: must be an authenticated CRM user.
// fire-and-forget — always returns 200 to not block the UI.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const rl = await checkRateLimit(`meta-capi:${user.id}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ ok: false });

  let body: {
    stage?: string;
    email?: string | null;
    phone?: string | null;
    deal_value?: number | null;
    currency?: string | null;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }); }

  if (!body.stage) return NextResponse.json({ ok: false });

  fireCapiEvent({
    stage:     body.stage,
    email:     body.email,
    phone:     body.phone,
    dealValue: body.deal_value,
    currency:  body.currency,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
