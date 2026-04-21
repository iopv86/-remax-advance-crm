import { timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const META_GRAPH_VERSION = "v19.0";
const META_FIELDS = "campaign_id,campaign_name,impressions,clicks,spend,leads,reach,actions";
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
  // Meta returns leads either as a top-level field or inside actions[]
  if (typeof row.leads === "number") return row.leads;
  const leadAction = row.actions?.find(
    (a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
  );
  return leadAction ? parseInt(leadAction.value, 10) : 0;
}

// POST /api/meta/sync
// Fetches Meta Ads campaign insights and upserts into meta_ad_insights.
// Auth: admin session OR valid CRON_SECRET Bearer token.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && safeCompare(authHeader ?? "", `Bearer ${cronSecret}`);

  if (!isCron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(`meta-sync:${user.id}`, 10, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

    const { data: agent } = await supabase
      .from("agents")
      .select("role")
      .eq("email", user.email!)
      .maybeSingle();
    if (!agent || agent.role !== "admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = process.env.META_ACCESS_TOKEN;
  const rawAccountId = process.env.META_AD_ACCOUNT_ID;
  // Strip act_ prefix if user included it — API call adds it
  const accountId = rawAccountId?.replace(/^act_/, "");

  if (!token || !accountId) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in environment variables." },
      { status: 503 }
    );
  }

  // Fetch from Meta Graph API (paginated)
  const allRows: MetaInsightRow[] = [];
  let url: string | null =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${accountId}/insights` +
    `?fields=${META_FIELDS}&date_preset=${DATE_PRESET}&level=campaign&access_token=${token}`;

  while (url) {
    const res = await fetch(url);
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

  // Shape rows for upsert
  const rows = allRows.map((r) => ({
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    date: r.date_start,
    impressions: parseInt(r.impressions, 10) || 0,
    clicks: parseInt(r.clicks, 10) || 0,
    spend: parseFloat(r.spend) || 0,
    reach: parseInt(r.reach, 10) || 0,
    leads: extractLeads(r),
    cpl: extractLeads(r) > 0 ? parseFloat(r.spend) / extractLeads(r) : null,
  }));

  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from("meta_ad_insights")
    .upsert(rows, { onConflict: "campaign_id,date" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.redirect(`${origin}/dashboard/ads?tab=meta&synced=${rows.length}`, { status: 303 });
}
