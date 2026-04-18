"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLASSIFICATION_LABELS } from "@/lib/types";
import type { Contact, Task } from "@/lib/types";
import { NotificationBell } from "@/components/notification-bell";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { MessageCircle, Plus, TrendingUp, Users, DollarSign, BarChart2, MapPin, X } from "lucide-react";
import Link from "next/link";

// ─── Design tokens (Obsidian Edge) ───────────────────────────────────────────
const T = {
  bg: "#0e0e0e",
  card: "#2a2a2a",
  cardBorder: "rgba(201,150,58,0.12)",
  cardLow: "#201f1f",
  primary: "#f5bd5d",
  primaryContainer: "#c9963a",
  onSurface: "#e5e2e1",
  onSurfaceVariant: "#d3c4b1",
  stone500: "#78716c",
  stone900: "rgba(28,27,27,0.8)",
  amber600: "#d97706",
  emerald500: "#10b981",
  rose500: "#f43f5e",
};

interface KPI {
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  deltaUp?: boolean;
  icon: string;
}

interface PipelineStage {
  label: string;
  count: number;
  value: number;
  borderColor: string;
  barGradient: string;
  labelColor?: string;
  bgColor?: string;
}

function MaterialIcon({ name, style }: { name: string; style?: React.CSSProperties }) {
  return (
    <span
      className="material-symbols-outlined"
      style={{
        fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
        ...style,
      }}
    >
      {name}
    </span>
  );
}

