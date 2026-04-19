import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EVENTS = ["open", "property_view", "pdf_download", "whatsapp_click", "email_click"];

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
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
