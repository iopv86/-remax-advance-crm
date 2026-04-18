"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RevenuePoint } from "../page";
import { T } from "../dashboard-client";

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
    <div style={{
      background: "#1C1D27",
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: "8px 14px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    }}>
      <p style={{ fontSize: 10, color: T.surfaceDim, fontFamily: "Inter, sans-serif", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </p>
      <p style={{ fontSize: 16, fontFamily: "Manrope, sans-serif", fontWeight: 700, color: T.gold, margin: 0 }}>
        {formatMoney(payload[0].value)}
      </p>
    </div>
  );
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const hasData = data.some((d) => d.value > 0);

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: "22px 24px",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{
          fontFamily: "Manrope, sans-serif",
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: "-0.01em",
          color: T.surface,
          margin: "0 0 2px",
        }}>
          Ingresos — últimos 6 meses
        </h2>
        <p style={{ fontSize: 11, color: T.surfaceDim, fontFamily: "Inter, sans-serif", margin: 0 }}>
          Deals cerrados (closed_won)
        </p>
      </div>

      {!hasData ? (
        <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 13, color: T.surfaceDim, fontFamily: "Inter, sans-serif" }}>
            Sin datos de ingresos aún.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#C9963A" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#C9963A" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fill: T.surfaceDim, fontSize: 10, fontFamily: "Inter, sans-serif" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatMoney}
              tick={{ fill: T.surfaceDim, fontSize: 10, fontFamily: "Inter, sans-serif" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#C9963A"
              strokeWidth={2}
              fill="url(#goldGrad)"
              dot={{ r: 3, fill: "#C9963A", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#E8B84B", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
