"use client";

import Link from "next/link";
import { MessageCircle, ArrowUpRight } from "lucide-react";
import { T } from "../dashboard-client";

export function AvaStatusCard({ isActive, msgsToday }: { isActive: boolean; msgsToday: number }) {
  const statusColor = isActive ? T.emerald : T.surfaceDim;
  const statusLabel = isActive ? "Activa" : "Inactiva";

  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: "20px 22px",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle gold corner glow */}
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -30,
          width: 140,
          height: 140,
          background: "radial-gradient(circle, rgba(201,150,58,0.10) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: T.goldSubtle,
              border: `1px solid ${T.goldMuted}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: T.gold,
            }}
          >
            <MessageCircle size={15} />
          </div>
          <div>
            <h2
              style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "-0.01em",
                color: T.surface,
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Ava
            </h2>
            <p
              style={{
                fontSize: 10,
                color: T.surfaceDim,
                fontFamily: "Inter, sans-serif",
                margin: "2px 0 0",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Asistente WhatsApp
            </p>
          </div>
        </div>

        {/* Status pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            background: isActive ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${isActive ? "rgba(16,185,129,0.25)" : T.borderSubtle}`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusColor,
              boxShadow: isActive ? `0 0 8px ${statusColor}` : "none",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              color: statusColor,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Message count block */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, position: "relative" }}>
        <span
          style={{
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: "-0.035em",
            color: T.gold,
            lineHeight: 1,
          }}
        >
          {msgsToday}
        </span>
        <span
          style={{
            fontSize: 11,
            color: T.surfaceMuted,
            fontFamily: "Inter, sans-serif",
          }}
        >
          mensajes hoy
        </span>
      </div>

      {/* Link */}
      <Link
        href="/dashboard/conversations"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${T.borderSubtle}`,
          color: T.surfaceMuted,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "Inter, sans-serif",
          textDecoration: "none",
          transition: "all 0.15s",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = T.border;
          (e.currentTarget as HTMLAnchorElement).style.color = T.gold;
          (e.currentTarget as HTMLAnchorElement).style.background = T.goldSubtle;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = T.borderSubtle;
          (e.currentTarget as HTMLAnchorElement).style.color = T.surfaceMuted;
          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.02)";
        }}
      >
        Ver conversaciones
        <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}
