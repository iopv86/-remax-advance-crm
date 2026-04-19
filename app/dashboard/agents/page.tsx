import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type {
  AgentKPIView,
  AgentResponseTimeView,
  AgentHistoricalKPIView,
  AgentKPISummary,
  AgentRole,
} from "@/lib/types";
import { AgentsClient } from "./agents-client";

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface StalledDeal {
  id: string;
  stage: string;
  agent_id: string;
  deal_value: number | null;
  notes: string | null;
  days_stalled: number;
  contact_name: string;
  contact_phone: string | null;
}

export interface PipelineStageBreakdown {
  stage: string;
  deal_count: number;
  stage_value: number;
}

// ─── Type guards ─────────────────────────────────────────────────────────────

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
  agent: {
    id: string;
    full_name: string;
    role: AgentRole;
    captaciones_objetivo?: number | null;
    facturacion_objetivo?: number | null;
  },
  kpi: AgentKPIView | undefined,
  closedPeriod: { deals_closed: number; total_revenue: number } | undefined,
  rt: AgentResponseTimeView | undefined,
  history: AgentHistoricalKPIView[]
): AgentKPISummary {
  const closed = closedPeriod?.deals_closed ?? 0;
  const revenue = closedPeriod?.total_revenue ?? 0;
  return {
    id: agent.id,
    name: agent.full_name,
    role: agent.role,
    closedDeals:         closed,
    activeDeals:         kpi?.deals_active          ?? 0,
    revenue:             revenue,
    pipelineValue:       kpi?.pipeline_value         ?? 0,
    avgTicketValue:      closed > 0 ? Math.round(revenue / closed) : null,
    stalledDeals:        kpi?.stalled_deals_count    ?? 0,
    conversionRate:      kpi?.conversion_rate        ?? null,
    avgResponseMinutes:  rt?.avg_response_minutes    ?? null,
    leadToContactRate:   rt?.lead_to_contact_rate    ?? null,
    history,
    captacionesObjetivo: agent.captaciones_objetivo  ?? null,
    facturacionObjetivo: agent.facturacion_objetivo  ?? null,
    taskCompletionRate:  kpi?.task_completion_rate   ?? null,
    avgFollowupDays:     kpi?.avg_followup_days       ?? null,
    fastResponseRate:    kpi?.fast_response_rate      ?? null,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  // Period: 7d (Semanal) | 30d (Mensual, default) | 90d (Trimestral)
  const days: number =
    params.period === "7" ? 7 : params.period === "90" ? 90 : 30;
  const currentPeriod: "7" | "30" | "90" =
    params.period === "7" ? "7" : params.period === "90" ? "90" : "30";
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Role guard — admin and manager only
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    const { data: agent } = await supabase
      .from("agents")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();
    if (agent && !["admin", "manager"].includes(agent.role))
      redirect("/dashboard");
  }

  const stalledCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: rawAgents },
    { data: rawKPIs },
    { data: rawClosedDeals },
    { data: rawRT },
    { data: rawHistory },
    { data: rrAgentRows },
    { data: rrConfigRows },
    { data: rawStalled },
    { data: rawPipeline },
  ] = await Promise.all([
    // Agents list with objectives
    supabase
      .from("agents")
      .select("id, full_name, role, captaciones_objetivo, facturacion_objetivo")
      .eq("is_active", true),

    // Current-state KPIs from view (active deals, pipeline, stalled, conversion)
    supabase.from("agent_monthly_kpis").select("*"),

    // Period-based closed deals (for closedDeals + revenue that actually change with period)
    supabase
      .from("deals")
      .select("agent_id, deal_value, commission_value, commission_percentage")
      .eq("stage", "closed_won")
      .gte("actual_close_date", periodStart),

    // Response times
    supabase.from("agent_response_times").select("*"),

    // Historical KPIs for sparklines
    supabase
      .from("agent_historical_kpis")
      .select(
        "agent_id, month, year, deals_closed, total_revenue, total_deals, avg_ticket_value"
      )
      .order("month", { ascending: false }),

    // Round Robin — agents eligible for rotation
    supabase
      .from("agents")
      .select("id, full_name, email, role")
      .eq("is_active", true)
      .in("role", ["agent", "manager"])
      .order("full_name"),

    // Round Robin — current config
    supabase
      .from("round_robin_config")
      .select("id, agent_id, position, is_active")
      .order("position"),

    // Stalled deals with contact info for the sheet
    supabase
      .from("deals")
      .select(
        "id, stage, agent_id, deal_value, notes, updated_at, contacts(first_name, last_name, phone)"
      )
      .neq("stage", "closed_won")
      .neq("stage", "closed_lost")
      .lt("updated_at", stalledCutoff)
      .order("updated_at", { ascending: true })
      .limit(50),

    // Active pipeline deals for stage breakdown chart
    supabase
      .from("deals")
      .select("stage, deal_value")
      .neq("stage", "closed_won")
      .neq("stage", "closed_lost"),
  ]);

  // ─── Aggregate closed deals by agent ───────────────────────────────────────

  const closedByAgent = new Map<
    string,
    { deals_closed: number; total_revenue: number }
  >();
  for (const deal of rawClosedDeals ?? []) {
    const prev = closedByAgent.get(deal.agent_id) ?? {
      deals_closed: 0,
      total_revenue: 0,
    };
    const rev =
      deal.commission_value != null
        ? (deal.commission_value as number)
        : (((deal.deal_value as number) ?? 0) *
            ((deal.commission_percentage as number) ?? 3)) /
          100;
    closedByAgent.set(deal.agent_id, {
      deals_closed: prev.deals_closed + 1,
      total_revenue: prev.total_revenue + rev,
    });
  }

  // ─── Build AgentKPISummary[] ────────────────────────────────────────────────

  const kpis = (rawKPIs ?? []).filter(isAgentKPIRow);
  const rts = (rawRT ?? []).filter(isResponseTimeRow);
  const histRows = (rawHistory ?? []).filter(isHistoricalRow);

  const agents: AgentKPISummary[] = (rawAgents ?? []).map((agent) => {
    const agentHistory = histRows
      .filter((h) => h.agent_id === agent.id)
      .slice(0, 6);
    return toAgentKPISummary(
      agent as {
        id: string;
        full_name: string;
        role: AgentRole;
        captaciones_objetivo?: number | null;
        facturacion_objetivo?: number | null;
      },
      kpis.find((k) => k.agent_id === agent.id),
      closedByAgent.get(agent.id),
      rts.find((r) => r.agent_id === agent.id),
      agentHistory
    );
  });

  agents.sort((a, b) => b.revenue - a.revenue);

  // ─── Stalled deals ─────────────────────────────────────────────────────────

  const stalledDeals: StalledDeal[] = (rawStalled ?? []).map((d) => {
    const raw = d as Record<string, unknown>;
    const contact = raw.contacts as
      | { first_name?: string | null; last_name?: string | null; phone?: string | null }
      | null;
    const updatedAt = raw.updated_at as string;
    return {
      id: raw.id as string,
      stage: raw.stage as string,
      agent_id: raw.agent_id as string,
      deal_value: raw.deal_value as number | null,
      notes: raw.notes as string | null,
      days_stalled: Math.floor(
        (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
      contact_name: contact
        ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "—"
        : "—",
      contact_phone: contact?.phone ?? null,
    };
  });

  // ─── Pipeline breakdown by stage ───────────────────────────────────────────

  const stageMap = new Map<string, { deal_count: number; stage_value: number }>();
  for (const deal of rawPipeline ?? []) {
    const d = deal as { stage: string; deal_value: number | null };
    const prev = stageMap.get(d.stage) ?? { deal_count: 0, stage_value: 0 };
    stageMap.set(d.stage, {
      deal_count: prev.deal_count + 1,
      stage_value: prev.stage_value + (d.deal_value ?? 0),
    });
  }
  const pipelineByStage: PipelineStageBreakdown[] = Array.from(
    stageMap.entries()
  )
    .map(([stage, v]) => ({ stage, ...v }))
    .sort((a, b) => b.stage_value - a.stage_value);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "#0E0E0E" }}
    >
      <div className="p-8">
        <AgentsClient
          agents={agents}
          currentPeriod={currentPeriod}
          rrAgents={rrAgentRows ?? []}
          rrConfig={rrConfigRows ?? []}
          stalledDeals={stalledDeals}
          pipelineByStage={pipelineByStage}
        />
      </div>
    </div>
  );
}
