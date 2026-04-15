import { createClient } from "@/lib/supabase/server";
import { BarChart3, DollarSign, Award, TrendingUp, Users } from "lucide-react";
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

  const totalRevenue = agents.reduce((s, a) => s + a.revenue, 0);
  const totalClosed  = agents.reduce((s, a) => s + a.closedDeals, 0);
  const totalActive  = agents.reduce((s, a) => s + a.activeDeals, 0);

  const now       = new Date();
  const monthName = now.toLocaleDateString("es-DO", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Rendimiento · {monthName}
            </p>
            <h1
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "var(--foreground)",
                lineHeight: 1.1,
              }}
            >
              KPIs Agentes
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm backdrop-blur dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-400">
            <Users className="h-3.5 w-3.5" />
            {agents.length} activos
          </div>
        </div>
      </div>

      <div className="p-7 space-y-6">
        {/* Summary KPIs */}
        <div className="grid grid-cols-3 gap-4 animate-fade-up-1">
          {[
            {
              label: "Comisiones del mes",
              value: "$" + totalRevenue.toLocaleString(),
              icon: DollarSign,
              accent: "var(--red)",
              muted: "var(--red-muted)",
            },
            {
              label: "Deals cerrados",
              value: totalClosed,
              icon: Award,
              accent: "var(--emerald)",
              muted: "var(--emerald-muted)",
            },
            {
              label: "Deals en progreso",
              value: totalActive,
              icon: TrendingUp,
              accent: "var(--teal)",
              muted: "var(--teal-muted)",
            },
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

        {/* Rankings — client component with sort/filter/sparklines */}
        <div className="animate-fade-up-2">
          <div
            className="flex items-center gap-2 mb-3"
          >
            <BarChart3 className="w-4 h-4" style={{ color: "var(--red)" }} />
            <span className="font-sans font-semibold text-sm" style={{ color: "var(--foreground)" }}>
              Ranking mensual
            </span>
          </div>

          {agents.length === 0 ? (
            <div
              className="card-base flex flex-col items-center justify-center py-16"
              style={{ color: "var(--muted-foreground)" }}
            >
              <BarChart3 className="w-10 h-10 mb-3 opacity-20" />
              <p className="font-sans text-sm">Sin datos este mes.</p>
            </div>
          ) : (
            <AgentsClient agents={agents} />
          )}
        </div>
      </div>
    </div>
  );
}
