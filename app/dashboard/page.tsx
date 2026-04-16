"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLASSIFICATION_LABELS } from "@/lib/types";
import type { Contact, Task } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { MessageCircle, Plus } from "lucide-react";

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

  useEffect(() => {
    async function load() {
      const supabase = createClient();
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
                return `${greeting}, Ivan`;
              })()}
            </p>
            <p style={{ fontSize: 10, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {new Date().toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              style={{
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: "#a8a29e",
                cursor: "pointer",
              }}
            >
              <MaterialIcon name="notifications" style={{ fontSize: 22 }} />
            </button>
            <button
              style={{
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: "#a8a29e",
                cursor: "pointer",
              }}
            >
              <MaterialIcon name="calendar_today" style={{ fontSize: 22 }} />
            </button>
            <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.1)" }} />
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
              {/* Background decoration */}
              <div style={{
                position: "absolute",
                right: -40,
                bottom: -40,
                opacity: 0.08,
                pointerEvents: "none",
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 160,
                    color: T.primary,
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  insights
                </span>
              </div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: T.primary, marginBottom: 8 }}>
                Market Insight
              </p>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.onSurface, marginBottom: 12 }}>
                Tendencia Inmobiliaria Luxury
              </h3>
              <p style={{ fontSize: 12, color: T.stone500, lineHeight: 1.6 }}>
                Las propiedades frente al mar han visto un incremento del 8.2% en plusvalía trimestral.
              </p>
              <button
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
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(245,189,93,0.3)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
              >
                Generar Reporte IA
              </button>
            </div>
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
