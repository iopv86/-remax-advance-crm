import { createClient } from "@/lib/supabase/server";
import { BarChart3, TrendingUp, DollarSign, Users, Award } from "lucide-react";

export default async function AgentsPage() {
  const supabase = await createClient();

  // Try the agent_monthly_kpis view first, fall back to manual computation
  const [{ data: kpiView }, { data: agents }, { data: deals }] = await Promise.all([
    supabase.from("agent_monthly_kpis").select("*").order("total_revenue", { ascending: false }),
    supabase.from("agents").select("id, full_name, email, role, is_active").eq("is_active", true),
    supabase
      .from("deals")
      .select("agent_id, stage, deal_value, currency, commission_percentage, actual_close_date")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  // Build per-agent stats from deals if view not available
  const agentStats = (agents ?? []).map((agent) => {
    const agentDeals = (deals ?? []).filter((d) => d.agent_id === agent.id);
    const closedWon = agentDeals.filter((d) => d.stage === "closed_won");
    const active = agentDeals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage));
    const revenue = closedWon.reduce((sum, d) => {
      const comm = (d.commission_percentage ?? 3) / 100;
      return sum + (d.deal_value ?? 0) * comm;
    }, 0);
    const pipeline = active.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);

    // Check view data
    const kpi = (kpiView ?? []).find((k: Record<string, unknown>) => k.agent_id === agent.id);

    return {
      id: agent.id,
      name: agent.full_name,
      role: agent.role,
      closedDeals: (kpi as Record<string, number> | null)?.deals_closed ?? closedWon.length,
      activeDeals: (kpi as Record<string, number> | null)?.deals_active ?? active.length,
      revenue: (kpi as Record<string, number> | null)?.total_revenue ?? revenue,
      pipelineValue: pipeline,
      conversionRate: agentDeals.length > 0
        ? Math.round((closedWon.length / agentDeals.length) * 100)
        : 0,
    };
  });

  // Sort by revenue desc
  agentStats.sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = agentStats.reduce((sum, a) => sum + a.revenue, 0);
  const totalClosed = agentStats.reduce((sum, a) => sum + a.closedDeals, 0);
  const totalActive = agentStats.reduce((sum, a) => sum + a.activeDeals, 0);

  const now = new Date();
  const monthName = now.toLocaleDateString("es-DO", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Rendimiento · {monthName}
            </p>
            <h1
              style={{
                fontFamily: "var(--font-playfair),Georgia,serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                lineHeight: 1.1,
              }}
            >
              KPIs Agentes
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm backdrop-blur">
            <BarChart3 className="h-3.5 w-3.5" />
            {agents?.length ?? 0} activos
          </div>
        </div>
      </div>

      <div className="p-7 space-y-6">
        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-4 animate-fade-up-1">
          {[
            { label: "Comisiones del mes", value: "$" + totalRevenue.toLocaleString(), icon: DollarSign, accent: "var(--red)", muted: "var(--red-muted)" },
            { label: "Deals cerrados", value: totalClosed, icon: Award, accent: "oklch(0.5 0.16 145)", muted: "oklch(0.58 0.14 145 / 10%)" },
            { label: "Deals en progreso", value: totalActive, icon: TrendingUp, accent: "var(--teal)", muted: "var(--teal-muted)" },
          ].map(({ label, value, icon: Icon, accent, muted }) => (
            <div key={label} className="card-glow p-5">
              <div className="p-2 rounded-lg w-fit mb-4" style={{ background: muted }}>
                <Icon className="w-4 h-4" style={{ color: accent }} />
              </div>
              <p className="stat-number animate-count" style={{ fontSize: "34px" }}>{value}</p>
              <p className="font-sans text-muted-foreground mt-1" style={{ fontSize: "12px" }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Agent rankings */}
        <div className="card-base overflow-hidden animate-fade-up-2">
          <div
            className="flex items-center gap-2 px-6 py-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <Users className="w-4 h-4" style={{ color: "var(--red)" }} />
            <span className="font-sans font-semibold text-sm text-foreground">Ranking mensual</span>
          </div>

          {agentStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mb-3 opacity-20" />
              <p className="font-sans text-sm">Sin datos este mes.</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {agentStats.map((agent, index) => {
                const barWidth = totalRevenue > 0
                  ? Math.max(4, Math.round((agent.revenue / agentStats[0].revenue) * 100))
                  : 0;
                return (
                  <div
                    key={agent.id}
                    className="flex items-center gap-5 px-6 py-4 table-row-hover transition-colors"
                  >
                    {/* Rank */}
                    <span
                      className="font-mono text-sm font-bold w-6 shrink-0 text-center"
                      style={{ color: index === 0 ? "var(--amber)" : index === 1 ? "var(--muted-foreground)" : "var(--muted-foreground)" }}
                    >
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
                    </span>

                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-sans font-semibold text-sm shrink-0"
                      style={{ background: "var(--red-muted)", color: "var(--red)" }}
                    >
                      {agent.name[0].toUpperCase()}
                    </div>

                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="font-sans font-medium text-sm text-foreground truncate">{agent.name}</p>
                        <span className="font-mono text-xs text-muted-foreground shrink-0 ml-2">
                          {agent.closedDeals} cerrados · {agent.activeDeals} activos
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: "var(--secondary)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: barWidth + "%", background: "var(--red)" }}
                        />
                      </div>
                    </div>

                    {/* Revenue */}
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold text-foreground">
                        ${agent.revenue.toLocaleString()}
                      </p>
                      <p className="font-sans text-xs text-muted-foreground">comisión</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
