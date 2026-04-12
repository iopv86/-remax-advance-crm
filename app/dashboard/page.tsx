"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLASSIFICATION_LABELS } from "@/lib/types";
import type { Contact, Task } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Users,
  TrendingUp,
  Flame,
  DollarSign,
  CheckSquare,
  ArrowUpRight,
  Clock,
  Activity,
  BarChart3,
  Sparkles,
} from "lucide-react";

interface KPI {
  label: string;
  value: string | number;
  icon: React.ElementType;
  delta?: string;
  accent: string;
  accentMuted: string;
  bar: number;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [recentContacts, setRecentContacts] = useState<Contact[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const today = now.toISOString().split("T")[0];

      const [
        { count: totalContacts },
        { count: newLeadsWeek },
        { count: hotLeads },
        { data: contacts },
        { data: tasks },
        { data: deals },
      ] = await Promise.all([
        supabase.from("contacts").select("*", { count: "exact", head: true }),
        supabase.from("contacts").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("contacts").select("*", { count: "exact", head: true }).eq("lead_classification", "hot"),
        supabase
          .from("contacts")
          .select("id, first_name, last_name, lead_classification, lead_status, source, created_at")
          .order("created_at", { ascending: false })
          .limit(7),
        supabase
          .from("tasks")
          .select("id, title, due_date, priority, status, contact:contacts(first_name, last_name)")
          .eq("status", "pending")
          .lte("due_date", today)
          .order("due_date", { ascending: true })
          .limit(5),
        supabase.from("deals").select("deal_value, currency, stage").not("stage", "in", '("closed_lost")'),
      ]);

      const pipelineValue = (deals ?? []).reduce((sum: number, d: { deal_value?: number }) => sum + (d.deal_value ?? 0), 0);
      const total = totalContacts ?? 0;

      setKpis([
        {
          label: "Total contactos",
          value: total,
          icon: Users,
          accent: "#2563eb",
          accentMuted: "rgba(37,99,235,0.09)",
          bar: Math.min(100, Math.round((total / Math.max(total, 50)) * 100)),
        },
        {
          label: "Leads esta semana",
          value: newLeadsWeek ?? 0,
          icon: TrendingUp,
          delta: "+nueva entrada",
          accent: "#10b981",
          accentMuted: "rgba(16,185,129,0.09)",
          bar: Math.min(100, Math.round(((newLeadsWeek ?? 0) / Math.max(total || 1, 1)) * 100 * 10)),
        },
        {
          label: "Leads HOT",
          value: hotLeads ?? 0,
          icon: Flame,
          accent: "#d97706",
          accentMuted: "rgba(217,119,6,0.09)",
          bar: Math.min(100, Math.round(((hotLeads ?? 0) / Math.max(total || 1, 1)) * 100 * 3)),
        },
        {
          label: "Pipeline activo",
          value: "$" + pipelineValue.toLocaleString(),
          icon: DollarSign,
          accent: "#7c3aed",
          accentMuted: "rgba(124,58,237,0.09)",
          bar: pipelineValue > 0 ? 72 : 0,
        },
      ]);

      setRecentContacts((contacts ?? []) as unknown as Contact[]);
      setPendingTasks((tasks ?? []) as unknown as Task[]);
      setLoading(false);
    }
    load();
  }, []);

  const chartBars = [
    { label: "Ene", h: 40, color: "#2563eb" },
    { label: "Feb", h: 65, color: "#2563eb" },
    { label: "Mar", h: 52, color: "#2563eb" },
    { label: "Abr", h: 80, color: "#e11d48" },
    { label: "May", h: 70, color: "#2563eb" },
    { label: "Jun", h: 88, color: "#2563eb" },
    { label: "Jul", h: 60, color: "#2563eb" },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--background)" }}>
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Resumen operativo
            </p>
            <h1
              style={{
                fontFamily: "var(--font-playfair),Georgia,serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                lineHeight: 1.1,
              }}
            >
              Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-rose-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-rose-700 shadow-sm backdrop-blur">
            <Activity className="h-3.5 w-3.5" />
            En vivo
          </div>
        </div>
      </div>

      <div className="p-6 xl:p-8 space-y-6 max-w-[1200px]">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-glow p-5 animate-pulse h-[140px]" />
              ))
            : kpis.map(({ label, value, icon: Icon, delta, accent, accentMuted, bar }, i) => (
                <div
                  key={label}
                  className={`card-glow p-5 animate-fade-up-${i + 1}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-[12px]"
                      style={{ background: accentMuted }}
                    >
                      <Icon className="h-4 w-4" style={{ color: accent }} />
                    </div>
                    {delta && (
                      <span className="delta-up flex items-center gap-0.5">
                        <ArrowUpRight className="h-3 w-3" />
                        nueva
                      </span>
                    )}
                  </div>

                  <div
                    className="stat-number mb-0.5"
                    style={{ fontSize: 36, color: "#0f172a" }}
                  >
                    {value}
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{label}</p>

                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${bar}%`, background: accent }}
                    />
                  </div>
                </div>
              ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-up-3">
          {/* Bar chart */}
          <div className="card-glow p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400 mb-1">
                  Rendimiento
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-playfair),Georgia,serif",
                    fontWeight: 700,
                    fontSize: 20,
                    color: "#0f172a",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Rendimiento comercial
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
                2026
              </div>
            </div>

            {/* Chart */}
            <div className="flex items-end justify-between gap-2 h-[110px] px-1">
              {chartBars.map((bar) => (
                <div key={bar.label} className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-full flex items-end justify-center" style={{ height: 90 }}>
                    <div
                      className="w-full rounded-t-lg transition-all duration-500"
                      style={{
                        height: `${bar.h}%`,
                        background:
                          bar.color === "#e11d48"
                            ? "linear-gradient(180deg,#e11d48,#be123c)"
                            : "linear-gradient(180deg,#dbeafe,#bfdbfe)",
                        border: bar.color === "#e11d48" ? "none" : "1px solid rgba(37,99,235,0.15)",
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400">{bar.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ava IA insight card */}
          <div
            className="card-glow p-5 flex flex-col justify-between"
            style={{
              background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)",
              border: "none",
            }}
          >
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-rose-500/20">
                  <Sparkles className="h-4 w-4 text-rose-400" />
                </div>
                <span className="text-sm font-semibold text-white/90">Ava IA</span>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-playfair),Georgia,serif",
                  fontWeight: 600,
                  fontSize: 22,
                  color: "#ffffff",
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                }}
              >
                3 leads prioritarios hoy
              </p>
              <p className="mt-2 text-sm leading-5 text-white/50">
                Ava identificó oportunidades de seguimiento urgente en el pipeline.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { label: "WhatsApp", value: "12 msg", color: "#10b981" },
                { label: "Conversión", value: "28%", color: "#2563eb" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div className="text-[11px] text-white/40 mb-0.5">{s.label}</div>
                  <div
                    style={{
                      fontFamily: "var(--font-playfair),Georgia,serif",
                      fontWeight: 700,
                      fontSize: 18,
                      color: s.color,
                    }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent contacts + Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-up-4">
          {/* Recent contacts */}
          <div className="card-glow overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid rgba(203,213,225,0.8)" }}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-rose-500" />
                <span className="text-sm font-semibold text-slate-800">Leads recientes</span>
              </div>
              <span className="text-xs text-slate-400">
                {recentContacts.length} mostrados
              </span>
            </div>

            <div>
              {loading && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">Cargando…</div>
              )}
              {!loading && recentContacts.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-400">Sin contactos aún.</p>
              )}
              {recentContacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-5 py-3 table-row-hover transition-colors"
                  style={{ borderBottom: "1px solid rgba(203,213,225,0.5)" }}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar with rose ring */}
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-rose-700"
                      style={{
                        background: "rgba(225,29,72,0.08)",
                        outline: "2px solid rgba(225,29,72,0.18)",
                        outlineOffset: "1px",
                      }}
                    >
                      {(c.first_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                  </div>
                  {c.lead_classification && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${
                        c.lead_classification === "hot" ? "badge-hot" :
                        c.lead_classification === "warm" ? "badge-warm" :
                        c.lead_classification === "cold" ? "badge-cold" : "badge-unqualified"
                      }`}
                    >
                      {CLASSIFICATION_LABELS[c.lead_classification]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pending tasks */}
          <div className="card-glow overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid rgba(203,213,225,0.8)" }}
            >
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-rose-500" />
                <span className="text-sm font-semibold text-slate-800">Tareas pendientes</span>
              </div>
              <span className="text-xs text-slate-400">
                {pendingTasks.length} vencidas
              </span>
            </div>

            <div>
              {loading && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">Cargando…</div>
              )}
              {!loading && pendingTasks.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-400">Sin tareas pendientes.</p>
              )}
              {pendingTasks.map((t) => {
                const contact = t.contact as { first_name?: string; last_name?: string } | null;
                const isUrgent = t.priority === "urgent";
                const isHigh = t.priority === "high";
                const iconColor = isUrgent ? "#e11d48" : isHigh ? "#d97706" : "#64748b";
                const iconBg = isUrgent
                  ? "linear-gradient(135deg,#f97316,#e11d48)"
                  : isHigh
                  ? "linear-gradient(135deg,#fbbf24,#d97706)"
                  : "linear-gradient(135deg,#94a3b8,#64748b)";

                return (
                  <div
                    key={t.id}
                    className="flex items-start justify-between px-5 py-3 table-row-hover transition-colors"
                    style={{ borderBottom: "1px solid rgba(203,213,225,0.5)" }}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
                        style={{ background: iconBg }}
                      >
                        <Clock className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                        {contact && (
                          <p className="text-xs text-slate-400">
                            {contact.first_name} {contact.last_name}
                          </p>
                        )}
                      </div>
                    </div>
                    {t.due_date && (
                      <span
                        className="ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: "rgba(225,29,72,0.08)", color: iconColor }}
                      >
                        {new Date(t.due_date).toLocaleDateString("es-DO", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    )}
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
