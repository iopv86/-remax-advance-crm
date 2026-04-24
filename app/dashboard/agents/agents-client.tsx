"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Clock,
  Target,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
  X,
  ExternalLink,
  RefreshCw,
  Zap,
  CheckSquare,
  Repeat,
} from "lucide-react";
import type { AgentKPISummary } from "@/lib/types";
import type { StalledDeal, PipelineStageBreakdown } from "./page";
import { RoundRobinClient } from "@/app/dashboard/settings/round-robin/round-robin-client";
import { ObjectivesClient } from "@/app/dashboard/settings/objectives/objectives-client";
import { AgentFilter } from "@/components/agent-filter";

const AgentSparkline = dynamic(
  () => import("./agent-sparkline").then((m) => m.AgentSparkline),
  {
    ssr: false,
    loading: () => (
      <div className="h-8 w-24 rounded animate-pulse bg-[#353534]" />
    ),
  }
);

// ─── Constants ──────────────────────────────────────────────────────────────

const GOLD = "var(--primary)";
const TEXT_MUTED = "var(--muted-foreground)";
const TEXT_DIM = "var(--muted-foreground)";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = "kpis" | "objetivos" | "round-robin";

interface RRAgent {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface RRConfig {
  id: string;
  agent_id: string;
  position: number;
  is_active: boolean;
}

interface Props {
  agents: AgentKPISummary[];
  currentPeriod: "7" | "30" | "90";
  rrAgents: RRAgent[];
  rrConfig: RRConfig[];
  stalledDeals: StalledDeal[];
  pipelineByStage: PipelineStageBreakdown[];
}

// ─── Response time badge ─────────────────────────────────────────────────────

function ResponseBadge({ minutes }: { minutes: number | null }) {
  if (minutes === null)
    return <span className="font-mono text-xs text-[#545567]">—</span>;

  const label =
    minutes < 60 ? "<1h" : `${Math.round(minutes / 60)}h`;
  const cls =
    minutes < 60
      ? "bg-green-500/10 text-green-500 border border-green-500/20"
      : minutes < 180
      ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
      : "bg-red-500/10 text-red-500 border border-red-500/20";

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${cls}`}>
      {label}
    </span>
  );
}

// ─── Pipeline breakdown chart ─────────────────────────────────────────────────

const STAGE_LABELS_SHORT: Record<string, string> = {
  lead_captured: "Lead",
  qualified: "Calificado",
  contacted: "Contactado",
  showing_scheduled: "Visita ag.",
  showing_done: "Visita hecha",
  offer_made: "Oferta",
  negotiation: "Negociación",
  promesa_de_venta: "Promesa",
  financiamiento: "Financ.",
  contract: "Contrato",
  due_diligence: "Due dilig.",
};

function PipelineStageChart({ data }: { data: PipelineStageBreakdown[] }) {
  const top = data.slice(0, 8);
  const maxVal = top[0]?.stage_value ?? 1;

  if (top.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[#545567] text-sm">
        Sin datos de pipeline.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {top.map((item) => {
        const pct = maxVal > 0 ? Math.round((item.stage_value / maxVal) * 100) : 0;
        const label = STAGE_LABELS_SHORT[item.stage] ?? item.stage;
        const valLabel =
          item.stage_value >= 1_000_000
            ? `RD$ ${(item.stage_value / 1_000_000).toFixed(1)}M`
            : `RD$ ${item.stage_value.toLocaleString()}`;
        return (
          <div key={item.stage} className="space-y-1">
            <div className="flex justify-between text-[11px] text-[#9899A8] uppercase tracking-wider">
              <span>
                {label}{" "}
                <span className="text-[#545567] normal-case tracking-normal">
                  ({item.deal_count})
                </span>
              </span>
              <span>{valLabel}</span>
            </div>
            <div className="h-3 bg-[#353534] rounded-full overflow-hidden">
              <Link href={`/dashboard/pipeline?stage=${item.stage}`}>
                <div
                  className="h-full rounded-full transition-all duration-700 hover:opacity-80 cursor-pointer"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${GOLD}, #f5bd5d)`,
                  }}
                />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stalled deals sheet ──────────────────────────────────────────────────────

