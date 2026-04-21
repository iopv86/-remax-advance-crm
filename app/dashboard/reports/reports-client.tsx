"use client";

import { useState, useMemo } from "react";
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
import { Download, TrendingUp, Users, DollarSign, Award } from "lucide-react";
import { AgentFilter } from "@/components/agent-filter";
import type { DealRow, AgentRow } from "./page";

// ─── Tokens ────────────────────────────────────────────────────────────────────

const GOLD = "#C9963A";
const BG_BODY = "#0D0E12";
const BG_CARD = "rgba(28,29,39,0.7)";
const BG_ELEVATED = "#1C1D27";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED = "#9899A8";
const TEXT_DIM = "#6B7280";
const BORDER_GOLD = "rgba(201,150,58,0.15)";

// ─── Stage definitions ─────────────────────────────────────────────────────────

const FUNNEL_STAGES = [
  { key: "qualified",         label: "Calificado" },
  { key: "contacted",         label: "Contactado" },
  { key: "showing_scheduled", label: "Vista prog." },
  { key: "showing_done",      label: "Vista hecha" },
  { key: "offer_made",        label: "Oferta" },
  { key: "negotiation",       label: "Negociación" },
  { key: "closed_won",        label: "Ganado" },
  { key: "closed_lost",       label: "Perdido" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString("es-DO")}`;
}

function getMonthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("es-DO", { month: "short", year: "2-digit" });
}

function cutoffDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  deals: DealRow[];
  agents: AgentRow[];
  totalLeads: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportsClient({ deals, agents, totalLeads }: Props) {
  const [dateRange, setDateRange] = useState<30 | 90 | 365>(90);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const cutoff = useMemo(() => cutoffDate(dateRange), [dateRange]);

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (new Date(d.created_at) < cutoff) return false;
      if (selectedAgentId && d.agent_id !== selectedAgentId) return false;
      return true;
    });
  }, [deals, cutoff, selectedAgentId]);

  // ── KPI cards ───────────────────────────────────────────────────────────────
  const closedWon   = filtered.filter((d) => d.stage === "closed_won");
  const closedLost  = filtered.filter((d) => d.stage === "closed_lost");
  const active      = filtered.filter((d) => !["closed_won", "closed_lost"].includes(d.stage));
  const totalRevenue = closedWon.reduce((s, d) => s + (d.deal_value ?? 0), 0);
  const totalCommission = closedWon.reduce((s, d) => s + (d.commission_value ?? 0), 0);
  const conversionRate = filtered.length > 0
    ? ((closedWon.length / filtered.length) * 100).toFixed(1)
    : "0.0";

  // ── Funnel ──────────────────────────────────────────────────────────────────
  const funnelData = FUNNEL_STAGES.map(({ key, label }) => ({
    label,
    count: filtered.filter((d) => d.stage === key).length,
  }));

  // ── Revenue by month ────────────────────────────────────────────────────────
  const monthlyMap = new Map<string, number>();
  for (const d of closedWon) {
    const key = getMonthKey(d.actual_close_date ?? d.created_at);
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + (d.deal_value ?? 0));
  }
  const monthlyData = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ month: monthLabel(key), value }));

  // ── Agent performance ────────────────────────────────────────────────────────
  const agentStats = agents.map((a) => {
    const agentDeals   = filtered.filter((d) => d.agent_id === a.id);
    const won          = agentDeals.filter((d) => d.stage === "closed_won");
    const lost         = agentDeals.filter((d) => d.stage === "closed_lost");
    const revenue      = won.reduce((s, d) => s + (d.deal_value ?? 0), 0);
    const commission   = won.reduce((s, d) => s + (d.commission_value ?? 0), 0);
    const conv         = agentDeals.length > 0 ? ((won.length / agentDeals.length) * 100).toFixed(0) : "0";
    return { id: a.id, name: a.full_name ?? a.email, total: agentDeals.length, won: won.length, lost: lost.length, revenue, commission, conv };
  }).filter((a) => a.total > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // ── CSV export ───────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ["Agente", "Deals totales", "Ganados", "Perdidos", "Conversión %", "Ingresos USD", "Comisiones USD"];
    const rows = agentStats.map((a) => [
      a.name, a.total, a.won, a.lost, a.conv, a.revenue.toFixed(0), a.commission.toFixed(0),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-agentes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const DATE_TABS: { label: string; value: 30 | 90 | 365 }[] = [
    { label: "30 días", value: 30 },
    { label: "90 días", value: 90 },
    { label: "1 año",   value: 365 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG_BODY, color: TEXT_PRIMARY, fontFamily: "Inter, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "rgba(13,14,18,0.9)", backdropFilter: "blur(16px)",
        borderBottom: `1px solid rgba(201,150,58,0.1)`,
        padding: "20px 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <h1 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
          Reportes
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Date range tabs */}
          <div style={{ display: "flex", gap: 4, background: BG_ELEVATED, borderRadius: 9999, padding: 4 }}>
            {DATE_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setDateRange(t.value)}
                style={{
                  padding: "6px 16px", borderRadius: 9999, fontSize: 12,
                  fontWeight: dateRange === t.value ? 700 : 500,
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                  background: dateRange === t.value ? GOLD : "transparent",
                  color: dateRange === t.value ? "#0D0E12" : TEXT_MUTED,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Print / PDF */}
          <button
            onClick={() => window.print()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11, fontWeight: 600, color: TEXT_MUTED,
              background: BG_ELEVATED, border: `1px solid ${BORDER_GOLD}`,
              borderRadius: 6, padding: "7px 14px", cursor: "pointer",
            }}
          >
            PDF
          </button>

          {/* CSV export */}
          <button
            onClick={exportCSV}
            disabled={agentStats.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11, fontWeight: 600, color: GOLD,
              background: "none", border: `1px solid ${BORDER_GOLD}`,
              borderRadius: 6, padding: "7px 14px",
              cursor: agentStats.length === 0 ? "not-allowed" : "pointer",
              opacity: agentStats.length === 0 ? 0.4 : 1,
            }}
          >
            <Download style={{ width: 13, height: 13 }} />
            CSV
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* ── Agent filter ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <AgentFilter
            agents={agents.map((a) => ({ id: a.id, full_name: a.full_name }))}
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
              Reporte filtrado · {filtered.length} deal{filtered.length === 1 ? "" : "s"} en el período
            </span>
          )}
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 40 }}>
          {[
            { icon: <TrendingUp style={{ width: 18, height: 18, color: GOLD }} />, label: "Ingresos ganados", value: formatMoney(totalRevenue), sub: `Comisiones: ${formatMoney(totalCommission)}` },
            { icon: <Award style={{ width: 18, height: 18, color: "#22c55e" }} />, label: "Deals ganados", value: closedWon.length, sub: `Perdidos: ${closedLost.length}` },
            { icon: <DollarSign style={{ width: 18, height: 18, color: "#60a5fa" }} />, label: "Pipeline activo", value: active.length, sub: `Deals en curso` },
            { icon: <Users style={{ width: 18, height: 18, color: "#a78bfa" }} />, label: "Conversión", value: `${conversionRate}%`, sub: `${totalLeads} leads totales` },
          ].map(({ icon, label, value, sub }) => (
            <div key={label} style={{
              background: BG_CARD, backdropFilter: "blur(12px)",
              border: `1px solid ${BORDER_GOLD}`, borderRadius: 16, padding: "20px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                {icon}
                <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
              </div>
              <p style={{ fontSize: 28, fontWeight: 800, fontFamily: "Manrope, sans-serif", color: TEXT_PRIMARY, margin: "0 0 4px" }}>{value}</p>
              <p style={{ fontSize: 11, color: TEXT_DIM, margin: 0 }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Charts row ────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 40 }}>

          {/* Funnel */}
          <div style={{ background: BG_CARD, border: `1px solid ${BORDER_GOLD}`, borderRadius: 16, padding: "24px" }}>
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 15, color: TEXT_PRIMARY, margin: "0 0 20px" }}>
              Embudo de Conversión
            </h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 0, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: TEXT_DIM }} axisLine={false} tickLine={false} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 10, fill: TEXT_MUTED }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{ background: BG_ELEVATED, border: `1px solid ${BORDER_GOLD}`, borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: TEXT_PRIMARY }}
                  labelStyle={{ color: TEXT_MUTED }}
                  formatter={(v) => [Number(v), "Deals"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {funnelData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.label === "Ganado" ? "#22c55e" : entry.label === "Perdido" ? "#ef4444" : GOLD} fillOpacity={entry.label === "Ganado" || entry.label === "Perdido" ? 1 : 0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by month */}
          <div style={{ background: BG_CARD, border: `1px solid ${BORDER_GOLD}`, borderRadius: 16, padding: "24px" }}>
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 15, color: TEXT_PRIMARY, margin: "0 0 20px" }}>
              Ingresos por Mes
            </h2>
            {monthlyData.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, color: TEXT_DIM, fontSize: 13 }}>
                Sin deals cerrados en este período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: TEXT_DIM }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatMoney(v)} tick={{ fontSize: 10, fill: TEXT_DIM }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip
                    contentStyle={{ background: BG_ELEVATED, border: `1px solid ${BORDER_GOLD}`, borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: TEXT_PRIMARY }}
                    labelStyle={{ color: TEXT_MUTED }}
                    formatter={(v) => [`$${Number(v).toLocaleString("es-DO")}`, "Ingresos"]}
                  />
                  <Bar dataKey="value" fill={GOLD} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Agent performance table ───────────────────────────────────────── */}
        <div style={{ background: BG_CARD, border: `1px solid ${BORDER_GOLD}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${BORDER_GOLD}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 15, color: TEXT_PRIMARY, margin: 0 }}>
              Rendimiento por Agente
            </h2>
            <span style={{ fontSize: 11, color: TEXT_DIM }}>{agentStats.length} agentes activos</span>
          </div>

          {agentStats.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: TEXT_DIM, fontSize: 13 }}>
              Sin datos en este período
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                  {["Agente", "Deals", "Ganados", "Conv. %", "Ingresos", "Comisiones"].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: h === "Agente" ? "left" : "right", fontSize: 10, fontWeight: 600, color: TEXT_DIM, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "Manrope, sans-serif" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentStats.map((a, idx) => (
                  <tr
                    key={a.id}
                    style={{
                      borderBottom: idx < agentStats.length - 1 ? `1px solid rgba(255,255,255,0.03)` : "none",
                      background: idx === 0 ? "rgba(201,150,58,0.04)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {idx === 0 && <span title="Top performer">🏆</span>}
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, margin: 0 }}>{a.name}</p>
                          <p style={{ fontSize: 10, color: TEXT_DIM, margin: 0 }}>{a.lost > 0 ? `${a.lost} perdido${a.lost !== 1 ? "s" : ""}` : "Sin pérdidas"}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, color: TEXT_MUTED }}>{a.total}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#22c55e" }}>{a.won}</span>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 9999,
                        background: Number(a.conv) >= 50 ? "rgba(34,197,94,0.1)" : "rgba(201,150,58,0.1)",
                        color: Number(a.conv) >= 50 ? "#22c55e" : GOLD,
                      }}>
                        {a.conv}%
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
                      {formatMoney(a.revenue)}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", fontSize: 13, color: GOLD }}>
                      {formatMoney(a.commission)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      <style>{`
        @media print {
          header { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
