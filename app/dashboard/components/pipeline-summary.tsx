"use client";

import Link from "next/link";
import type { PipelineStageData } from "../page";
import { T } from "../dashboard-client";

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

// Gradient per position in the pipeline
const STAGE_COLORS = [
  { bar: "rgba(120,131,180,0.6)", dot: "#7883b4" },   // early stages — muted blue
  { bar: "rgba(120,131,180,0.7)", dot: "#8891be" },
  { bar: "rgba(160,140,90,0.65)", dot: "#a08c5a" },   // mid — amber start
  { bar: "rgba(180,145,75,0.75)", dot: "#b4914b" },
  { bar: "rgba(201,150,58,0.8)",  dot: "#C9963A" },   // gold
  { bar: "rgba(201,150,58,0.9)",  dot: "#C9963A" },
  { bar: "#C9963A",               dot: "#C9963A" },
  { bar: "#d4a443",               dot: "#d4a443" },
  { bar: "#e0b04d",               dot: "#e0b04d" },
  { bar: "#22c55e",               dot: "#22c55e" },   // closed_won — green
  { bar: "#22c55e",               dot: "#22c55e" },
  { bar: "#22c55e",               dot: "#22c55e" },
];

export function PipelineSummary({ pipeline }: { pipeline: PipelineStageData[] }) {
  const totalCount = pipeline.reduce((s, p) => s + p.count, 0);
  const totalValue = pipeline.reduce((s, p) => s + p.value, 0);

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: "22px 28px",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h2 style={{
            fontFamily: "Manrope, sans-serif",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "-0.01em",
            color: T.surface,
            margin: 0,
          }}>
            Pipeline de ventas
          </h2>
          <span style={{ fontSize: 11, color: T.surfaceDim, fontFamily: "Inter, sans-serif" }}>
            {totalCount} deals · {formatMoney(totalValue)}
          </span>
        </div>
        <Link
          href="/dashboard/pipeline"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: T.gold,
            textDecoration: "none",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Ver todo →
        </Link>
      </div>

      {/* Empty state */}
      {pipeline.length === 0 && (
        <p style={{ fontSize: 13, color: T.surfaceDim, textAlign: "center", padding: "16px 0", fontFamily: "Inter, sans-serif" }}>
          No hay deals activos.
        </p>
      )}

      {/* Stage bars */}
      {pipeline.length > 0 && (
        <div style={{ overflowX: "auto", overflowY: "visible", marginLeft: -4, paddingLeft: 4, paddingBottom: 4 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch", minWidth: "max-content" }}>
          {pipeline.map((stage, i) => {
            const widthPct = totalCount > 0 ? (stage.count / totalCount) * 100 : 0;
            const color = STAGE_COLORS[Math.min(i, STAGE_COLORS.length - 1)];
            const isWon = stage.stage === "closed_won";

            return (
              <Link
                key={stage.stage}
                href="/dashboard/pipeline"
                style={{
                  flex: `${Math.max(widthPct, 4)} 0 0`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                {/* Bar */}
                <div style={{
                  height: 40,
                  background: color.bar,
                  borderRadius: 6,
                  position: "relative",
                  overflow: "hidden",
                  border: isWon ? "1px solid rgba(34,197,94,0.3)" : `1px solid var(--glass-bg)`,
                  boxShadow: isWon ? "0 0 12px rgba(34,197,94,0.15)" : undefined,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <span style={{
                    fontFamily: "Manrope, sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    color: isWon ? "#22c55e" : T.surface,
                    textShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  }}>
                    {stage.count}
                  </span>
                </div>

                {/* Label + value */}
                <div>
                  <p style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: color.dot,
                    margin: "0 0 2px",
                    fontFamily: "Inter, sans-serif",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {stage.label}
                  </p>
                  {stage.value > 0 && (
                    <p style={{ fontSize: 10, color: T.surfaceDim, margin: 0, fontFamily: "Inter, sans-serif" }}>
                      {formatMoney(stage.value)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
        </div>
      )}
    </div>
  );
}
