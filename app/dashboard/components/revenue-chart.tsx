"use client";

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
import type { RevenuePoint } from "../page";
import { T } from "../dashboard-client";
import { CHART_AXIS, CHART_GRID, CHART_TOOLTIP, CHART_CURSOR, CHART_GOLD, CHART_GOLD_LIGHT } from "@/lib/chart-theme";

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CHART_TOOLTIP}>
      <p className="eyebrow" style={{ margin: "0 0 2px" }}>
        {label}
      </p>
      <p className="num" style={{ fontSize: 16, fontWeight: 700, color: T.gold, margin: 0 }}>
        {formatMoney(payload[0].value)}
      </p>
    </div>
  );
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const hasData = data.some((d) => d.value > 0);

  return (
    <div className="card-secondary" style={{ padding: "22px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 className="surface-heading" style={{ margin: "0 0 2px" }}>
          Ingresos — últimos 6 meses
        </h2>
        <p style={{ fontSize: 11, color: T.surfaceDim, fontFamily: "var(--font-sans)", margin: 0 }}>
          Deals cerrados (closed_won)
        </p>
      </div>

      {!hasData ? (
        <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 13, color: T.surfaceDim, fontFamily: "var(--font-sans)" }}>
            Sin datos de ingresos aún.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid
              strokeDasharray={CHART_GRID.strokeDasharray}
              stroke={CHART_GRID.stroke}
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={CHART_AXIS.tick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatMoney}
              tick={CHART_AXIS.tick}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} cursor={CHART_CURSOR} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === data.length - 1 ? CHART_GOLD_LIGHT : CHART_GOLD}
                  fillOpacity={index === data.length - 1 ? 1 : 0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
