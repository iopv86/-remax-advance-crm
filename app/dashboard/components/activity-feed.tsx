"use client";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { ActivityItem } from "../page";
import { T } from "../dashboard-client";

const SOURCE_LABELS: Record<string, string> = {
  ctwa_ad:     "Meta Ads",
  lead_form:   "Lead Form",
  referral:    "Referido",
  walk_in:     "Visita directa",
  website:     "Website",
  social_media:"Redes sociales",
  other:       "Otro",
};

const STAGE_COLORS: Record<string, string> = {
  closed_won:  "#22c55e",
  closed_lost: "#f43f5e",
  negotiation: "#C9963A",
  offer_made:  "#d4a443",
};

function ItemIcon({ type, stage }: { type: "contact" | "deal"; stage?: string }) {
  if (type === "contact") {
    return (
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "rgba(124,159,232,0.12)",
        border: "1px solid rgba(124,159,232,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c9fe8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
    );
  }

  const stageColor = (stage && STAGE_COLORS[stage]) ? STAGE_COLORS[stage] : T.gold;
  return (
    <div style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      background: `${stageColor}18`,
      border: `1px solid ${stageColor}30`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stageColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </div>
  );
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "18px 24px 14px",
        borderBottom: `1px solid ${T.borderSubtle}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <h2 style={{
          fontFamily: "Manrope, sans-serif",
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: "-0.01em",
          color: T.surface,
          margin: 0,
        }}>
          Actividad reciente
        </h2>
        <span style={{ fontSize: 10, color: T.surfaceDim, fontFamily: "Inter, sans-serif" }}>
          Últimos 10 eventos
        </span>
      </div>

      {/* List */}
      <div>
        {items.length === 0 && (
          <div style={{ padding: "32px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: T.surfaceDim, fontFamily: "Inter, sans-serif" }}>
              Sin actividad reciente.
            </p>
          </div>
        )}

        {items.map((item, idx) => {
          const elapsed = item.ts
            ? formatDistanceToNow(new Date(item.ts), { addSuffix: false, locale: es })
            : "—";

          return (
            <div
              key={item.id}
              className="table-row-hover"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 24px",
                borderBottom: idx < items.length - 1 ? `1px solid ${T.borderSubtle}` : "none",
                transition: "background 0.15s",
              }}
            >
              <ItemIcon type={item.type} stage={item.stage} />

              {/* Name + action */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: T.surface,
                  margin: "0 0 2px",
                  fontFamily: "Inter, sans-serif",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {item.name}
                </p>
                <p style={{
                  fontSize: 11,
                  color: T.surfaceDim,
                  margin: 0,
                  fontFamily: "Inter, sans-serif",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {item.action}
                  {item.source ? ` · ${SOURCE_LABELS[item.source] ?? item.source}` : ""}
                </p>
              </div>

              {/* Time */}
              <span style={{
                fontSize: 10,
                color: T.surfaceDim,
                fontFamily: "Inter, sans-serif",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}>
                {elapsed}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
