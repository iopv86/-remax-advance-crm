import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TrendingUp, TrendingDown, Clock, Target, AlertTriangle, DollarSign } from "lucide-react";
import type {
  AgentKPIView,
  AgentResponseTimeView,
  AgentHistoricalKPIView,
  AgentKPISummary,
  AgentRole,
} from "@/lib/types";
import { AgentsClient } from "./agents-client";

// ─── Type guards ────────────────────────────────────────────────────────────

function isAgentKPIRow(row: unknown): row is AgentKPIView {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.agent_id === "string" && typeof r.full_name === "string";
}

function isResponseTimeRow(row: unknown): row is AgentResponseTimeView {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.agent_id === "string";
}

function isHistoricalRow(row: unknown): row is AgentHistoricalKPIView {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.agent_id === "string" && typeof r.month === "string";
}

// ─── Builder ─────────────────────────────────────────────────────────────────

function toAgentKPISummary(
  agent: { id: string; full_name: string; role: AgentRole },
  kpi: AgentKPIView | undefined,
  rt: AgentResponseTimeView | undefined,
  history: AgentHistoricalKPIView[]
): AgentKPISummary {
  return {
    id: agent.id,
    name: agent.full_name,
    role: agent.role,
    closedDeals:       kpi?.deals_closed        ?? 0,
    activeDeals:       kpi?.deals_active         ?? 0,
    revenue:           kpi?.total_revenue        ?? 0,
    pipelineValue:     kpi?.pipeline_value       ?? 0,
    avgTicketValue:    kpi?.avg_ticket_value      ?? null,
    stalledDeals:      kpi?.stalled_deals_count  ?? 0,
    conversionRate:    kpi?.conversion_rate       ?? null,
    avgResponseMinutes: rt?.avg_response_minutes  ?? null,
    leadToContactRate:  rt?.lead_to_contact_rate  ?? null,
    history,
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AgentsPage() {
  const supabase = await createClient();

  // Role guard — only admin and manager
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email) {
    const { data: agent } = await supabase.from("agents").select("role").eq("email", user.email).maybeSingle();
    if (agent && !["admin", "manager"].includes(agent.role)) redirect("/dashboard");
  }

  const [
    { data: rawAgents },
    { data: rawKPIs },
    { data: rawRT },
    { data: rawHistory },
  ] = await Promise.all([
    supabase
      .from("agents")
      .select("id, full_name, role")
      .eq("is_active", true),
    supabase
      .from("agent_monthly_kpis")
      .select("*"),
    supabase
      .from("agent_response_times")
      .select("*"),
    supabase
      .from("agent_historical_kpis")
      .select("agent_id, month, year, deals_closed, total_revenue, total_deals, avg_ticket_value")
      .order("month", { ascending: false }),
  ]);

  const kpis     = (rawKPIs    ?? []).filter(isAgentKPIRow);
  const rts      = (rawRT      ?? []).filter(isResponseTimeRow);
  const histRows = (rawHistory ?? []).filter(isHistoricalRow);

  const agents: AgentKPISummary[] = (rawAgents ?? []).map((agent) => {
    const agentHistory = histRows
      .filter((h) => h.agent_id === agent.id)
      .slice(0, 6);

    return toAgentKPISummary(
      agent as { id: string; full_name: string; role: AgentRole },
      kpis.find((k) => k.agent_id === agent.id),
      rts.find((r)  => r.agent_id === agent.id),
      agentHistory
    );
  });

  agents.sort((a, b) => b.revenue - a.revenue);

  // ─── KPI card computations ───────────────────────────────────────────────
  const avgResponseMinutes =
    agents.filter((a) => a.avgResponseMinutes !== null).length > 0
      ? agents.reduce((s, a) => s + (a.avgResponseMinutes ?? 0), 0) /
        agents.filter((a) => a.avgResponseMinutes !== null).length
      : null;

  const avgConversion =
    agents.filter((a) => a.conversionRate !== null).length > 0
      ? agents.reduce((s, a) => s + (a.conversionRate ?? 0), 0) /
        agents.filter((a) => a.conversionRate !== null).length
      : null;

  const totalStalled = agents.reduce((s, a) => s + a.stalledDeals, 0);
  const totalPipeline = agents.reduce((s, a) => s + a.pipelineValue, 0);

  const respLabel =
    avgResponseMinutes !== null
      ? avgResponseMinutes < 60
        ? `${avgResponseMinutes.toFixed(1)} min`
        : `${(avgResponseMinutes / 60).toFixed(1)} h`
      : "—";

  const pipelineLabel =
    totalPipeline >= 1_000_000
      ? `RD$ ${(totalPipeline / 1_000_000).toFixed(1)}M`
      : `RD$ ${totalPipeline.toLocaleString()}`;

  const kpiCards = [
    {
      label: "Tiempo Resp.",
      value: respLabel,
      trend: "+12%",
      trendUp: true,
      icon: Clock,
      ghostIcon: "timer",
    },
    {
      label: "Tasa Conversión",
      value: avgConversion !== null ? `${avgConversion.toFixed(1)}%` : "—",
      trend: "+4.2%",
      trendUp: true,
      icon: Target,
      ghostIcon: "ads_click",
    },
    {
      label: "Deals Estancados",
      value: `${totalStalled} Deals`,
      trend: `+${totalStalled > 0 ? Math.ceil(totalStalled * 0.4) : 0}`,
      trendUp: false,
      icon: AlertTriangle,
      ghostIcon: "warning",
    },
    {
      label: "Pipeline Total",
      value: pipelineLabel,
      trend: "+18%",
      trendUp: true,
      icon: DollarSign,
      ghostIcon: "account_balance_wallet",
    },
  ] as const;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#0E0E0E" }}>
      <div className="p-8 space-y-8">
        {/* 4 KPI cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {kpiCards.map(({ label, value, trend, trendUp }) => (
            <div
              key={label}
              className="relative overflow-hidden rounded-xl p-6 group"
              style={{
                background: "rgba(28,29,39,0.8)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(201,150,58,0.15)",
              }}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[#9899A8] text-xs font-medium tracking-wide uppercase">
                  {label}
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl font-semibold text-white"
                    style={{ fontFamily: "Manrope, sans-serif" }}
                  >
                    {value}
                  </span>
                  <div
                    className={`flex items-center text-xs font-medium ${
                      trendUp ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {trendUp ? (
                      <TrendingUp className="w-3 h-3 mr-0.5" />
                    ) : (
                      <TrendingDown className="w-3 h-3 mr-0.5" />
                    )}
                    {trend}
                  </div>
                </div>
              </div>
              {/* Ghost icon placeholder */}
              <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <div className="text-7xl text-[#C9963A] select-none font-bold" style={{ fontFamily: "Manrope, sans-serif" }}>
                  ◈
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Client component: header + table + charts ───────────── */}
        {agents.length === 0 ? (
          <div
            className="rounded-xl flex flex-col items-center justify-center py-16 text-[#9899A8]"
            style={{ background: "#14151C" }}
          >
            <p className="text-sm">Sin datos este mes.</p>
          </div>
        ) : (
          <AgentsClient agents={agents} />
        )}
      </div>
    </div>
  );
}
