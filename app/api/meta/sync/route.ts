import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/meta/sync
// Syncs Meta Ads campaign insights into meta_ad_insights table.
// Requires META_ACCESS_TOKEN and META_AD_ACCOUNT_ID env vars.
// Call via cron or manually from the Ads dashboard.
export async function POST(request: Request) {
  // Verify cron secret or admin session
  const authHeader = request.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: agent } = await supabase.from("agents").select("role").eq("email", user.email!).maybeSingle();
    if (!agent || agent.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token     = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be set in environment variables." },
      { status: 503 }
    );
  }

  // TODO: call Meta Graph API and upsert into meta_ad_insights
  // Example: GET https://graph.facebook.com/v19.0/{accountId}/insights
  //   ?fields=campaign_id,campaign_name,impressions,clicks,spend,leads&date_preset=last_30d
  //   &access_token={token}
  // Then upsert rows into meta_ad_insights using ON CONFLICT(campaign_id, date) DO UPDATE

  return NextResponse.json({ message: "Meta Ads sync stub — configure META_ACCESS_TOKEN to activate." });
}
