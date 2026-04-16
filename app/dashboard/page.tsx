"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLASSIFICATION_LABELS } from "@/lib/types";
import type { Contact, Task } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUpRight, ArrowDownRight, Users, Bell, Search, Plus, MessageCircle } from "lucide-react";

interface KPI {
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  deltaUp?: boolean;
  accent: string;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [pipelineStages, setPipelineStages] = useState<{ label: string; count: number; value: number }[]>([]);
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
          .limit(7),
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
        nuevo_lead: "Nuevo Lead",
        calificado: "Calificado",
        propuesta: "Propuesta",
        negociacion: "Negociación",
        cerrado_ganado: "Cerrado",
      };
      setPipelineStages(
        stageOrder.map((k) => ({
          label: stageLabels[k] ?? k,
          count: stageMap[k]?.count ?? 0,
          value: stageMap[k]?.value ?? 0,
        }))
      );

      setKpis([
        {
          label: "Contactos Activos",
          value: total,
          sub: "usuarios",
          delta: "+12%",
          deltaUp: true,
          accent: "var(--teal)",
        },
        {
          label: "Pipeline Total",
          value: "$" + pipelineValue.toLocaleString(),
          delta: "+8%",
          deltaUp: true,
          accent: "var(--teal)",
        },
        {
          label: "Tratos Activos",
          value: (deals ?? []).length,
          sub: "propuestas",
          delta: "-2",
          deltaUp: false,
          accent: "var(--red)",
        },
        {
          label: "Tasa de Conversión",
          value: convRate + "%",
          delta: "+1.2pp",
          deltaUp: true,
          accent: "var(--teal)",
        },
      ]);

      setRecentContacts((contacts ?? []) as unknown as Contact[]);
      setPendingTasks((tasks ?? []) as unknown as Task[]);
      setLoading(false);
    }
    load();
  }, []);

  const maxPipelineCount = Math.max(...pipelineStages.map((s) => s.count), 1);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--background)" }}>
      {/* Page header */}
      <header
        className="flex justify-between items-center h-16 px-8 sticky top-0 z-40 backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--background) 85%, transparent)",
          borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-6">
          <h1
            style={{
              fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: "-0.02em",
              color: "var(--foreground)",
            }}
          >
            Dashboard
          </h1>
          {/* Search bar */}
          <div className="relative hidden md:block">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
              style={{ color: "var(--muted-foreground)" }}
            />
            <input
              type="text"
              placeholder="Buscar contactos o propiedades..."
              className="h-9 w-72 rounded-lg pl-9 pr-4 text-sm outline-none transition-all"
              style={{
                background: "var(--muted)",
                border: "1px solid transparent",
                color: "var(--foreground)",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
              onBlur={(e) => { e.target.style.borderColor = "transparent"; }}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Notification bell */}
          <button
            className="relative p-2 rounded-lg transition-colors hover:bg-muted cursor-pointer"
            style={{ color: "var(--muted-foreground)" }}
          >
            <Bell className="h-4 w-4" />
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
              style={{ background: "var(--red)", border: "2px solid var(--background)" }}
            />
          </button>
          {/* Nuevo Trato CTA */}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:brightness-95 active:scale-95 cursor-pointer"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              boxShadow: "0 2px 8px rgba(201,150,58,0.3)",
            }}
            onClick={() => window.location.href = "/dashboard/pipeline"}
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo Trato
          </button>
        </div>
      </header>

      <div className="p-8 space-y-8 max-w-[1400px] mx-auto w-full">

        {/* KPI Row — matches 01-dashboard.html */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-up">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse h-[110px] rounded-xl" style={{ background: "var(--card)", border: "1px solid #E5E7EB" }} />
              ))
            : kpis.map(({ label, value, sub, delta, deltaUp, accent }) => (
                <div
                  key={label}
                  className="relative overflow-hidden hover:shadow-sm transition-all"
                  style={{
                    background: "var(--card)",
                    border: "1px solid #E5E7EB",
                    borderRadius: 12,
                    padding: "24px",
                  }}
                >
                  {/* Left accent border */}
                  <div
                    className="absolute left-0 top-0 h-full"
                    style={{ width: 2, background: accent }}
                  />

                  <div className="flex justify-between items-start mb-4">
                    <span
                      className="uppercase tracking-[0.1em] font-semibold"
                      style={{ fontSize: 10, color: "var(--muted-foreground)" }}
                    >
                      {label}
                    </span>
                    {delta && (
                      <span
                        className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          background: deltaUp ? "rgba(0,132,92,0.1)" : "rgba(186,26,26,0.1)",
                          color: deltaUp ? "#00845c" : "#ba1a1a",
                        }}
                      >
                        {deltaUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {delta}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span
                      style={{
                        fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                        fontWeight: 800,
                        fontSize: 32,
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                        color: "var(--foreground)",
                      }}
                    >
                      {value}
                    </span>
                    {sub && (
                      <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                        {sub}
                      </span>
                    )}
                  </div>
                </div>
              ))}
        </section>

        {/* Pipeline by Stage — bar chart matching 01-dashboard.html */}
        <section
          className="animate-fade-up-1"
          style={{
            background: "var(--card)",
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            padding: "32px",
          }}
        >
          <div className="flex justify-between items-end mb-8">
            <div>
              <p
                className="uppercase tracking-widest font-bold mb-1"
                style={{ fontSize: 11, color: "var(--muted-foreground)" }}
              >
                Pipeline por Etapa
              </p>
              <h2
                style={{
                  fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                  fontWeight: 800,
                  fontSize: 22,
                  letterSpacing: "-0.02em",
                  color: "var(--foreground)",
                }}
              >
                Distribución de Ventas
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--red)" }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Valor Proyectado
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {pipelineStages.map((stage, i) => {
              const pct = Math.max(5, Math.round((stage.count / maxPipelineCount) * 100));
              const opacity = 0.4 + ((i + 1) / pipelineStages.length) * 0.6;
              return (
                <div key={stage.label} className="group">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-tighter mb-1.5 px-1">
                    <span style={{ color: "var(--foreground)" }}>
                      {stage.label} ({stage.count})
                    </span>
                    <span style={{ color: "var(--muted-foreground)" }}>
                      ${stage.value.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="h-3 w-full rounded-full overflow-hidden"
                    style={{ background: "var(--secondary)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all group-hover:opacity-100"
                      style={{
                        width: `${pct}%`,
                        background: `rgba(225,29,72,${opacity})`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {!loading && pipelineStages.every((s) => s.count === 0) && (
              <p className="text-center text-sm py-6" style={{ color: "var(--muted-foreground)" }}>
                Sin tratos activos aún.
              </p>
            )}
          </div>
        </section>

        {/* Bottom — Recent contacts + Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 animate-fade-up-2">

          {/* Recent contacts (60%) */}
          <div
            className="lg:col-span-6 overflow-hidden flex flex-col"
            style={{
              background: "var(--card)",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
            }}
          >
            <div
              className="p-6 flex justify-between items-center"
              style={{ borderBottom: "1px solid #E5E7EB" }}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: "var(--red)" }} />
                <h3
                  style={{
                    fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                    fontWeight: 800,
                    fontSize: 16,
                    color: "var(--foreground)",
                  }}
                >
                  Actividad Reciente
                </h3>
              </div>
              <button
                className="text-xs font-bold uppercase tracking-widest hover:underline"
                style={{ color: "var(--red)" }}
                onClick={() => window.location.href = "/dashboard/contacts"}
              >
                Ver Todo
              </button>
            </div>

            <div className="flex-1">
              {loading && (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-100 rounded w-1/2" />
                        <div className="h-3 bg-slate-100 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loading && recentContacts.length === 0 && (
                <p className="p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Sin contactos aún.
                </p>
              )}
              {recentContacts.map((c) => (
                <div
                  key={c.id}
                  className="p-6 flex gap-4 table-row-hover transition-colors"
                  style={{ borderBottom: "1px solid rgba(203,213,225,0.5)" }}
                >
                  <div className="relative">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{
                        background: "rgba(225,29,72,0.08)",
                        color: "var(--red)",
                      }}
                    >
                      {(c.first_name?.[0] ?? "?").toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm" style={{ color: "var(--foreground)" }}>
                      <span className="font-bold">{c.first_name} {c.last_name}</span>
                      {c.lead_classification && (
                        <>
                          {" "}
                          <span style={{ color: "var(--muted-foreground)" }}>calificado como</span>
                          {" "}
                          <span
                            className="font-bold"
                            style={{
                              color: c.lead_classification === "hot" ? "var(--red)"
                                : c.lead_classification === "warm" ? "var(--amber)"
                                : "var(--teal)",
                            }}
                          >
                            {CLASSIFICATION_LABELS[c.lead_classification]}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Seguimientos Pendientes (40%) */}
          <div
            className="lg:col-span-4 overflow-hidden flex flex-col"
            style={{
              background: "var(--card)",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
            }}
          >
            <div
              className="p-6 flex justify-between items-center"
              style={{ borderBottom: "1px solid #E5E7EB" }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                  fontWeight: 800,
                  fontSize: 16,
                  color: "var(--foreground)",
                }}
              >
                Seguimientos Pendientes
              </h3>
              {pendingTasks.length > 0 && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: "rgba(225,29,72,0.08)", color: "var(--red)" }}
                >
                  {pendingTasks.length} vencidas
                </span>
              )}
            </div>

            <div className="flex-1 p-2">
              {loading && (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse h-12 bg-slate-100 rounded-lg" />
                  ))}
                </div>
              )}
              {!loading && pendingTasks.length === 0 && (
                <p className="p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Sin seguimientos pendientes.
                </p>
              )}
              {pendingTasks.map((t) => {
                const contact = t.contact as { first_name?: string; last_name?: string; phone?: string } | null;
                const isOverdue = t.due_date ? new Date(t.due_date) < new Date() : false;
                const isUrgent = t.priority === "urgent" || isOverdue;
                const waPhone = contact?.phone?.replace(/\D/g, "");
                const waHref = waPhone ? `https://wa.me/${waPhone}` : undefined;

                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-lg flex items-center justify-between transition-colors hover:bg-muted/50 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Left urgency bar */}
                      <div
                        className="w-1 h-8 rounded-full shrink-0"
                        style={{ background: isUrgent ? "var(--red)" : "rgba(100,116,139,0.3)" }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: "var(--foreground)" }}>
                          {contact ? `${contact.first_name} ${contact.last_name}` : "—"}
                        </p>
                        <p className="text-[10px] font-medium truncate max-w-[140px]" style={{ color: "var(--muted-foreground)" }}>
                          {t.title}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {t.due_date && (
                        <span
                          className="text-[10px] font-bold py-1 px-2 rounded uppercase tracking-wider"
                          style={{
                            background: isUrgent ? "rgba(225,29,72,0.08)" : "rgba(100,116,139,0.08)",
                            color: isUrgent ? "var(--red)" : "var(--muted-foreground)",
                          }}
                        >
                          {isOverdue
                            ? "Vencido"
                            : new Date(t.due_date).toLocaleDateString("es-DO", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                      {/* WhatsApp button */}
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer"
                        style={{
                          background: "rgba(37,211,102,0.1)",
                          color: "#128C7E",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "#25D366";
                          (e.currentTarget as HTMLElement).style.color = "#ffffff";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "rgba(37,211,102,0.1)";
                          (e.currentTarget as HTMLElement).style.color = "#128C7E";
                        }}
                        onClick={(e) => { if (!waHref) e.preventDefault(); }}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
