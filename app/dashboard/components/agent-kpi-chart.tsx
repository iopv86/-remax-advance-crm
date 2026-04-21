"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { T } from "../dashboard-client";

export interface AgentKpi {
  agent_id: string;
  full_name: string | null;
  deals_closed: number | null;
  total_revenue: number | null;
  conversion_rate: number | null;
  fast_response_rate: number | null;
}

type MetricKey = "deals_closed" | "total_revenue" | "conversion_rate" | "fast_response_rate";

interface MetricDef {
  key: MetricKey;
  label: string;
  format: (v: number) => string;
  suffix?: string;
}

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

const METRICS: MetricDef[] = [
  { key: "deals_closed",       label: "Deals Cerrados", format: (v) => String(Math.round(v)) },
  { key: "total_revenue",      label: "Ingresos",       format: formatMoney },
  { key: "conversion_rate",    label: "Tasa Conv.",     format: (v) => `${v.toFixed(1)}%` },
  { key: "fast_response_rate", label: "Resp. Rápida",   format: (v) => `${v.toFixed(1)}%` },
];

function firstName(full: string | null): string {
  if (!full) return "—";
  const parts = full.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function CustomTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { fullName: string } }>;
  label?: string;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div
      style={{
        background: "#1C1D27",
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: "8px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: T.surfaceDim,
          fontFamily: "Inter, sans-serif",
          margin: "0 0 2px",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}
      >
        {p.payload.fullName ?? label}
      </p>
      <p
        style={{
          fontSize: 16,
          fontFamily: "Manrope, sans-serif",
          fontWeight: 700,
          color: T.gold,
          margin: 0,
        }}
      >
        {formatValue(p.value)}
      </p>
    </div>
  );
}

export function AgentKpiChart({ agents }: { agents: AgentKpi[] }) {
  const [selected, setSelected] = useState<MetricKey>("deals_closed");
  const metric = METRICS.find((m) => m.key === selected)!;

  // Build + sort data by selected metric (descending), cap at top 10
  const data = agents
    .map((a) => ({
      agent: firstName(a.full_name),
      fullName: a.full_name ?? "—",
      value: Number(a[selected] ?? 0),
    }))
    .filter((d) => d.agent !== "—")
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const hasData = data.some((d) => d.value > 0);
  const topValue = data[0]?.value ?? 0;

  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: "22px 24px",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.01em",
              color: T.surface,
              margin: "0 0 2px",
            }}
          >
            Desempeño por agente
          </h2>
          <p
            style={{
              fontSize: 11,
              color: T.surfaceDim,
              fontFamily: "Inter, sans-serif",
              margin: 0,
            }}
          >
            Mes actual · {metric.label}
          </p>
        </div>

        {/* Metric switcher */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {METRICS.map((m) => {
            const isActive = m.key === selected;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelected(m.key)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: isActive
                    ? `1px solid rgba(201,150,58,0.5)`
                    : `1px solid ${T.borderSubtle}`,
                  background: isActive ? T.gold : "transparent",
                  color: isActive ? "#1A0E00" : T.surfaceMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  letterSpacing: "0.01em",
                }}
                onMouseEnter={(e) => {
                  if (isActive) return;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
                  (e.currentTarget as HTMLButtonElement).style.color = T.surface;
                }}
                onMouseLeave={(e) => {
                  if (isActive) return;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = T.borderSubtle;
                  (e.currentTarget as HTMLButtonElement).style.color = T.surfaceMuted;
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      {!hasData ? (
        <div
          style={{
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: T.surfaceDim,
              fontFamily: "Inter, sans-serif",
            }}
          >
            Sin datos de agentes aún.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="22%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="agent"
              tick={{ fill: T.surfaceDim, fontSize: 10, fontFamily: "Inter, sans-serif" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={data.length > 6 ? -20 : 0}
              textAnchor={data.length > 6 ? "end" : "middle"}
              height={data.length > 6 ? 48 : 24}
            />
            <YAxis
              tickFormatter={metric.format}
              tick={{ fill: T.surfaceDim, fontSize: 10, fontFamily: "Inter, sans-serif" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              content={<CustomTooltip formatValue={metric.format} />}
              cursor={{ fill: "rgba(201,150,58,0.06)" }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.value === topValue ? "#E8B84B" : "#C9963A"}
                  fillOpacity={entry.value === topValue ? 1 : 0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
