import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EVENTS = ["open", "property_view", "pdf_download", "whatsapp_click", "email_click"];

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const rl = await checkRateLimit(`proposal-view:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  let body: { proposalId: string; propertyId?: string; eventType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { proposalId, propertyId, eventType = "open" } = body;

  if (!proposalId || !UUID_RE.test(proposalId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (propertyId && !UUID_RE.test(propertyId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!VALID_EVENTS.includes(eventType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await service.from("proposal_views").insert({
    proposal_id: proposalId,
    property_id: propertyId ?? null,
    event_type: eventType,
  });

  return NextResponse.json({ ok: true });
}
