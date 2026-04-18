"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KPIData } from "../page";
import { T } from "../dashboard-client";

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function pctDelta(current: number, previous: number): { label: string; up: boolean; flat: boolean } {
  if (previous === 0 && current === 0) return { label: "Sin cambios", up: false, flat: true };
  if (previous === 0) return { label: "+100% vs mes ant.", up: true, flat: false };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    label: `${sign}${pct.toFixed(1)}% vs mes ant.`,
    up: pct >= 0,
    flat: pct === 0,
  };
}

interface CardDef {
  label: string;
  value: string;
  sub?: string;
  deltaLabel: string;
  deltaUp: boolean;
  deltaFlat: boolean;
  icon: React.ReactNode;
  heroColor: string;
}

function KpiCard({ card, delay }: { card: CardDef; delay: number }) {
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
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: "default",
        animationDelay: `${delay}ms`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 16px rgba(201,150,58,0.07)`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 24px rgba(0,0,0,0.3)";
      }}
    >
      {/* Label + icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: T.surfaceMuted,
          fontFamily: "Inter, sans-serif",
        }}>
          {card.label}
        </span>
        <span style={{ color: card.heroColor, opacity: 0.8 }}>
          {card.icon}
        </span>
      </div>

      {/* Value */}
      <div style={{
        fontFamily: "Manrope, sans-serif",
        fontWeight: 700,
        fontSize: 34,
        letterSpacing: "-0.03em",
        lineHeight: 1,
        color: card.heroColor,
        marginBottom: 10,
      }}>
        {card.value}
      </div>

      {/* Sub-line */}
      {card.sub && (
        <div style={{ fontSize: 11, color: T.surfaceDim, fontFamily: "Inter, sans-serif", marginBottom: 6 }}>
          {card.sub}
        </div>
      )}

      {/* Delta */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontFamily: "Inter, sans-serif",
        color: card.deltaFlat ? T.surfaceDim : card.deltaUp ? "#10b981" : "#f43f5e",
      }}>
        {card.deltaFlat
          ? <Minus size={12} />
          : card.deltaUp
          ? <TrendingUp size={12} />
          : <TrendingDown size={12} />
        }
        <span>{card.deltaLabel}</span>
      </div>
    </div>
  );
}

export function KpiCards({ kpi }: { kpi: KPIData }) {
  const revDelta    = pctDelta(kpi.revenueMth, kpi.revenuePrev);
  const contDelta   = pctDelta(kpi.newContactsMth, kpi.newContactsPrev);
  const convDelta   = pctDelta(kpi.conversionRate, kpi.conversionPrev);

  const cards: CardDef[] = [
    {
      label: "Ingresos del mes",
      value: formatMoney(kpi.revenueMth),
      deltaLabel: revDelta.label,
      deltaUp: revDelta.up,
      deltaFlat: revDelta.flat,
      heroColor: T.gold,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
    },
    {
      label: "Deals activos",
      value: String(kpi.activeDeals),
      sub: `Pipeline: ${formatMoney(kpi.pipelineValue)}`,
      deltaLabel: `${formatMoney(kpi.pipelineValue)} en cartera`,
      deltaUp: true,
      deltaFlat: kpi.pipelineValue === 0,
      heroColor: "#C9963A",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    {
      label: "Nuevos contactos",
      value: String(kpi.newContactsMth),
      deltaLabel: contDelta.label,
      deltaUp: contDelta.up,
      deltaFlat: contDelta.flat,
      heroColor: "#7c9fe8",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      ),
    },
    {
      label: "Tasa de conversión",
      value: `${kpi.conversionRate}%`,
      deltaLabel: convDelta.label,
      deltaUp: convDelta.up,
      deltaFlat: convDelta.flat,
      heroColor: "#a78bfa",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 20,
    }}>
      {cards.map((card, i) => (
        <KpiCard key={card.label} card={card} delay={i * 40} />
      ))}
    </div>
  );
}
