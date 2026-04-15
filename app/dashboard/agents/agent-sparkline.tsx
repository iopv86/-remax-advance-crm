"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { AgentHistoricalKPIView } from "@/lib/types";

interface Props {
  history: AgentHistoricalKPIView[];
  agentId: string;
}

export function AgentSparkline({ history, agentId }: Props) {
  // Last 6 months, ascending order for left→right chart direction
  const points = history
    .slice(0, 6)
    .reverse()
    .map((h) => ({ value: h.total_revenue }));

  if (points.length === 0) {
    return <div className="h-8 w-16 rounded" style={{ background: "var(--secondary)" }} />;
  }

  const gradientId = `sparkline-${agentId}`;

  return (
    <ResponsiveContainer width={64} height={32}>
      <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--red)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--red)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--red)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
