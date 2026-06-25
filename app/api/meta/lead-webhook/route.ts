import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { GRAPH_VERSION, processLead, type LeadFormData } from "@/lib/meta-leads";

// ── helpers ──────────────────────────────────────────────────────────────────

function verifySignature(rawBody: Buffer, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Fetch the full lead node (field_data + attribution ids) from the Graph API.
// processLead() consumes this shape directly (lib/meta-leads.ts LeadFormData).
async function fetchLeadData(leadgenId: string): Promise<LeadFormData | null> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}` +
    `?fields=field_data,ad_id,campaign_id,form_id,platform`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    console.error(`[lead-webhook] Graph API ${res.status} for leadgen_id ${leadgenId}`);
    return null;
  }
  return res.json() as Promise<LeadFormData>;
}

// ── GET — Meta challenge verification ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode      = params.get("hub.mode");
  const token     = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ── POST — Lead intake ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Buffer raw body for HMAC verification
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload
  let payload: {
    object?: string;
    entry?: Array<{
      id: string;
      changes?: Array<{
        field: string;
        value: { leadgen_id: string; page_id?: string; ad_id?: string };
      }>;
    }>;
  };

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object !== "page") {
    // Not a leadgen event — acknowledge silently
    return NextResponse.json({ received: true });
  }

  // Gate: only process leads when explicitly enabled.
  // Set META_LEAD_WEBHOOK_ENABLED=true in Vercel env vars to activate.
  // Keeps the HMAC check + 200 response active (Meta requires it) without
  // creating contacts from campaigns not yet routed through this CRM.
  if (process.env.META_LEAD_WEBHOOK_ENABLED !== "true") {
    console.log("[lead-webhook] Intake disabled (META_LEAD_WEBHOOK_ENABLED != true). Payload acknowledged but not processed.");
    return NextResponse.json({ received: true });
  }

  const db = adminClient();

  // 3. Process each leadgen change through the shared intake path. processLead()
  //    is the single authority (dedup + attribution + intake deal + CAPI + notify),
  //    shared with the poller (lib/meta-leads.ts) — no duplicated logic here.
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;

      const { leadgen_id } = change.value;
      if (!leadgen_id) continue;

      // One bad lead (network error, malformed Graph payload) must not abort the
      // rest of the batch or 500 the response (Meta would retry the whole delivery).
      try {
        const lead = await fetchLeadData(leadgen_id);
        // Guard lead.id too: Meta can return a 2xx with an error body on scope/quota
        // issues, leaving id undefined and breaking dedup (meta_lead_id anchor).
        if (!lead?.field_data || !lead.id) continue;

        // The lead node's ad_id is canonical; fall back to the webhook change value.
        lead.ad_id = lead.ad_id ?? change.value.ad_id;

        // The webhook does not list forms, so it has no form name to supply.
        await processLead(db, lead, null);
      } catch (err) {
        console.error("[lead-webhook] intake error for leadgen_id", leadgen_id, ":", (err as Error).message);
      }
    }
  }

  // Meta requires 200 in < 5 s
  return NextResponse.json({ received: true });
}
