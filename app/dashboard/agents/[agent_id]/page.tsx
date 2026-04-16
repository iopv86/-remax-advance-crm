import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Clock, Target, DollarSign, AlertTriangle, TrendingUp } from "lucide-react";
import { STAGE_LABELS } from "@/lib/types";
import type { Deal, DealStage, AgentRole } from "@/lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function formatValue(v?: number): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `RD$ ${(v / 1_000_000).toFixed(1)}M`;
  return `RD$ ${(v / 1_000).toFixed(0)}K`;
}

const STAGE_COLOR: Record<DealStage, string> = {
  lead_captured:    "var(--blue-muted)",
  qualified:        "var(--teal-muted)",
  contacted:        "var(--teal-muted)",
  showing_scheduled:"var(--amber-muted)",
  showing_done:     "var(--amber-muted)",
  offer_made:       "var(--violet-muted)",
  negotiation:      "var(--violet-muted)",
  contract:         "var(--emerald-muted)",
  closed_won:       "var(--emerald-muted)",
  closed_lost:      "var(--red-muted)",
};

const STAGE_TEXT: Record<DealStage, string> = {
  lead_captured:    "var(--blue)",
  qualified:        "var(--teal)",
  contacted:        "var(--teal)",
  showing_scheduled:"var(--amber)",
  showing_done:     "var(--amber)",
  offer_made:       "var(--violet)",
  negotiation:      "var(--violet)",
  contract:         "var(--emerald)",
  closed_won:       "var(--emerald)",
  closed_lost:      "var(--red)",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agent_id: string }>;
}) {
  const { agent_id } = await params;
  const supabase = await createClient();

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch agent info + deals + KPI data in parallel
  const [
    { data: agentRow },
    { data: rawDeals },
    { data: kpiRow },
    { data: rtRow },
    { data: histRows },
  ] = await Promise.all([
    supabase
      .from("agents")
      .select("id, full_name, role, phone, avatar_url")
      .eq("id", agent_id)
      .single(),
    supabase
      .from("deals")
      .select("id, stage, deal_value, currency, created_at, expected_close_date, contact:contacts(first_name, last_name, phone)")
      .eq("agent_id", agent_id)
      .neq("stage", "closed_lost")
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_monthly_kpis")
      .select("*")
      .eq("agent_id", agent_id)
      .single(),
    supabase
      .from("agent_response_times")
      .select("*")
      .eq("agent_id", agent_id)
      .single(),
    supabase
      .from("agent_historical_kpis")
      .select("month, year, deals_closed, total_revenue, total_deals")
      .eq("agent_id", agent_id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(6),
  ]);

  if (!agentRow) redirect("/dashboard/agents");

  const agent = agentRow as { id: string; full_name: string; role: AgentRole; phone?: string };
  type DealRow = { id: string; stage: DealStage; deal_value?: number; currency?: string; created_at: string; expected_close_date?: string; contact?: { first_name?: string; last_name?: string } | null };
  const deals = (rawDeals ?? []) as unknown as DealRow[];

  // Derived KPIs
  const activeDeals = deals.filter((d) => d.stage !== "closed_won").length;
  const stalledDeals = deals.filter((d) => {
    const days = daysAgo(d.created_at);
    return days > 14 && d.stage !== "closed_won";
  });
  const pipelineValue = deals
    .filter((d) => d.stage !== "closed_won")
    .reduce((s, d) => s + (d.deal_value ?? 0), 0);

  const avgResponseMin = (rtRow as { avg_response_minutes?: number } | null)?.avg_response_minutes ?? null;
  const conversionRate = (kpiRow as { conversion_rate?: number } | null)?.conversion_rate ?? null;
  const closedDeals    = (kpiRow as { deals_closed?: number } | null)?.deals_closed ?? 0;
  const totalRevenue   = (kpiRow as { total_revenue?: number } | null)?.total_revenue ?? 0;

  const initials = agent.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel = agent.role === "admin" ? "Administrador" : agent.role === "manager" ? "Gerente" : "Agente";

  // Sort deals: stalled first, then by age desc
  const sortedDeals = [...deals].sort((a, b) => {
    const aDays = daysAgo(a.created_at);
    const bDays = daysAgo(b.created_at);
    const aStalled = aDays > 14 ? 1 : 0;
    const bStalled = bDays > 14 ? 1 : 0;
    if (aStalled !== bStalled) return bStalled - aStalled;
    return bDays - aDays;
  });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/agents"
            className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ArrowLeft className="h-4 w-4" />
            KPIs Agentes
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>

          {/* Agent identity */}
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
              style={{ background: "var(--amber-muted)", color: "var(--amber)" }}
            >
              {initials}
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-display),var(--font-manrope),system-ui",
                  fontWeight: 700,
                  fontSize: 20,
                  letterSpacing: "-0.02em",
                  color: "var(--foreground)",
                  lineHeight: 1.2,
                }}
              >
                {agent.full_name}
              </h1>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{roleLabel}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up-1">

          {/* Response time */}
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Resp. Promedio
              </span>
            </div>
            <p className="stat-number text-2xl">
              {avgResponseMin === null ? "—"
                : avgResponseMin < 60 ? `${Math.round(avgResponseMin)}m`
                : `${(avgResponseMin / 60).toFixed(1)}h`}
            </p>
            <p className="text-xs mt-1" style={{ color: avgResponseMin !== null && avgResponseMin < 10 ? "var(--emerald)" : "var(--muted-foreground)" }}>
              {avgResponseMin !== null && avgResponseMin < 10 ? "Excelente (<10m)" : "Meta: < 10 min"}
            </p>
          </div>

          {/* Conversion */}
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Conversión
              </span>
            </div>
            <p className="stat-number text-2xl">
              {conversionRate !== null ? `${conversionRate}%` : "—"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              {closedDeals} {closedDeals === 1 ? "cierre" : "cierres"} este mes
            </p>
          </div>

          {/* Pipeline */}
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Pipeline
              </span>
            </div>
            <p className="stat-number text-2xl" style={{ color: "var(--amber)" }}>
              {formatValue(pipelineValue)}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              {activeDeals} {activeDeals === 1 ? "deal activo" : "deals activos"}
            </p>
          </div>

          {/* Stalled */}
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4" style={{ color: stalledDeals.length > 0 ? "var(--amber)" : "var(--muted-foreground)" }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Estancados
              </span>
            </div>
            <p className="stat-number text-2xl" style={{ color: stalledDeals.length > 0 ? "var(--amber)" : "var(--foreground)" }}>
              {stalledDeals.length}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              {stalledDeals.length > 0 ? "+14 días sin movimiento" : "Sin deals estancados"}
            </p>
          </div>
        </div>

        {/* Deals activity table */}
        <div className="card-base overflow-hidden animate-fade-up-2">
          <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <div>
                <h2
                  style={{
                    fontFamily: "var(--font-display),var(--font-manrope),system-ui",
                    fontWeight: 600,
                    fontSize: 15,
                    color: "var(--foreground)",
                  }}
                >
                  Actividad de Deals
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  Ordenados por tiempo sin movimiento
                </p>
              </div>
              {totalRevenue > 0 && (
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    Comisión del mes
                  </p>
                  <p className="font-mono font-bold text-sm mt-0.5" style={{ color: "var(--amber)" }}>
                    {formatValue(totalRevenue)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {sortedDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--muted-foreground)" }}>
              <TrendingUp className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm">Sin deals activos.</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {sortedDeals.map((deal) => {
                const days = daysAgo(deal.created_at);
                const isStalled = days > 14;
                const contactName = deal.contact
                  ? [deal.contact.first_name, deal.contact.last_name].filter(Boolean).join(" ") || "Sin nombre"
                  : "Sin contacto";

                return (
                  <div
                    key={deal.id}
                    className="flex items-center gap-4 px-6 py-3.5 table-row-hover transition-colors"
                  >
                    {/* Stalled indicator */}
                    <div className="w-2 h-2 rounded-full shrink-0" style={{
                      background: isStalled ? "var(--amber)" : "var(--emerald)",
                    }} />

                    {/* Contact name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                        {contactName}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: isStalled ? "var(--amber)" : "var(--muted-foreground)" }}>
                        {isStalled ? `⚠ ${days}d sin movimiento` : `Activo · ${days}d`}
                      </p>
                    </div>

                    {/* Stage badge */}
                    <span
                      className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{
                        background: STAGE_COLOR[deal.stage],
                        color: STAGE_TEXT[deal.stage],
                      }}
                    >
                      {STAGE_LABELS[deal.stage]}
                    </span>

                    {/* Value */}
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold" style={{ color: "var(--foreground)" }}>
                        {formatValue(deal.deal_value)}
                      </p>
                      {deal.expected_close_date && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          Cierre: {new Date(deal.expected_close_date).toLocaleDateString("es-DO", { day: "numeric", month: "short" })}
                        </p>
                      )}
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
