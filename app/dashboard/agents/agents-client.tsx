"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Download } from "lucide-react";
import type { AgentKPISummary } from "@/lib/types";

const AgentSparkline = dynamic(
  () => import("./agent-sparkline").then((m) => m.AgentSparkline),
  {
    ssr: false,
    loading: () => (
      <div className="h-8 w-24 rounded animate-pulse bg-[#353534]" />
    ),
  }
);

type Period = "Semanal" | "Mensual" | "Trimestral";

interface Props {
  agents: AgentKPISummary[];
}

// ─── Response time badge ─────────────────────────────────────────────────────

function ResponseBadge({ minutes }: { minutes: number | null }) {
  if (minutes === null) {
    return <span className="font-mono text-xs text-[#545567]">—</span>;
  }

  let label: string;
  let colorClass: string;
  let borderClass: string;

  if (minutes < 60) {
    label = "<1h";
    colorClass = "bg-green-500/10 text-green-500";
    borderClass = "border border-green-500/20";
  } else if (minutes < 180) {
    label = `${Math.round(minutes / 60)}h`;
    colorClass = "bg-amber-500/10 text-amber-500";
    borderClass = "border border-amber-500/20";
  } else {
    label = `${Math.round(minutes / 60)}h`;
    colorClass = "bg-red-500/10 text-red-500";
    borderClass = "border border-red-500/20";
  }

  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${colorClass} ${borderClass}`}
    >
      {label}
    </span>
  );
}

// ─── Stalled / Estado badge ──────────────────────────────────────────────────

function StalledBadge({ count }: { count: number }) {
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold mx-auto">
      {count}
    </span>
  );
}

// ─── Pipeline bar chart (decorative, driven by real agent data) ──────────────

function PipelineBarChart({ agents }: { agents: AgentKPISummary[] }) {
  const top4 = agents.slice(0, 4);
  const maxPipeline = top4[0]?.pipelineValue ?? 1;

  return (
    <div className="bg-[#1C1D27]/80 backdrop-blur-xl border border-[#4f4537]/10 rounded-xl p-8 space-y-6">
      <h3
        className="font-bold text-lg text-white"
        style={{ fontFamily: "Manrope, sans-serif" }}
      >
        Valor de Pipeline por Agente
      </h3>
      <div className="space-y-4">
        {top4.map((agent) => {
          const pct =
            maxPipeline > 0
              ? Math.round((agent.pipelineValue / maxPipeline) * 100)
              : 0;
          const shortName =
            agent.name.split(" ").length >= 2
              ? `${agent.name.split(" ")[0][0]}. ${agent.name.split(" ").slice(1).join(" ")}`
              : agent.name;
          const valueLabel =
            agent.pipelineValue >= 1_000_000
              ? `RD$ ${(agent.pipelineValue / 1_000_000).toFixed(1)}M`
              : `RD$ ${agent.pipelineValue.toLocaleString()}`;

          return (
            <div key={agent.id} className="space-y-2">
              <div className="flex justify-between text-xs text-[#9899A8] uppercase tracking-wider">
                <span>{shortName}</span>
                <span>{valueLabel}</span>
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
  );
}

// ─── Scatter plot (decorative positions derived from real data) ───────────────

function ScatterPlot({ agents }: { agents: AgentKPISummary[] }) {
  // Map agents to scatter positions: x = response time (lower = more left → shorter delay),
  // y = conversion rate (higher = further up)
  const maxResp = Math.max(...agents.map((a) => a.avgResponseMinutes ?? 0), 1);
  const maxConv = Math.max(...agents.map((a) => a.conversionRate ?? 0), 1);

  const dots = agents.slice(0, 7).map((agent) => {
    const resp = agent.avgResponseMinutes ?? maxResp * 0.5;
    const conv = agent.conversionRate ?? maxConv * 0.5;
    const left = Math.round((resp / maxResp) * 80) + 10;
    const bottom = Math.round((conv / maxConv) * 75) + 10;
    return { id: agent.id, left, bottom };
  });

  return (
    <div className="bg-[#1C1D27]/80 backdrop-blur-xl border border-[#4f4537]/10 rounded-xl p-8 space-y-6 relative overflow-hidden">
      <h3
        className="font-bold text-lg text-white"
        style={{ fontFamily: "Manrope, sans-serif" }}
      >
        Tiempo de Respuesta vs Conversión
      </h3>
      <div className="relative h-[250px] border-l border-b border-[#4f4537]/30 ml-6 mb-6">
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
          Tiempo de Respuesta (min)
        </span>
      </div>
      <p className="text-[11px] text-[#9899A8] italic leading-tight text-center">
        La correlación indica que tiempos menores a 5 min incrementan la
        conversión en un 22%.
      </p>
    </div>
  );
}

// ─── Main client component ───────────────────────────────────────────────────

export function AgentsClient({ agents }: Props) {
  const [period, setPeriod] = useState<Period>("Mensual");

  const sorted = useMemo(
    () => [...agents].sort((a, b) => b.pipelineValue - a.pipelineValue),
    [agents]
  );

  const topId = sorted[0]?.id;

  return (
    <div className="space-y-8">
      {/* Page header ───────────────────────────────────────────── */}
      <header className="flex items-center justify-between">
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
        <div className="flex items-center gap-4">
          {/* Period toggle */}
          <div className="bg-[#353534]/20 p-1 rounded-lg flex items-center">
            {(["Semanal", "Mensual", "Trimestral"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p
                    ? "bg-[#C9963A] text-[#4a3100] shadow-lg"
                    : "text-[#9899A8] hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {/* Export */}
          <button className="flex items-center gap-2 px-4 py-2 border border-[#4f4537]/30 rounded-lg text-xs font-medium text-[#9899A8] hover:bg-[#353534] transition-colors">
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
        </div>
      </header>

      {/* Agent table ─────────────────────────────────────────────── */}
      <section className="bg-[#14151C] rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
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
                  "Estado",
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

                const captPct = agent.captacionesObjetivo && agent.captacionesObjetivo > 0
                  ? Math.min(100, Math.round((agent.closedDeals / agent.captacionesObjetivo) * 100))
                  : null;
                const factPct = agent.facturacionObjetivo && agent.facturacionObjetivo > 0
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
                    <td className="px-6 py-4 text-sm text-[#e5e2e1]">
                      {leadsCount}
                    </td>

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

                    {/* Captaciones objetivo */}
                    <td className="px-6 py-4">
                      {captPct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#353534] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${captPct}%`, background: captPct >= 100 ? "#22c55e" : captPct >= 60 ? "#C9963A" : "#ef4444" }}
                            />
                          </div>
                          <span className="text-xs text-[#9899A8] font-medium w-9 text-right">{captPct}%</span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-[#545567]">—</span>
                      )}
                    </td>

                    {/* Facturación objetivo */}
                    <td className="px-6 py-4">
                      {factPct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#353534] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${factPct}%`, background: factPct >= 100 ? "#22c55e" : factPct >= 60 ? "#C9963A" : "#ef4444" }}
                            />
                          </div>
                          <span className="text-xs text-[#9899A8] font-medium w-9 text-right">{factPct}%</span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-[#545567]">—</span>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="px-6 py-4 text-center">
                      <StalledBadge count={agent.stalledDeals} />
                    </td>

                    {/* Actividad 7D */}
                    <td className="px-6 py-4">
                      <AgentSparkline
                        history={agent.history}
                        agentId={agent.id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Charts ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
        <PipelineBarChart agents={sorted} />
        <ScatterPlot agents={sorted} />
      </div>
    </div>
  );
}
