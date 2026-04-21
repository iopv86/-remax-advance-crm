import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 30 requests per minute per user
  const rl = await checkRateLimit(`market-insights:${user.id}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  // Role guard — org-wide analytics are admin/manager only
  const { data: agentRow } = await supabase.from("agents").select("role").eq("email", user.email!).maybeSingle();
  if (!agentRow || !["admin", "manager"].includes(agentRow.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const now = new Date();
  const startOf30 = new Date(now); startOf30.setDate(now.getDate() - 30);
  const startOf90 = new Date(now); startOf90.setDate(now.getDate() - 90);

  const [
    { data: deals },
    { data: contacts },
    { data: agentsRaw },
  ] = await Promise.all([
    supabase
      .from("deals")
      .select("id, stage, deal_value, agent_id, created_at, actual_close_date")
      .gte("created_at", startOf90.toISOString()),
    supabase
      .from("contacts")
      .select("id, source, city, preferred_locations, created_at, lead_classification")
      .gte("created_at", startOf90.toISOString()),
    supabase
      .from("agents")
      .select("id, full_name")
      .eq("is_active", true),
  ]);

  const allDeals = deals ?? [];
  const allContacts = contacts ?? [];
  const agents = agentsRaw ?? [];

  // ── Deal metrics ─────────────────────────────────────────────────────────
  const won90      = allDeals.filter((d) => d.stage === "closed_won");
  const active90   = allDeals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage));
  const revenue90  = won90.reduce((s, d) => s + (d.deal_value ?? 0), 0);
  const avgDeal    = won90.length > 0 ? revenue90 / won90.length : 0;
  const conv90     = allDeals.length > 0 ? ((won90.length / allDeals.length) * 100).toFixed(1) : "0";

  // ── Last 30 days vs prior 30 days ──────────────────────────────────────
  const leads30    = allContacts.filter((c) => new Date(c.created_at) >= startOf30).length;
  const leadsP30   = allContacts.filter((c) => new Date(c.created_at) < startOf30).length;
  const leadsDelta = leadsP30 > 0 ? (((leads30 - leadsP30) / leadsP30) * 100).toFixed(0) : null;

  // ── Revenue by month (last 6 months) ──────────────────────────────────
  const monthMap = new Map<string, number>();
  for (const d of won90) {
    const dt  = new Date(d.actual_close_date ?? d.created_at);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + (d.deal_value ?? 0));
  }
  const revenueByMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, value]) => {
      const [y, m] = key.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1)
        .toLocaleDateString("es-DO", { month: "short", year: "2-digit" });
      return { month: label, value };
    });

  // ── Top zones (from preferred_locations array) ─────────────────────────
  const zoneMap = new Map<string, number>();
  for (const c of allContacts) {
    for (const loc of (c.preferred_locations ?? []) as string[]) {
      if (loc) zoneMap.set(loc, (zoneMap.get(loc) ?? 0) + 1);
    }
    if (c.city) zoneMap.set(c.city, (zoneMap.get(c.city) ?? 0) + 1);
  }
  const topZones = Array.from(zoneMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([zone, count]) => ({ zone, count }));

  // ── Top agent (by revenue) ─────────────────────────────────────────────
  const agentRevMap = new Map<string, number>();
  for (const d of won90) {
    if (d.agent_id) agentRevMap.set(d.agent_id, (agentRevMap.get(d.agent_id) ?? 0) + (d.deal_value ?? 0));
  }
  const topAgentId = [...agentRevMap.entries()].sort(([, a], [, b]) => b - a)[0]?.[0];
  const topAgent = agents.find((a) => a.id === topAgentId);
  const topAgentRevenue = topAgentId ? (agentRevMap.get(topAgentId) ?? 0) : 0;

  // ── Lead sources ──────────────────────────────────────────────────────
  const sourceMap = new Map<string, number>();
  for (const c of allContacts) {
    const s = (c.source as string) ?? "other";
    sourceMap.set(s, (sourceMap.get(s) ?? 0) + 1);
  }
  const leadSources = Array.from(sourceMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([source, count]) => ({ source, count }));

  // ── Pipeline value ─────────────────────────────────────────────────────
  const pipelineValue = active90.reduce((s, d) => s + (d.deal_value ?? 0), 0);

  return NextResponse.json({
    period: "90 días",
    summary: {
      totalDeals:     allDeals.length,
      wonDeals:       won90.length,
      conversionRate: conv90,
      revenue90,
      avgDealValue:   Math.round(avgDeal),
      pipelineValue,
      leads30,
      leadsDelta,
    },
    topAgent: topAgent ? { name: topAgent.full_name, revenue: topAgentRevenue } : null,
    revenueByMonth,
    topZones,
    leadSources,
  });
}
