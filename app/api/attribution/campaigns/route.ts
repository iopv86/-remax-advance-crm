import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

// Stage buckets for funnel counting
const CONTACTED_STAGES = [
  "contacted", "qualified", "showing_scheduled", "showing_done",
  "offer_made", "negotiation", "promesa_de_venta", "financiamiento",
  "contract", "due_diligence", "closed_won",
] as const;

const QUALIFIED_STAGES = [
  "qualified", "showing_scheduled", "showing_done",
  "offer_made", "negotiation", "promesa_de_venta", "financiamiento",
  "contract", "due_diligence", "closed_won",
] as const;

const SHOWING_DONE_STAGES = [
  "showing_done", "offer_made", "negotiation", "promesa_de_venta",
  "financiamiento", "contract", "due_diligence", "closed_won",
] as const;

function verifyApiKey(req: NextRequest): boolean {
  const apiKey = process.env.ADVANCE_CRM_API_KEY;
  if (!apiKey) return false;
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(apiKey);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

// GET /api/attribution/campaigns?from=YYYY-MM-DD&to=YYYY-MM-DD
// Auth: Authorization: Bearer {ADVANCE_CRM_API_KEY}
export async function GET(req: NextRequest) {
  if (!verifyApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const defaults = defaultDateRange();
  const rawFrom = params.get("from") ?? defaults.from;
  const rawTo = params.get("to") ?? defaults.to;

  if (!isValidDate(rawFrom) || !isValidDate(rawTo)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  // from is inclusive start of day, to is inclusive end of day
  const fromTs = `${rawFrom}T00:00:00.000Z`;
  const toTs = `${rawTo}T23:59:59.999Z`;

  const db = adminClient();

  // Fetch contacts with meta_campaign_id in date range, joined with their deals
  const { data: contacts, error } = await db
    .from("contacts")
    .select("id, meta_campaign_id, deals(stage, deal_value, commission_value)")
    .not("meta_campaign_id", "is", null)
    .gte("created_at", fromTs)
    .lte("created_at", toTs);

  if (error) {
    console.error("[GET /api/attribution/campaigns] Supabase error:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  // Aggregate by meta_campaign_id
  type CampaignRow = {
    meta_campaign_id: string;
    lead_count: number;
    contacted_count: number;
    qualified_count: number;
    showing_done_count: number;
    closed_won_count: number;
    pipeline_value: number;
    total_commission: number;
  };

  const map = new Map<string, CampaignRow>();

  for (const contact of contacts ?? []) {
    const cid = contact.meta_campaign_id as string;
    if (!map.has(cid)) {
      map.set(cid, {
        meta_campaign_id: cid,
        lead_count: 0,
        contacted_count: 0,
        qualified_count: 0,
        showing_done_count: 0,
        closed_won_count: 0,
        pipeline_value: 0,
        total_commission: 0,
      });
    }
    const row = map.get(cid)!;
    row.lead_count++;

    const deals = (contact.deals as Array<{
      stage: string;
      deal_value: number | null;
      commission_value: number | null;
    }> | null) ?? [];

    for (const deal of deals) {
      const stage = deal.stage;

      if ((CONTACTED_STAGES as readonly string[]).includes(stage)) {
        row.contacted_count++;
      }
      if ((QUALIFIED_STAGES as readonly string[]).includes(stage)) {
        row.qualified_count++;
      }
      if ((SHOWING_DONE_STAGES as readonly string[]).includes(stage)) {
        row.showing_done_count++;
      }
      if (stage === "closed_won") {
        row.closed_won_count++;
        row.total_commission += deal.commission_value ?? 0;
      }
      // Pipeline value: all active deals (not closed_lost or lead_captured)
      if (stage !== "closed_lost" && stage !== "lead_captured") {
        row.pipeline_value += deal.deal_value ?? 0;
      }
    }
  }

  const result = Array.from(map.values());
  return NextResponse.json(result);
}