function KpiCard({ kpi }: { kpi: KPI }) {
  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: 12,
        padding: 24,
        boxShadow: "0 0 40px rgba(245,189,93,0.04)",
        transition: "transform 0.2s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: T.onSurfaceVariant,
        }}>
          {kpi.label}
        </span>
        <MaterialIcon name={kpi.icon} style={{ color: T.primary, fontSize: 18 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{
          fontFamily: "Manrope, sans-serif",
          fontWeight: 800,
          fontSize: 36,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: T.primaryContainer,
        }}>
          {kpi.value}
        </span>
        {kpi.delta && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 8,
            fontSize: 11,
            color: kpi.deltaUp ? T.emerald500 : T.rose500,
          }}>
            <MaterialIcon
              name={kpi.deltaUp ? "trending_up" : "trending_down"}
              style={{ fontSize: 14, color: kpi.deltaUp ? T.emerald500 : T.rose500 }}
            />
            <span>{kpi.delta}</span>
          </div>
        )}
        {kpi.sub && !kpi.delta && (
          <div style={{ marginTop: 8, fontSize: 11, color: T.onSurfaceVariant }}>
            <span>{kpi.sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineFunnelCard({ stages }: { stages: PipelineStage[] }) {
  return (
    <div style={{
      background: T.cardLow,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 12,
      padding: 32,
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        {stages.map((stage) => (
          <div key={stage.label} style={{ flex: 1 }}>
            <div
              style={{
                background: stage.bgColor ?? "rgba(28,27,27,0.4)",
                padding: 16,
                borderRadius: 8,
                borderLeft: `4px solid ${stage.borderColor}`,
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(40,39,39,0.6)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = stage.bgColor ?? "rgba(28,27,27,0.4)"; }}
            >
              <p style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: stage.labelColor ?? T.onSurfaceVariant,
                marginBottom: 4,
              }}>
                {stage.label}
              </p>
              <p style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 700,
                fontSize: 24,
                color: T.onSurface,
              }}>
                {stage.count}
              </p>
            </div>
            <div style={{
              marginTop: 12,
              height: 6,
              width: "100%",
              background: T.stone900,
              borderRadius: 9999,
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                background: stage.barGradient,
                borderRadius: 9999,
                boxShadow: stage.label === "Cerrado" ? "0 0 10px rgba(217,119,6,0.5)" : undefined,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ActivityStatus = "cerrado" | "seguimiento" | "estancado" | "nuevo";

function statusBadge(status: ActivityStatus) {
  const map: Record<ActivityStatus, { bg: string; color: string; border: string; label: string }> = {
    cerrado:     { bg: "rgba(5,150,105,0.15)",  color: "#34d399", border: "rgba(5,150,105,0.3)",  label: "Cerrado" },
    seguimiento: { bg: "rgba(217,119,6,0.15)",  color: "#fbbf24", border: "rgba(217,119,6,0.3)",  label: "Seguimiento" },
    estancado:   { bg: "rgba(244,63,94,0.15)",  color: "#fb7185", border: "rgba(244,63,94,0.3)",  label: "Estancado" },
    nuevo:       { bg: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "rgba(59,130,246,0.3)", label: "Nuevo" },
  };
  const s = map[status];
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 12px",
      borderRadius: 9999,
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  );
}

function getContactStatus(c: Contact): ActivityStatus {
  if (c.lead_status === "archived") return "cerrado";
  if (c.lead_status === "unqualified") return "estancado";
  if (c.lead_classification === "hot" || c.lead_classification === "warm") return "seguimiento";
  if (c.lead_status === "new") return "nuevo";
  return "nuevo";
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentName, setAgentName] = useState("Ivan");
  const [agentInitials, setAgentInitials] = useState("I");
  const [insightOpen, setInsightOpen] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightData, setInsightData] = useState<{
    summary: { totalDeals: number; wonDeals: number; conversionRate: string; revenue90: number; avgDealValue: number; pipelineValue: number; leads30: number; leadsDelta: string | null };
    topAgent: { name: string; revenue: number } | null;
    revenueByMonth: { month: string; value: number }[];
    topZones: { zone: string; count: number }[];
    leadSources: { source: string; count: number }[];
  } | null>(null);

  async function openInsight() {
    setInsightOpen(true);
    if (insightData) return; // already loaded
    setInsightLoading(true);
    try {
      const res = await fetch("/api/market-insights");
      if (res.ok) setInsightData(await res.json());
    } finally {
      setInsightLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      // Load current agent name
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const { data: agent } = await supabase
          .from("agents")
          .select("full_name")
          .eq("email", user.email)
          .single();
        if (agent?.full_name) {
          setAgentName(agent.full_name.split(" ")[0]);
          const parts = agent.full_name.split(" ");
          setAgentInitials(parts.map((p: string) => p[0]).join("").slice(0, 2).toUpperCase());
        }
      }
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const today = new Date().toISOString().split("T")[0];

      const [
        { count: totalContacts },
        { count: newLeadsWeek },
        { data: contacts },
        { data: tasks },
        { data: deals },
      ] = await Promise.all([
        supabase.from("contacts").select("*", { count: "exact", head: true }),
        supabase.from("contacts").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase
          .from("contacts")
          .select("id, first_name, last_name, lead_classification, lead_status, source, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("tasks")
          .select("id, title, due_date, priority, status, contact:contacts(first_name, last_name, phone)")
          .eq("status", "pending")
          .lte("due_date", today)
          .order("due_date", { ascending: true })
          .limit(5),
        supabase.from("deals").select("deal_value, currency, stage").not("stage", "in", '("closed_lost")'),
      ]);

      const pipelineValue = (deals ?? []).reduce((s: number, d: { deal_value?: number }) => s + (d.deal_value ?? 0), 0);
      const total = totalContacts ?? 0;
      const convRate = total > 0 ? Math.round(((newLeadsWeek ?? 0) / total) * 100 * 10) / 10 : 0;
      const activeDeals = (deals ?? []).length;

      // Pipeline by stage
      const stageMap: Record<string, { count: number; value: number }> = {};
      for (const d of deals ?? []) {
        const s = d.stage ?? "nuevo_lead";
        if (!stageMap[s]) stageMap[s] = { count: 0, value: 0 };
        stageMap[s].count++;
        stageMap[s].value += d.deal_value ?? 0;
      }

      const stageOrder = ["nuevo_lead", "calificado", "propuesta", "negociacion", "cerrado_ganado"];
      const stageLabels: Record<string, string> = {
        nuevo_lead:    "Nuevo Lead",
        calificado:    "Contactado",
        propuesta:     "Propuesta",
        negociacion:   "Negociación",
        cerrado_ganado: "Cerrado",
      };
      const stageStyles: Record<string, Partial<PipelineStage>> = {
        nuevo_lead:    { borderColor: T.primary,          barGradient: `linear-gradient(to right, rgba(217,119,6,0.2), ${T.amber600})` },
        calificado:    { borderColor: `${T.primary}b3`,   barGradient: `linear-gradient(to right, ${T.amber600}, #f59e0b)` },
        propuesta:     { borderColor: `${T.primary}80`,   barGradient: "linear-gradient(to right, #f59e0b, #fbbf24)" },
        negociacion:   { borderColor: `${T.primary}4d`,   barGradient: "linear-gradient(to right, #fbbf24, #fcd34d)" },
        cerrado_ganado: {
          borderColor: T.amber600,
          barGradient: T.amber600,
          labelColor: T.amber600,
          bgColor: "rgba(217,119,6,0.1)",
        },
      };

      setPipelineStages(
        stageOrder.map((k) => ({
          label: stageLabels[k] ?? k,
          count: stageMap[k]?.count ?? 0,
          value: stageMap[k]?.value ?? 0,
          borderColor: stageStyles[k]?.borderColor ?? T.primary,
          barGradient: stageStyles[k]?.barGradient ?? T.amber600,
          labelColor: stageStyles[k]?.labelColor,
          bgColor: stageStyles[k]?.bgColor,
        }))
      );

      setKpis([
        {
          label: "Comisiones del mes",
          value: "$" + pipelineValue.toLocaleString(),
          delta: "+12.4% vs mes anterior",
          deltaUp: true,
          icon: "payments",
        },
        {
          label: "Deals Activos",
          value: activeDeals,
          sub: `Valor estimado: $${pipelineValue.toLocaleString()}`,
          icon: "handshake",
        },
        {
          label: "Contactos Activos",
          value: total,
          delta: `+${newLeadsWeek ?? 0} nuevos esta semana`,
          deltaUp: true,
          icon: "domain",
        },
        {
          label: "Tasa de Conversión",
          value: convRate + "%",
          icon: "analytics",
        },
      ]);

      setRecentContacts((contacts ?? []) as unknown as Contact[]);
      setPendingTasks((tasks ?? []) as unknown as Task[]);
      setLoading(false);
    }
    load();
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.onSurface }}>

      {/* Top App Bar */}
      <header style={{
        position: "sticky",
        top: 0,
        right: 0,
        height: 64,
        background: "rgba(14,14,14,0.85)",
        backdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        zIndex: 40,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <MaterialIcon name="search" style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: T.stone500,
            fontSize: 16,
          }} />
          <input
            type="text"
            placeholder="Buscar propiedades, clientes o transacciones..."
            style={{
              background: "rgba(28,27,27,0.5)",
              border: "none",
              borderRadius: 9999,
              paddingLeft: 40,
              paddingRight: 16,
              paddingTop: 6,
              paddingBottom: 6,
              fontSize: 12,
              width: 320,
              color: "#d4d4d4",
              outline: "none",
            }}
          />
        </div>

        {/* Right: greeting + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: T.onSurface }}>
              {(() => {
                const h = new Date().getHours();
                const greeting = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
                return `${greeting}, ${agentName}`;
              })()}
            </p>
            <p style={{ fontSize: 10, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {new Date().toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            {/* Calendar — links to Google Calendar */}
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir Google Calendar"
              style={{
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "transparent",
                border: "1px solid transparent",
                color: "#a8a29e",
                cursor: "pointer",
                textDecoration: "none",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(201,150,58,0.1)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(201,150,58,0.3)";
                (e.currentTarget as HTMLAnchorElement).style.color = T.primary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "transparent";
                (e.currentTarget as HTMLAnchorElement).style.color = "#a8a29e";
              }}
            >
              <MaterialIcon name="calendar_today" style={{ fontSize: 20 }} />
            </a>
            <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.1)" }} />
            {/* Profile avatar */}
            <Link
              href="/dashboard/profile"
              title="Mi perfil"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${T.primary}, ${T.primaryContainer})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "#281900",
                textDecoration: "none",
                flexShrink: 0,
                boxShadow: "0 0 0 2px rgba(201,150,58,0.2)",
                transition: "box-shadow 0.15s",
                fontFamily: "Manrope, sans-serif",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 0 3px rgba(201,150,58,0.5)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 0 2px rgba(201,150,58,0.2)";
              }}
            >
              {agentInitials}
            </Link>
          </div>
        </div>
      </header>

      {/* Scrollable canvas */}
      <section style={{ padding: 32, display: "flex", flexDirection: "column", gap: 32 }}>

        {/* KPI Row — 4 cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }} className="animate-fade-up">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{ height: 120, borderRadius: 12, background: T.card, border: `1px solid ${T.cardBorder}` }}
                />
              ))
            : kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)
          }
        </div>

        {/* Main content — pipeline (2/3) + top agents (1/3) */}
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 32, alignItems: "start" }}
          className="animate-fade-up-1"
        >
          {/* Left: Pipeline + Activity */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Pipeline header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: T.onSurface }}>
                Pipeline de Ventas
              </h2>
              <button
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  fontWeight: 700,
                  color: T.primary,
                  letterSpacing: "0.1em",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
                onClick={() => window.location.href = "/dashboard/pipeline"}
              >
                Ver todos los deals
              </button>
            </div>

            {/* Pipeline funnel */}
            {loading ? (
              <div className="animate-pulse" style={{ height: 120, borderRadius: 12, background: T.card }} />
            ) : (
              <PipelineFunnelCard stages={pipelineStages} />
            )}

            {/* Activity table header */}
            <h2 style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "-0.02em",
              color: T.onSurface,
              paddingTop: 8,
            }}>
              Actividad Reciente
            </h2>

            {/* Activity table */}
            <div style={{
              background: T.cardLow,
              border: `1px solid ${T.cardBorder}`,
              borderRadius: 12,
              overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(28,27,27,0.5)" }}>
                    {["Timestamp", "Agente / Cliente", "Clasificación", "Estado"].map((h, i) => (
                      <th key={h} style={{
                        padding: "12px 24px",
                        fontSize: 10,
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color: T.onSurfaceVariant,
                        textAlign: i === 3 ? "right" : "left",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={4} style={{ padding: "16px 24px" }}>
                          <div className="animate-pulse" style={{ height: 16, background: T.card, borderRadius: 4 }} />
                        </td>
                      </tr>
                    ))
                  ) : recentContacts.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: "24px", textAlign: "center", fontSize: 14, color: T.stone500 }}>
                        Sin actividad reciente.
                      </td>
                    </tr>
                  ) : (
                    recentContacts.map((c) => (
                      <tr
                        key={c.id}
                        className="table-row-hover"
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                          cursor: "default",
                          transition: "background 0.15s",
                        }}
                      >
                        <td style={{ padding: "16px 24px", fontSize: 12, fontFamily: "Manrope, sans-serif", color: T.stone500 }}>
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: false, locale: es })}
                        </td>
                        <td style={{ padding: "16px 24px" }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: T.onSurface }}>
                            {c.first_name} {c.last_name}
                          </p>
                          {c.source && (
                            <p style={{ fontSize: 10, color: T.stone500 }}>vía {c.source}</p>
                          )}
                        </td>
                        <td style={{ padding: "16px 24px", fontSize: 12, fontWeight: 500, color: T.onSurface }}>
                          {c.lead_classification ? CLASSIFICATION_LABELS[c.lead_classification] : "—"}
                        </td>
                        <td style={{ padding: "16px 24px", textAlign: "right" }}>
                          {statusBadge(getContactStatus(c))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column: Top Agents + Market Insight */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Top Agents header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: T.onSurface }}>
                Seguimientos
              </h2>
              <MaterialIcon name="more_vert" style={{ color: T.stone500, fontSize: 20 }} />
            </div>

            {/* Pending tasks list (replaces static top agents with live data) */}
            <div style={{
              background: T.cardLow,
              border: `1px solid ${T.cardBorder}`,
              borderRadius: 12,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}>
              {loading && (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="animate-pulse" style={{ height: 48, borderRadius: 8, background: T.card }} />
                ))
              )}
              {!loading && pendingTasks.length === 0 && (
                <p style={{ fontSize: 13, color: T.stone500, textAlign: "center", padding: "16px 0" }}>
                  Sin seguimientos pendientes.
                </p>
              )}
              {pendingTasks.map((t, idx) => {
                const contact = t.contact as { first_name?: string; last_name?: string; phone?: string } | null;
                const isOverdue = t.due_date ? new Date(t.due_date) < new Date() : false;
                const isUrgent = t.priority === "urgent" || isOverdue;
                const waPhone = contact?.phone?.replace(/\D/g, "");
                const waHref = waPhone ? `https://wa.me/${waPhone}` : undefined;
                const medals = ["🥇", "🥈", "🥉"];

                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ fontSize: 20, width: 24, textAlign: "center", flexShrink: 0 }}>
                      {idx < 3 ? medals[idx] : (
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.stone500, fontFamily: "Manrope, sans-serif" }}>
                          {idx + 1}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: isUrgent ? "rgba(239,68,68,0.15)" : "rgba(201,150,58,0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        fontSize: 16,
                        fontWeight: 700,
                        color: isUrgent ? "#ef4444" : T.primaryContainer,
                        border: `2px solid ${isUrgent ? "rgba(239,68,68,0.2)" : "rgba(201,150,58,0.2)"}`,
                      }}
                    >
                      {(contact?.first_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: T.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {contact ? `${contact.first_name} ${contact.last_name}` : "—"}
                      </p>
                      <p style={{ fontSize: 12, color: T.primary, fontFamily: "Manrope, sans-serif", fontWeight: 700 }}>
                        {isOverdue ? "Vencido" : t.due_date ? new Date(t.due_date).toLocaleDateString("es-DO", { day: "2-digit", month: "short" }) : ""}
                      </p>
                      <div style={{
                        width: "100%",
                        height: 4,
                        background: T.stone900,
                        borderRadius: 9999,
                        marginTop: 6,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          background: isUrgent ? "#ef4444" : T.primaryContainer,
                          width: `${Math.max(20, 100 - idx * 20)}%`,
                          borderRadius: 9999,
                        }} />
                      </div>
                    </div>
                    {waHref && (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(37,211,102,0.1)",
                          color: "#128C7E",
                          flexShrink: 0,
                          textDecoration: "none",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.background = "#25D366";
                          (e.currentTarget as HTMLAnchorElement).style.color = "#fff";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(37,211,102,0.1)";
                          (e.currentTarget as HTMLAnchorElement).style.color = "#128C7E";
                        }}
                      >
                        <MessageCircle size={14} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Market Insight card */}
            <div style={{
              background: "linear-gradient(135deg, #1c1b1b, #0e0e0e)",
              border: `1px solid ${T.cardBorder}`,
              borderRadius: 12,
              padding: 24,
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{ position: "absolute", right: -40, bottom: -40, opacity: 0.06, pointerEvents: "none" }}>
                <BarChart2 size={160} color={T.primary} />
              </div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: T.primary, marginBottom: 8 }}>
                Market Insight
              </p>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.onSurface, marginBottom: 8 }}>
                Análisis del Mercado
              </h3>
              <p style={{ fontSize: 12, color: T.stone500, lineHeight: 1.6, marginBottom: 0 }}>
                Datos reales de los últimos 90 días: pipeline activo, conversión, zonas líderes y rendimiento por agente.
              </p>
              <button
                onClick={openInsight}
                style={{
                  marginTop: 16,
                  padding: "8px 16px",
                  background: T.primary,
                  color: "#432c00",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  transition: "box-shadow 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(245,189,93,0.3)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
              >
                <TrendingUp size={12} />
                Ver Reporte
              </button>
            </div>

            {/* Market Insight Modal */}
            {insightOpen && (
              <div
                style={{
                  position: "fixed", inset: 0, zIndex: 9999,
                  background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 24,
                }}
                onClick={(e) => { if (e.target === e.currentTarget) setInsightOpen(false); }}
              >
                <div style={{
                  background: "#0D0E12", border: `1px solid rgba(201,150,58,0.2)`,
                  borderRadius: 20, width: "100%", maxWidth: 680,
                  maxHeight: "90vh", overflowY: "auto", padding: 32, position: "relative",
                }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: T.primary, margin: "0 0 6px" }}>
                        Market Insight · Últimos 90 días
                      </p>
                      <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: 24, color: T.onSurface, margin: 0 }}>
                        Análisis del Mercado
                      </h2>
                    </div>
                    <button
                      onClick={() => setInsightOpen(false)}
                      style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer", color: T.stone500 }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {insightLoading && (
                    <div style={{ textAlign: "center", padding: "48px 0", color: T.stone500 }}>
                      <div style={{ width: 32, height: 32, border: `2px solid rgba(201,150,58,0.2)`, borderTopColor: T.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
                      <p style={{ fontSize: 13 }}>Cargando datos reales…</p>
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}

                  {!insightLoading && insightData && (() => {
                    const { summary, topAgent, revenueByMonth, topZones, leadSources } = insightData;
                    const SOURCE_LABELS: Record<string, string> = {
                      ctwa_ad: "Meta Ads CTWA", lead_form: "Lead Form", referral: "Referidos",
                      walk_in: "Visita directa", website: "Website", social_media: "Redes sociales", other: "Otro",
                    };
                    const maxMonth = Math.max(...revenueByMonth.map((m) => m.value), 1);
                    const maxZone  = Math.max(...topZones.map((z) => z.count), 1);
                    const maxSrc   = Math.max(...leadSources.map((s) => s.count), 1);
                    const fmtMoney = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v.toLocaleString()}`;

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                        {/* KPI grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                          {[
                            { icon: <DollarSign size={16} color={T.primary} />, label: "Ingresos 90d", value: fmtMoney(summary.revenue90) },
                            { icon: <TrendingUp size={16} color="#22c55e" />,  label: "Conversión", value: `${summary.conversionRate}%` },
                            { icon: <BarChart2 size={16} color="#60a5fa" />,   label: "Pipeline activo", value: fmtMoney(summary.pipelineValue) },
                            { icon: <Users size={16} color="#a78bfa" />,        label: "Nuevos leads 30d", value: summary.leads30 + (summary.leadsDelta ? ` (${Number(summary.leadsDelta) >= 0 ? "+" : ""}${summary.leadsDelta}%)` : "") },
                            { icon: <TrendingUp size={16} color={T.primary} />, label: "Deal promedio", value: fmtMoney(summary.avgDealValue) },
                            { icon: <Users size={16} color="#22c55e" />,        label: "Deals ganados", value: `${summary.wonDeals} / ${summary.totalDeals}` },
                          ].map(({ icon, label, value }) => (
                            <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>{icon}<span style={{ fontSize: 10, color: T.stone500, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span></div>
                              <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 18, color: T.onSurface, margin: 0 }}>{value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Top agent */}
                        {topAgent && (
                          <div style={{ background: "rgba(201,150,58,0.06)", border: "1px solid rgba(201,150,58,0.15)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 22 }}>🏆</span>
                            <div>
                              <p style={{ fontSize: 11, color: T.primary, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 2px" }}>Top performer 90 días</p>
                              <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 15, color: T.onSurface, margin: 0 }}>{topAgent.name} — {fmtMoney(topAgent.revenue)}</p>
                            </div>
                          </div>
                        )}

                        {/* Revenue by month */}
                        {revenueByMonth.length > 0 && (
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.stone500, letterSpacing: "0.1em", margin: "0 0 12px" }}>Ingresos por mes</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {revenueByMonth.map((m) => (
                                <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <span style={{ fontSize: 11, color: T.stone500, width: 52, flexShrink: 0 }}>{m.month}</span>
                                  <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 9999, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${(m.value / maxMonth) * 100}%`, background: T.primary, borderRadius: 9999, transition: "width 0.5s" }} />
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: T.onSurface, width: 64, textAlign: "right", flexShrink: 0 }}>{fmtMoney(m.value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Top zones + lead sources row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                          {topZones.length > 0 && (
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                                <MapPin size={13} color={T.primary} />
                                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.stone500, letterSpacing: "0.1em", margin: 0 }}>Zonas con más demanda</p>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                {topZones.map((z) => (
                                  <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 9999, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${(z.count / maxZone) * 100}%`, background: "#60a5fa", borderRadius: 9999 }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: T.onSurface, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{z.zone}</span>
                                    <span style={{ fontSize: 10, color: T.stone500, flexShrink: 0 }}>{z.count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {leadSources.length > 0 && (
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.stone500, letterSpacing: "0.1em", margin: "0 0 12px" }}>Origen de leads</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                {leadSources.slice(0, 5).map((s) => (
                                  <div key={s.source} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 9999, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${(s.count / maxSrc) * 100}%`, background: "#a78bfa", borderRadius: 9999 }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: T.onSurface, flexShrink: 0 }}>{SOURCE_LABELS[s.source] ?? s.source}</span>
                                    <span style={{ fontSize: 10, color: T.stone500, flexShrink: 0 }}>{s.count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {!insightLoading && !insightData && (
                    <p style={{ textAlign: "center", color: T.stone500, fontSize: 13, padding: "32px 0" }}>
                      No hay datos disponibles.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Floating Action Button */}
      <button
        style={{
          position: "fixed",
          bottom: 32,
          right: 32,
          width: 56,
          height: 56,
          background: `linear-gradient(135deg, ${T.primary}, ${T.primaryContainer})`,
          color: "#281900",
          borderRadius: "50%",
          border: "none",
          boxShadow: "0 10px 30px rgba(201,150,58,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 60,
          transition: "transform 0.2s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        onClick={() => window.location.href = "/dashboard/pipeline"}
      >
        <Plus size={22} />
      </button>
    </div>
  );
}
