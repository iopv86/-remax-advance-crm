import { timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveMetaConfig } from "@/lib/meta-config";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const META_GRAPH_VERSION = "v19.0";
const META_FIELDS = "campaign_id,campaign_name,impressions,clicks,spend,reach,actions";
const DATE_PRESET = "last_30d";

interface MetaInsightRow {
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  date_start: string;
  leads?: number;
  actions?: Array<{ action_type: string; value: string }>;
}

interface MetaApiResponse {
  data: MetaInsightRow[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: { message: string; code: number };
}

function extractLeads(row: MetaInsightRow): number {
  if (typeof row.leads === "number") return row.leads;
  const leadAction = row.actions?.find(
    (a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
  );
  return leadAction ? parseInt(leadAction.value, 10) : 0;
}

// GET /api/cron/meta-sync
// Vercel cron job — runs daily at 06:00 UTC (configured in vercel.json).
// Auth: Authorization: Bearer {CRON_SECRET}
// On success: upserts meta_ad_insights rows and writes meta_last_synced to agency_config.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !safeCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metaCfg = await resolveMetaConfig();
  if (!metaCfg) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not configured." },
      { status: 503 }
    );
  }
  const { accessToken: token, accountId } = metaCfg;

  const metaHeaders = { Authorization: `Bearer ${token}` };
  const allRows: MetaInsightRow[] = [];
  let url: string | null =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${accountId}/insights` +
    `?fields=${META_FIELDS}&date_preset=${DATE_PRESET}&level=campaign`;

  while (url) {
    const res = await fetch(url, { headers: metaHeaders });
    const json = (await res.json()) as MetaApiResponse;

    if (json.error) {
      return NextResponse.json(
        { error: `Meta API error ${json.error.code}: ${json.error.message}` },
        { status: 502 }
      );
    }

    allRows.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }

  if (allRows.length === 0) {
    return NextResponse.json({ message: "No insights returned by Meta API.", upserted: 0 });
  }

  const rows = allRows.map((r) => ({
    campaign_id:   r.campaign_id,
    campaign_name: r.campaign_name,
    date:          r.date_start,
    impressions:   parseInt(r.impressions, 10) || 0,
    clicks:        parseInt(r.clicks, 10) || 0,
    spend:         parseFloat(r.spend) || 0,
    reach:         parseInt(r.reach, 10) || 0,
    leads:         extractLeads(r),
    cpl:           extractLeads(r) > 0 ? parseFloat(r.spend) / extractLeads(r) : null,
  }));

  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from("meta_ad_insights")
    .upsert(rows, { onConflict: "campaign_id,date" });

  if (upsertError) {
    console.error("[cron/meta-sync] upsert error:", upsertError.message);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Record sync timestamp in agency_config
  const syncedAt = new Date().toISOString();
  await supabase
    .from("agency_config")
    .upsert({ key: "meta_last_synced", value: syncedAt }, { onConflict: "key" });

  console.log(`[cron/meta-sync] Upserted ${rows.length} rows at ${syncedAt}`);
  return NextResponse.json({ message: "Sync complete.", upserted: rows.length, synced_at: syncedAt });
}
