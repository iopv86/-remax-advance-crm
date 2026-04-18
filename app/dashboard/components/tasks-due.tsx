"use client";

import { MessageCircle } from "lucide-react";
import type { TaskItem } from "../page";
import { T } from "../dashboard-client";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("es-DO", { day: "2-digit", month: "short" });
}

export function TasksDue({
  tasks,
  dueToday,
  overdue,
}: {
  tasks: TaskItem[];
  dueToday: number;
  overdue: number;
}) {
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
        padding: "18px 24px 12px",
        borderBottom: `1px solid rgba(255,255,255,0.05)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <h2 style={{
          fontFamily: "Manrope, sans-serif",
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: "-0.01em",
          color: T.surface,
          margin: 0,
        }}>
          Seguimientos pendientes
        </h2>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {overdue > 0 && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "Inter, sans-serif",
              padding: "3px 8px",
              borderRadius: 99,
              background: "rgba(244,63,94,0.15)",
              color: "#f43f5e",
              border: "1px solid rgba(244,63,94,0.25)",
            }}>
              {overdue} vencido{overdue !== 1 ? "s" : ""}
            </span>
          )}
          {dueToday > 0 && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "Inter, sans-serif",
              padding: "3px 8px",
              borderRadius: 99,
              background: "rgba(201,150,58,0.15)",
              color: T.gold,
              border: `1px solid rgba(201,150,58,0.25)`,
            }}>
              {dueToday} hoy
            </span>
          )}
        </div>
      </div>

      {/* Task list */}
      <div style={{ padding: "8px 0" }}>
        {tasks.length === 0 && (
          <div style={{ padding: "20px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: T.surfaceDim, fontFamily: "Inter, sans-serif" }}>
              Sin seguimientos pendientes.
            </p>
          </div>
        )}

        {tasks.map((t) => {
          const waPhone = t.contactPhone?.replace(/\D/g, "");
          const waHref  = waPhone ? `https://wa.me/${waPhone}` : null;

          return (
            <div
              key={t.id}
              className="table-row-hover"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 20px",
                transition: "background 0.15s",
              }}
            >
              {/* Priority dot */}
              <div style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                flexShrink: 0,
                background: t.overdue
                  ? "#f43f5e"
                  : t.priority === "urgent" || t.priority === "high"
                  ? T.gold
                  : T.surfaceDim,
              }} />

              {/* Contact avatar */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: t.overdue
                  ? "rgba(244,63,94,0.12)"
                  : "rgba(201,150,58,0.12)",
                border: `1px solid ${t.overdue ? "rgba(244,63,94,0.2)" : "rgba(201,150,58,0.2)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "Manrope, sans-serif",
                color: t.overdue ? "#f43f5e" : T.gold,
                flexShrink: 0,
              }}>
                {(t.contactName?.[0] ?? "?").toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: T.surface,
                  margin: "0 0 1px",
                  fontFamily: "Inter, sans-serif",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {t.contactName ?? "Sin contacto"}
                </p>
                <p style={{
                  fontSize: 10,
                  color: t.overdue ? "#f43f5e" : T.surfaceDim,
                  margin: 0,
                  fontFamily: "Inter, sans-serif",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {t.overdue
                    ? `Vencido${t.dueDate ? ` · ${formatDate(t.dueDate)}` : ""}`
                    : t.dueDate
                    ? `Hoy · ${t.title}`
                    : t.title
                  }
                </p>
              </div>

              {/* WhatsApp button */}
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(37,211,102,0.08)",
                    color: "#128C7E",
                    flexShrink: 0,
                    textDecoration: "none",
                    transition: "all 0.15s",
                    border: "1px solid rgba(37,211,102,0.15)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "#25D366";
                    (e.currentTarget as HTMLAnchorElement).style.color = "#fff";
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "#25D366";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "rgba(37,211,102,0.08)";
                    (e.currentTarget as HTMLAnchorElement).style.color = "#128C7E";
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(37,211,102,0.15)";
                  }}
                  title={`WhatsApp a ${t.contactName ?? ""}`}
                >
                  <MessageCircle size={12} />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
