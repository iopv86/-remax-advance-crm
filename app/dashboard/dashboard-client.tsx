"use client";

import { NotificationBell } from "@/components/notification-bell";
import Link from "next/link";
import { Plus, Users, PhoneCall, BarChart2 } from "lucide-react";
import type { DashboardData } from "./page";
import { KpiCards } from "./components/kpi-cards";
import { PipelineSummary } from "./components/pipeline-summary";
import { RevenueChart } from "./components/revenue-chart";
import { ActivityFeed } from "./components/activity-feed";
import { TasksDue } from "./components/tasks-due";

// ─── Design tokens ────────────────────────────────────────────────────────────
export const T = {
  bg:                "#0D0E12",
  card:              "rgba(28,29,39,0.8)",
  cardSolid:         "#1C1D27",
  gold:              "#C9963A",
  goldLight:         "#E8B84B",
  goldMuted:         "rgba(201,150,58,0.15)",
  goldSubtle:        "rgba(201,150,58,0.08)",
  surface:           "#F5F0E8",
  surfaceMuted:      "#9A9088",
  surfaceDim:        "#6B6158",
  emerald:           "#10b981",
  rose:              "#f43f5e",
  border:            "rgba(201,150,58,0.15)",
  borderSubtle:      "rgba(255,255,255,0.06)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function greeting(name: string): string {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  return `${salutation}, ${name.split(" ")[0]}`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

const TODAY_LABEL = new Date().toLocaleDateString("es-DO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// ─── Component ────────────────────────────────────────────────────────────────
export function DashboardClient({ data }: { data: DashboardData }) {
  const { session, kpi, pipeline, revenue6m, activity, tasks } = data;
  const agentInitials = initials(session.fullName);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.surface }}>

      {/* ── Sticky header ── */}
      <header style={{
        position: "sticky",
        top: 0,
        height: 56,
        background: "rgba(13,14,18,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        zIndex: 40,
        borderBottom: `1px solid ${T.borderSubtle}`,
      }}>
        {/* Logo / wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: `linear-gradient(135deg, ${T.goldLight}, ${T.gold})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{ fontFamily: "Cinzel, serif", fontWeight: 700, fontSize: 12, color: "#1A0E00", letterSpacing: "-0.02em" }}>AE</span>
          </div>
          <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 14, color: T.surface, letterSpacing: "-0.01em" }}>
            Advance CRM
          </span>
        </div>

        {/* Right: actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <NotificationBell />
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Google Calendar"
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              background: "transparent",
              border: `1px solid transparent`,
              color: T.surfaceDim,
              cursor: "pointer",
              textDecoration: "none",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = T.goldSubtle;
              (e.currentTarget as HTMLAnchorElement).style.borderColor = T.goldMuted;
              (e.currentTarget as HTMLAnchorElement).style.color = T.gold;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "transparent";
              (e.currentTarget as HTMLAnchorElement).style.color = T.surfaceDim;
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </a>
          <div style={{ width: 1, height: 24, background: T.borderSubtle }} />
          <Link
            href="/dashboard/profile"
            title="Mi perfil"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${T.goldLight}, ${T.gold})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "Manrope, sans-serif",
              color: "#1A0E00",
              textDecoration: "none",
              boxShadow: `0 0 0 2px rgba(201,150,58,0.2)`,
              transition: "box-shadow 0.15s",
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
      </header>

      {/* ── Canvas ── */}
      <section style={{ padding: "24px 32px 56px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Hero welcome strip ── */}
        <div
          className="animate-fade-up"
          style={{
            borderRadius: 16,
            overflow: "hidden",
            position: "relative",
            background: "linear-gradient(110deg, rgba(28,29,39,0.95) 0%, rgba(22,20,14,0.98) 60%, rgba(28,24,12,0.95) 100%)",
            border: `1px solid rgba(201,150,58,0.2)`,
            boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
          }}
        >
          {/* Subtle gold glow in top-right */}
          <div style={{
            position: "absolute",
            top: -60,
            right: -40,
            width: 220,
            height: 220,
            background: "radial-gradient(circle, rgba(201,150,58,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <div style={{ position: "relative", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>

            {/* Left: Greeting */}
            <div style={{ minWidth: 0 }}>
              <p style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 800,
                fontSize: 26,
                letterSpacing: "-0.03em",
                color: T.surface,
                margin: "0 0 4px",
                lineHeight: 1.15,
              }}>
                {greeting(session.fullName)}
              </p>
              <p style={{
                fontSize: 12,
                color: T.surfaceDim,
                margin: 0,
                textTransform: "capitalize",
                fontFamily: "Inter, sans-serif",
                letterSpacing: "0.01em",
              }}>
                {TODAY_LABEL}
              </p>
            </div>

            {/* Center: Quick stats inline */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              borderRadius: 12,
              border: `1px solid rgba(201,150,58,0.15)`,
              overflow: "hidden",
              flexShrink: 0,
            }}>
              {[
                { icon: <BarChart2 size={13} />, label: "Pipeline", value: formatMoney(kpi.pipelineValue), color: T.gold },
                { icon: <Users size={13} />, label: "Contactos mes", value: String(kpi.newContactsMth), color: "#7c9fe8" },
                { icon: <PhoneCall size={13} />, label: "Seguimientos", value: String(kpi.tasksDueToday + kpi.tasksOverdue), color: kpi.tasksOverdue > 0 ? "#f43f5e" : T.emerald },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "12px 20px",
                    borderRight: i < 2 ? `1px solid rgba(201,150,58,0.1)` : "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    background: "rgba(255,255,255,0.02)",
                    minWidth: 100,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 5, color: stat.color }}>
                    {stat.icon}
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "Inter, sans-serif", color: T.surfaceDim }}>
                      {stat.label}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: "Manrope, sans-serif",
                    fontWeight: 800,
                    fontSize: 22,
                    letterSpacing: "-0.03em",
                    color: stat.color,
                    lineHeight: 1,
                  }}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Right: Quick action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <Link
                href="/dashboard/contacts?new=1"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: T.goldSubtle,
                  border: `1px solid rgba(201,150,58,0.25)`,
                  color: T.gold,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  textDecoration: "none",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = T.goldMuted;
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = `rgba(201,150,58,0.4)`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = T.goldSubtle;
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = `rgba(201,150,58,0.25)`;
                }}
              >
                <Plus size={13} />
                Nuevo contacto
              </Link>
              <Link
                href="/dashboard/pipeline"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: "transparent",
                  border: `1px solid ${T.borderSubtle}`,
                  color: T.surfaceMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  textDecoration: "none",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = T.border;
                  (e.currentTarget as HTMLAnchorElement).style.color = T.surface;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = T.borderSubtle;
                  (e.currentTarget as HTMLAnchorElement).style.color = T.surfaceMuted;
                }}
              >
                Ver pipeline
              </Link>
            </div>
          </div>
        </div>

        {/* ── Row 1: KPI cards ── */}
        <div className="animate-fade-up-1">
          <KpiCards kpi={kpi} />
        </div>

        {/* ── Row 2: Pipeline (full width) ── */}
        <div className="animate-fade-up-2">
          <PipelineSummary pipeline={pipeline} />
        </div>

        {/* ── Row 3: 3-column bento ── */}
        <div
          className="animate-fade-up-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.2fr 0.85fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          {/* Col 1: Revenue chart */}
          <RevenueChart data={revenue6m} />

          {/* Col 2: Activity feed */}
          <ActivityFeed items={activity} />

          {/* Col 3: Tasks focus */}
          <TasksDue tasks={tasks} dueToday={kpi.tasksDueToday} overdue={kpi.tasksOverdue} />
        </div>
      </section>
    </div>
  );
}