function StalledDealsSheet({
  deals,
  onClose,
}: {
  deals: StalledDeal[];
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg flex flex-col"
        style={{
          background: "var(--card)",
          borderLeft: "1px solid rgba(201,150,58,0.15)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: "1px solid rgba(201,150,58,0.12)" }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#C9963A] mb-1">
              Atención requerida
            </p>
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              Deals Estancados
            </h2>
            <p className="text-xs text-[#9899A8] mt-0.5">
              {deals.length} deal{deals.length !== 1 ? "s" : ""} sin actividad en +7 días
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9899A8] hover:text-white hover:bg-[#353534] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-[#545567]">
              <AlertTriangle className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm">No hay deals estancados.</p>
            </div>
          ) : (
            deals.map((deal) => {
              const valueLabel = deal.deal_value
                ? deal.deal_value >= 1_000_000
                  ? `RD$ ${(deal.deal_value / 1_000_000).toFixed(1)}M`
                  : `RD$ ${deal.deal_value.toLocaleString()}`
                : "—";
              const stageLabel =
                STAGE_LABELS_SHORT[deal.stage] ?? deal.stage;

              return (
                <div
                  key={deal.id}
                  className="rounded-xl p-4 space-y-2"
                  style={{
                    background: "rgba(28,29,39,0.6)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-white truncate">
                        {deal.contact_name}
                      </p>
                      {deal.contact_phone && (
                        <p className="text-[11px] text-[#9899A8]">
                          {deal.contact_phone}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/dashboard/pipeline?deal=${deal.id}`}
                      className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-[#C9963A] hover:underline"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
                      style={{
                        background: "rgba(201,150,58,0.1)",
                        color: GOLD,
                      }}
                    >
                      {stageLabel}
                    </span>
                    <span className="text-[11px] font-medium text-white">
                      {valueLabel}
                    </span>
                    <span className="text-[11px] text-red-400 font-medium">
                      {deal.days_stalled}d sin actividad
                    </span>
                  </div>

                  {deal.notes && (
                    <p className="text-[11px] text-[#9899A8] leading-relaxed line-clamp-2">
                      {deal.notes}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// ─── Scatter plot ─────────────────────────────────────────────────────────────

function ScatterPlot({ agents }: { agents: AgentKPISummary[] }) {
  const maxResp = Math.max(...agents.map((a) => a.avgResponseMinutes ?? 0), 1);
  const maxConv = Math.max(...agents.map((a) => a.conversionRate ?? 0), 1);

  const dots = agents.slice(0, 7).map((agent) => {
    const resp = agent.avgResponseMinutes ?? maxResp * 0.5;
    const conv = agent.conversionRate ?? maxConv * 0.5;
    return {
      id: agent.id,
      left: Math.round((resp / maxResp) * 80) + 10,
      bottom: Math.round((conv / maxConv) * 75) + 10,
    };
  });

  return (
    <div className="bg-[#1C1D27]/80 backdrop-blur-xl border border-[#4f4537]/10 rounded-xl p-4 md:p-8 space-y-6 relative overflow-hidden">
      <h3
        className="font-bold text-lg text-white"
        style={{ fontFamily: "Manrope, sans-serif" }}
      >
        Resp. vs Conversión
      </h3>
      <div className="relative h-[220px] border-l border-b border-[#4f4537]/30 ml-6 mb-6">
        {dots.map((dot) => (
          <div
            key={dot.id}
            className="absolute w-3 h-3 bg-[#f5bd5d] rounded-full"
            style={{
              bottom: `${dot.bottom}%`,
              left: `${dot.left}%`,
              boxShadow: "0 0 15px rgba(245,189,93,0.5)",
            }}
          />
        ))}
        <span className="absolute -left-12 top-1/2 -rotate-90 text-[10px] text-[#545567] uppercase tracking-widest font-bold">
          Conversión (%)
        </span>
        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] text-[#545567] uppercase tracking-widest font-bold">
          Resp. (min)
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentsClient({
  agents,
  currentPeriod,
  rrAgents,
  rrConfig,
  stalledDeals,
  pipelineByStage,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("kpis");
  const [stalledOpen, setStalledOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const sortedAll = useMemo(
    () => [...agents].sort((a, b) => b.pipelineValue - a.pipelineValue),
    [agents]
  );
  const sorted = useMemo(
    () =>
      selectedAgentId
        ? sortedAll.filter((a) => a.id === selectedAgentId)
        : sortedAll,
    [sortedAll, selectedAgentId]
  );
  const topId = sortedAll[0]?.id;

  const filterAgents = useMemo(
    () => agents.map((a) => ({ id: a.id, full_name: a.name })),
    [agents]
  );

  // Period label mapping
  const PERIOD_LABELS: Record<"7" | "30" | "90", string> = {
    "7": "Semanal",
    "30": "Mensual",
    "90": "Trimestral",
  };

  function setPeriod(label: string) {
    const map: Record<string, string> = {
      Semanal: "7",
      Mensual: "30",
      Trimestral: "90",
    };
    router.push(`?period=${map[label] ?? "30"}`);
  }

  // Summary stats
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

  const agentsWithFast = agents.filter((a) => a.fastResponseRate !== null);
  const avgFastResponse =
    agentsWithFast.length > 0
      ? agentsWithFast.reduce((s, a) => s + (a.fastResponseRate ?? 0), 0) / agentsWithFast.length
      : null;

  const agentsWithTask = agents.filter((a) => a.taskCompletionRate !== null);
  const avgTaskCompletion =
    agentsWithTask.length > 0
      ? agentsWithTask.reduce((s, a) => s + (a.taskCompletionRate ?? 0), 0) / agentsWithTask.length
      : null;

  const agentsWithFollowup = agents.filter((a) => a.avgFollowupDays !== null);
  const avgFollowupDays =
    agentsWithFollowup.length > 0
      ? agentsWithFollowup.reduce((s, a) => s + (a.avgFollowupDays ?? 0), 0) / agentsWithFollowup.length
      : null;

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

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: "kpis",
      label: "KPIs",
      icon: <TrendingUp className="w-3.5 h-3.5" />,
    },
    {
      id: "objetivos",
      label: "Objetivos",
      icon: <Target className="w-3.5 h-3.5" />,
    },
    {
      id: "round-robin",
      label: "Round Robin",
      icon: <RefreshCw className="w-3.5 h-3.5" />,
    },
  ];

  // Build objectives-compatible agent list
  const objectivesAgents = agents.map((a) => ({
    id: a.id,
    full_name: a.name,
    email: "",
    role: a.role,
    captaciones_objetivo: a.captacionesObjetivo,
    facturacion_objetivo: a.facturacionObjetivo,
  }));

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────── */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1
            className="text-[28px] font-bold text-white tracking-tight"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            Rendimiento de Agentes
          </h1>
          <p className="text-sm text-[#9899A8]">
            Analíticas de performance y conversión en tiempo real
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Tabs */}
          <div className="bg-[#353534]/20 p-1 rounded-lg flex items-center gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-[#C9963A] text-[#4a3100] shadow-lg"
                    : "text-[#9899A8] hover:text-white"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Period toggle — only visible on KPIs tab */}
          {activeTab === "kpis" && (
            <div className="bg-[#353534]/20 p-1 rounded-lg flex items-center">
              {(["Semanal", "Mensual", "Trimestral"] as const).map((p) => {
                const map: Record<string, string> = {
                  Semanal: "7",
                  Mensual: "30",
                  Trimestral: "90",
                };
                const isActive = map[p] === currentPeriod;
                return (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? "bg-[#1C1D27] text-white shadow"
                        : "text-[#9899A8] hover:text-white"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}

          {/* Export */}
          <button className="flex items-center gap-2 px-4 py-2 border border-[#4f4537]/30 rounded-lg text-xs font-medium text-[#9899A8] hover:bg-[#353534] transition-colors">
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
        </div>
      </header>

      {/* ── KPIs Tab ─────────────────────────────────────────────── */}
      {activeTab === "kpis" && (
        <div className="space-y-8">
          {/* Agent filter row */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <AgentFilter
              agents={filterAgents}
              value={selectedAgentId}
              onChange={setSelectedAgentId}
              label="Filtrar por agente"
            />
            {selectedAgentId && (
              <span
                style={{
                  fontSize: 12,
                  color: TEXT_MUTED,
                  fontFamily: "Inter, sans-serif",
                  paddingBottom: 6,
                }}
              >
                Vista individual · 1 de {sortedAll.length} agentes
              </span>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {/* Tiempo de respuesta */}
            <div
              className="relative overflow-hidden rounded-xl p-6 cursor-default group"
              style={{
                background: "rgba(28,29,39,0.8)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(201,150,58,0.15)",
              }}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[#9899A8] text-xs font-medium tracking-wide uppercase flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Tiempo Resp.
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {respLabel}
                  </span>
                  <span className="flex items-center text-xs font-medium text-green-500">
                    <TrendingUp className="w-3 h-3 mr-0.5" />+12%
                  </span>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-5 text-7xl text-[#C9963A] select-none font-bold" style={{ fontFamily: "Manrope, sans-serif" }}>◈</div>
            </div>

            {/* Tasa conversión */}
            <div
              className="relative overflow-hidden rounded-xl p-6 cursor-default group"
              style={{
                background: "rgba(28,29,39,0.8)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(201,150,58,0.15)",
              }}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[#9899A8] text-xs font-medium tracking-wide uppercase flex items-center gap-1.5">
                  <Target className="w-3 h-3" /> Tasa Conversión
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {avgConversion !== null ? `${avgConversion.toFixed(1)}%` : "—"}
                  </span>
                  <span className="flex items-center text-xs font-medium text-green-500">
                    <TrendingUp className="w-3 h-3 mr-0.5" />+4.2%
                  </span>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-5 text-7xl text-[#C9963A] select-none font-bold" style={{ fontFamily: "Manrope, sans-serif" }}>◈</div>
            </div>

            {/* Deals estancados — clickable */}
            <button
              onClick={() => setStalledOpen(true)}
              className="relative overflow-hidden rounded-xl p-6 text-left group transition-all hover:border-red-500/30"
              style={{
                background: "rgba(28,29,39,0.8)",
                backdropFilter: "blur(24px)",
                border:
                  totalStalled > 0
                    ? "1px solid rgba(239,68,68,0.2)"
                    : "1px solid rgba(201,150,58,0.15)",
              }}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[#9899A8] text-xs font-medium tracking-wide uppercase flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Estancados
                  {totalStalled > 0 && (
                    <span className="ml-auto text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                      ver →
                    </span>
                  )}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {totalStalled}
                  </span>
                  <span className="text-xs text-[#9899A8]">deals</span>
                  {totalStalled > 0 && (
                    <span className="flex items-center text-xs font-medium text-red-500">
                      <TrendingDown className="w-3 h-3 mr-0.5" />
                      acción requerida
                    </span>
                  )}
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-5 text-7xl text-[#C9963A] select-none font-bold" style={{ fontFamily: "Manrope, sans-serif" }}>◈</div>
            </button>

            {/* Pipeline total — links to pipeline page */}
            <Link
              href="/dashboard/pipeline"
              className="relative overflow-hidden rounded-xl p-6 block group transition-all hover:border-[#C9963A]/30"
              style={{
                background: "rgba(28,29,39,0.8)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(201,150,58,0.15)",
                textDecoration: "none",
              }}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[#9899A8] text-xs font-medium tracking-wide uppercase flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3" /> Pipeline Total
                  <span className="ml-auto text-[10px] font-bold text-[#C9963A]/70 bg-[#C9963A]/10 px-1.5 py-0.5 rounded">
                    ver →
                  </span>
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {pipelineLabel}
                  </span>
                  <span className="flex items-center text-xs font-medium text-green-500">
                    <TrendingUp className="w-3 h-3 mr-0.5" />+18%
                  </span>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-5 text-7xl text-[#C9963A] select-none font-bold" style={{ fontFamily: "Manrope, sans-serif" }}>◈</div>
            </Link>
          </div>

          {/* Operational KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fast response rate */}
            <div
              className="relative overflow-hidden rounded-xl p-5"
              style={{
                background: "rgba(28,29,39,0.6)",
                border: "1px solid rgba(201,150,58,0.1)",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-[#9899A8] text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-[#C9963A]" /> Resp. &lt;10 min
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: "Manrope, sans-serif" }}
                >
                  {avgFastResponse !== null ? `${avgFastResponse.toFixed(1)}%` : "—"}
                </span>
                {avgFastResponse !== null && (
                  <span className="text-[10px] text-[#9899A8]">de leads respondidos</span>
                )}
              </div>
              <p className="text-[10px] text-[#545567] mt-1">
                Estándar RE/MAX: &gt;50%
              </p>
            </div>

            {/* Task completion rate */}
            <div
              className="relative overflow-hidden rounded-xl p-5"
              style={{
                background: "rgba(28,29,39,0.6)",
                border: "1px solid rgba(201,150,58,0.1)",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-[#9899A8] text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <CheckSquare className="w-3 h-3 text-[#C9963A]" /> Tareas Completadas
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: "Manrope, sans-serif" }}
                >
                  {avgTaskCompletion !== null ? `${avgTaskCompletion.toFixed(1)}%` : "—"}
                </span>
                {avgTaskCompletion !== null && (
                  <span className="text-[10px] text-[#9899A8]">promedio equipo</span>
                )}
              </div>
              <p className="text-[10px] text-[#545567] mt-1">
                {avgTaskCompletion === null ? "Sin tareas registradas" : "Objetivo: >80%"}
              </p>
            </div>

            {/* Avg followup cadence */}
            <div
              className="relative overflow-hidden rounded-xl p-5"
              style={{
                background: "rgba(28,29,39,0.6)",
                border: "1px solid rgba(201,150,58,0.1)",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-[#9899A8] text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <Repeat className="w-3 h-3 text-[#C9963A]" /> Cadencia Seguimiento
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-2xl font-bold text-white"
                  style={{ fontFamily: "Manrope, sans-serif" }}
                >
                  {avgFollowupDays !== null ? `${avgFollowupDays.toFixed(1)}d` : "—"}
                </span>
                {avgFollowupDays !== null && (
                  <span className="text-[10px] text-[#9899A8]">entre mensajes</span>
                )}
              </div>
              <p className="text-[10px] text-[#545567] mt-1">
                {avgFollowupDays === null ? "Sin datos suficientes" : "Objetivo: <3 días"}
              </p>
            </div>
          </div>

          {/* Agent table */}
          <section className="bg-[#14151C] rounded-xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left border-collapse">
                <thead>
                  <tr className="bg-[#1c1b1b]/50">
                    {[
                      "Agente",
                      "Leads",
                      "Resp.",
                      "Conversión",
                      "Pipeline",
                      "Captaciones",
                      "Facturación",
                      "Estancados",
                      "Actividad 7D",
                    ].map((col, i) => (
                      <th
                        key={col}
                        className={`px-6 py-4 text-[11px] uppercase tracking-widest text-[#545567] font-semibold${i === 4 ? " text-right" : ""}`}
                        style={{ fontFamily: "Manrope, sans-serif" }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#4f4537]/10">
                  {sorted.map((agent) => {
                    const isTop = agent.id === topId;
                    const initials = agent.name
                      .split(" ")
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase();
                    const convPct = agent.conversionRate ?? 0;
                    const leadsCount = agent.activeDeals + agent.closedDeals;
                    const pipelineLabel =
                      agent.pipelineValue >= 1_000_000
                        ? `RD$ ${(agent.pipelineValue / 1_000_000).toFixed(1)}M`
                        : `RD$ ${agent.pipelineValue.toLocaleString()}`;

                    const captPct =
                      agent.captacionesObjetivo && agent.captacionesObjetivo > 0
                        ? Math.min(100, Math.round((agent.closedDeals / agent.captacionesObjetivo) * 100))
                        : null;
                    const factPct =
                      agent.facturacionObjetivo && agent.facturacionObjetivo > 0
                        ? Math.min(100, Math.round((agent.revenue / agent.facturacionObjetivo) * 100))
                        : null;

                    return (
                      <tr
                        key={agent.id}
                        className={`hover:bg-[#353534]/20 transition-colors${isTop ? " border-l-[3px] border-[#C9963A]" : ""}`}
                      >
                        {/* Agente */}
                        <td className="px-6 py-4">
                          <Link
                            href={`/dashboard/agents/${agent.id}`}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                            style={{ textDecoration: "none" }}
                          >
                            <div className="w-7 h-7 rounded-full bg-[#353534] flex items-center justify-center text-[10px] text-[#9899A8] shrink-0">
                              {initials}
                            </div>
                            <span className="font-medium text-sm text-white">
                              {agent.name}
                            </span>
                          </Link>
                        </td>

                        {/* Leads */}
                        <td className="px-6 py-4 text-sm text-[#e5e2e1]">{leadsCount}</td>

                        {/* Resp. */}
                        <td className="px-6 py-4">
                          <ResponseBadge minutes={agent.avgResponseMinutes} />
                        </td>

                        {/* Conversión */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-1.5 bg-[#353534] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#C9963A] transition-all duration-700"
                                style={{ width: `${convPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-[#9899A8] font-medium w-9 text-right">
                              {agent.conversionRate !== null
                                ? `${agent.conversionRate}%`
                                : "—"}
                            </span>
                          </div>
                        </td>

                        {/* Pipeline */}
                        <td className="px-6 py-4 text-right font-semibold text-sm text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                          {pipelineLabel}
                        </td>

                        {/* Captaciones */}
                        <td className="px-6 py-4">
                          {captPct !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-[#353534] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${captPct}%`,
                                    background:
                                      captPct >= 100
                                        ? "#22c55e"
                                        : captPct >= 60
                                        ? "#C9963A"
                                        : "#ef4444",
                                  }}
                                />
                              </div>
                              <span className="text-xs text-[#9899A8] font-medium w-9 text-right">
                                {captPct}%
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-[#545567]">—</span>
                          )}
                        </td>

                        {/* Facturación */}
                        <td className="px-6 py-4">
                          {factPct !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-[#353534] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${factPct}%`,
                                    background:
                                      factPct >= 100
                                        ? "#22c55e"
                                        : factPct >= 60
                                        ? "#C9963A"
                                        : "#ef4444",
                                  }}
                                />
                              </div>
                              <span className="text-xs text-[#9899A8] font-medium w-9 text-right">
                                {factPct}%
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-[#545567]">—</span>
                          )}
                        </td>

                        {/* Estancados */}
                        <td className="px-6 py-4 text-center">
                          {agent.stalledDeals > 0 ? (
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold mx-auto">
                              {agent.stalledDeals}
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-[#545567]">—</span>
                          )}
                        </td>

                        {/* Actividad */}
                        <td className="px-6 py-4">
                          <AgentSparkline history={agent.history} agentId={agent.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
            {/* Pipeline by agent */}
            <div className="bg-[#1C1D27]/80 backdrop-blur-xl border border-[#4f4537]/10 rounded-xl p-4 md:p-8 space-y-5">
              <h3 className="font-bold text-lg text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                Pipeline por Agente
              </h3>
              <div className="space-y-4">
                {sorted.slice(0, 4).map((agent) => {
                  const maxP = sorted[0]?.pipelineValue ?? 1;
                  const pct = maxP > 0 ? Math.round((agent.pipelineValue / maxP) * 100) : 0;
                  const shortName =
                    agent.name.split(" ").length >= 2
                      ? `${agent.name.split(" ")[0][0]}. ${agent.name.split(" ").slice(1).join(" ")}`
                      : agent.name;
                  const valLabel =
                    agent.pipelineValue >= 1_000_000
                      ? `RD$ ${(agent.pipelineValue / 1_000_000).toFixed(1)}M`
                      : `RD$ ${agent.pipelineValue.toLocaleString()}`;
                  return (
                    <div key={agent.id} className="space-y-2">
                      <div className="flex justify-between text-xs text-[#9899A8] uppercase tracking-wider">
                        <span>{shortName}</span>
                        <span>{valLabel}</span>
                      </div>
                      <div className="h-4 bg-[#353534] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#C9963A] rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pipeline by stage */}
            <div className="bg-[#1C1D27]/80 backdrop-blur-xl border border-[#4f4537]/10 rounded-xl p-4 md:p-8 space-y-5">
              <h3 className="font-bold text-lg text-white" style={{ fontFamily: "Manrope, sans-serif" }}>
                Pipeline por Etapa
              </h3>
              <PipelineStageChart data={pipelineByStage} />
            </div>
          </div>

          {/* Scatter */}
          <div className="pb-12">
            <ScatterPlot agents={sorted} />
          </div>
        </div>
      )}

      {/* ── Objetivos Tab ────────────────────────────────────────── */}
      {activeTab === "objetivos" && (
        <div
          className="rounded-xl p-4 md:p-8"
          style={{
            background: "rgba(14,15,20,0.8)",
            border: "1px solid rgba(201,150,58,0.12)",
          }}
        >
          <div className="mb-6">
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              Objetivos por Agente
            </h2>
            <p className="text-sm text-[#9899A8] mt-1">
              Metas mensuales de captaciones y facturación. El progreso se
              refleja en la columna de KPIs.
            </p>
          </div>
          <ObjectivesClient agents={objectivesAgents} embedded />
        </div>
      )}

      {/* ── Round Robin Tab ──────────────────────────────────────── */}
      {activeTab === "round-robin" && (
        <div
          className="rounded-xl p-4 md:p-8"
          style={{
            background: "rgba(14,15,20,0.8)",
            border: "1px solid rgba(201,150,58,0.12)",
          }}
        >
          <div className="mb-6">
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              Asignación Round Robin
            </h2>
            <p className="text-sm text-[#9899A8] mt-1">
              Los leads nuevos se asignan en rotación a los agentes activos
              según el orden definido aquí.
            </p>
          </div>
          <RoundRobinClient agents={rrAgents} config={rrConfig} embedded />
        </div>
      )}

      {/* ── Stalled deals sheet ──────────────────────────────────── */}
      {stalledOpen && (
        <StalledDealsSheet
          deals={stalledDeals}
          onClose={() => setStalledOpen(false)}
        />
      )}
    </div>
  );
}
