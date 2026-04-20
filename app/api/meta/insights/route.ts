import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/meta/insights
// Returns aggregated meta_ad_insights data.
// When META_ACCESS_TOKEN is set, /api/meta/sync must be called first to populate.
export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent || !["admin", "manager"].includes(agent.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: insights, error } = await supabase
    .from("meta_ad_insights")
    .select("*")
    .order("date", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totalSpend   = (insights ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const totalLeads   = (insights ?? []).reduce((s, r) => s + (r.leads ?? 0), 0);
  const totalClicks  = (insights ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalImpressions = (insights ?? []).reduce((s, r) => s + (r.impressions ?? 0), 0);
  const cpl  = totalLeads  > 0 ? totalSpend / totalLeads  : null;
  const ctr  = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;
  const roas = totalSpend  > 0 ? null : null; // ROAS requires revenue data — future

  return NextResponse.json({
    summary: { totalSpend, totalLeads, totalClicks, totalImpressions, cpl, ctr, roas },
    rows: insights ?? [],
    connected: !!process.env.META_ACCESS_TOKEN,
  });
}
