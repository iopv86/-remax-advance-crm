"use client";

import { NotificationBell } from "@/components/notification-bell";
import Link from "next/link";
import { Plus } from "lucide-react";
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

      {/* ── Header ── */}
      <header style={{
        position: "sticky",
        top: 0,
        height: 64,
        background: "rgba(13,14,18,0.9)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        zIndex: 40,
        borderBottom: `1px solid ${T.borderSubtle}`,
      }}>
        {/* Left: greeting */}
        <div>
          <p style={{ fontFamily: "Manrope, sans-serif", fontSize: 15, fontWeight: 700, color: T.surface }}>
            {greeting(session.fullName)}
          </p>
          <p style={{ fontSize: 11, color: T.surfaceDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {TODAY_LABEL}
          </p>
        </div>

        {/* Right: actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NotificationBell />
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Google Calendar"
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              background: "transparent",
              border: `1px solid transparent`,
              color: T.surfaceDim,
              cursor: "pointer",
              textDecoration: "none",
              transition: "all 0.15s",
              fontSize: 16,
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </a>
          <div style={{ width: 1, height: 28, background: T.borderSubtle }} />
          <Link
            href="/dashboard/profile"
            title="Mi perfil"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${T.goldLight}, ${T.gold})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
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
      <section style={{ padding: "28px 32px 48px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Row 1 — KPI cards (4 across) */}
        <div className="animate-fade-up">
          <KpiCards kpi={kpi} />
        </div>

        {/* Row 2 — Pipeline bar (full width) */}
        <div className="animate-fade-up-1">
          <PipelineSummary pipeline={pipeline} />
        </div>

        {/* Row 3 — Bento: Revenue chart (left) + Activity + Tasks (right) */}
        <div
          className="animate-fade-up-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Left column: Revenue chart + Tasks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <RevenueChart data={revenue6m} />
            <TasksDue tasks={tasks} dueToday={kpi.tasksDueToday} overdue={kpi.tasksOverdue} />
          </div>

          {/* Right column: Activity feed */}
          <ActivityFeed items={activity} />
        </div>
      </section>

      {/* ── Floating action button ── */}
      <button
        style={{
          position: "fixed",
          bottom: 32,
          right: 32,
          width: 52,
          height: 52,
          background: `linear-gradient(135deg, ${T.goldLight}, ${T.gold})`,
          color: "#1A0E00",
          borderRadius: "50%",
          border: "none",
          boxShadow: `0 8px 24px rgba(201,150,58,0.35)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 60,
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 32px rgba(201,150,58,0.5)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 24px rgba(201,150,58,0.35)";
        }}
        onClick={() => window.location.href = "/dashboard/pipeline"}
        title="Nuevo deal"
      >
        <Plus size={20} />
      </button>
    </div>
  );
}
