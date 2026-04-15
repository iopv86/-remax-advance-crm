"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Search, TrendingUp, DollarSign, Target, Clock, AlertTriangle } from "lucide-react";
import type { AgentKPISummary } from "@/lib/types";

const AgentSparkline = dynamic(
  () => import("./agent-sparkline").then((m) => m.AgentSparkline),
  {
    ssr: false,
    loading: () => (
      <div className="h-8 w-16 rounded animate-pulse" style={{ background: "var(--secondary)" }} />
    ),
  }
);

type SortKey = "revenue" | "closedDeals" | "conversionRate";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "revenue",        label: "Comisión" },
  { key: "closedDeals",    label: "Cierres" },
  { key: "conversionRate", label: "Conversión" },
];

interface Props {
  agents: AgentKPISummary[];
}

function ResponseBadge({ minutes }: { minutes: number | null }) {
  if (minutes === null) {
    return (
      <span className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
        —
      </span>
    );
  }

  // RE/MAX Advance standard: < 10 min = excellent
  const isExcellent = minutes < 10;
  const isGood      = minutes < 60;
  const isRisky     = minutes < 480;

  const color = isExcellent ? "var(--emerald)"
    : isGood    ? "var(--amber)"
    : isRisky   ? "var(--red)"
    : "var(--muted-foreground)";

  const label = minutes < 60
    ? `${Math.round(minutes)}m`
    : `${(minutes / 60).toFixed(1)}h`;

  return (
    <span className="font-mono text-xs font-semibold" style={{ color }}>
      {label}
    </span>
  );
}

export function AgentsClient({ agents }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [query,   setQuery]   = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? agents.filter((a) => a.name.toLowerCase().includes(q))
      : agents;

    return [...list].sort((a, b) => {
      if (sortKey === "conversionRate") {
        const av = a.conversionRate ?? -1;
        const bv = b.conversionRate ?? -1;
        return bv - av;
      }
      return b[sortKey] - a[sortKey];
    });
  }, [agents, sortKey, query]);

  const topRevenue = filtered[0]?.revenue ?? 0;

  return (
    <div className="card-base overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-1.5">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={
                sortKey === key
                  ? { background: "var(--red-muted)", color: "var(--red)" }
                  : { background: "var(--secondary)", color: "var(--muted-foreground)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5"
          style={{ background: "var(--muted)", border: "1px solid transparent" }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar agente..."
            className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            style={{ color: "var(--foreground)" }}
          />
        </div>
      </div>

      {/* Agent rows */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: "var(--muted-foreground)" }}>
          <Search className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-sm">Sin resultados.</p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {filtered.map((agent, index) => {
            const barWidth = topRevenue > 0
              ? Math.max(4, Math.round((agent.revenue / topRevenue) * 100))
              : 0;

            const rankLabel = index === 0 ? "🥇"
              : index === 1 ? "🥈"
              : index === 2 ? "🥉"
              : String(index + 1);

            return (
              <div
                key={agent.id}
                className="flex items-center gap-4 px-6 py-4 table-row-hover transition-colors"
              >
                {/* Rank */}
                <span
                  className="w-6 shrink-0 text-center font-mono text-sm font-bold"
                  style={{ color: index < 3 ? "var(--amber)" : "var(--muted-foreground)" }}
                >
                  {rankLabel}
                </span>

                {/* Avatar */}
                <div
                  className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center font-semibold text-sm"
                  style={{ background: "var(--red-muted)", color: "var(--red)" }}
                >
                  {agent.name[0].toUpperCase()}
                </div>

                {/* Name + progress bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--foreground)" }}>
                      {agent.name}
                    </p>
                    <span className="ml-2 shrink-0 text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                      {agent.closedDeals} cerrados · {agent.activeDeals} activos
                      {agent.stalledDeals > 0 && (
                        <span style={{ color: "var(--amber)" }}> · {agent.stalledDeals} estancados</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--secondary)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${barWidth}%`, background: "var(--red)" }}
                    />
                  </div>
                </div>

                {/* Sparkline */}
                <AgentSparkline history={agent.history} agentId={agent.id} />

                {/* KPI chips */}
                <div className="hidden md:flex items-center gap-3 shrink-0">
                  {/* Response time */}
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" style={{ color: "var(--muted-foreground)" }} />
                    <ResponseBadge minutes={agent.avgResponseMinutes} />
                  </div>

                  {/* Conversion */}
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3" style={{ color: "var(--muted-foreground)" }} />
                    <span className="font-mono text-xs" style={{ color: "var(--foreground)" }}>
                      {agent.conversionRate !== null ? `${agent.conversionRate}%` : "—"}
                    </span>
                  </div>

                  {/* Avg ticket */}
                  {agent.avgTicketValue !== null && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" style={{ color: "var(--muted-foreground)" }} />
                      <span className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                        ${Math.round(agent.avgTicketValue / 1000)}k
                      </span>
                    </div>
                  )}

                  {/* Stalled alert */}
                  {agent.stalledDeals > 0 && (
                    <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--amber)" }} />
                  )}
                </div>

                {/* Revenue */}
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-bold" style={{ color: "var(--foreground)" }}>
                    ${agent.revenue.toLocaleString()}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <DollarSign className="h-3 w-3" style={{ color: "var(--muted-foreground)" }} />
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>comisión</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
