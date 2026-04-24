"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { NotificationRow } from "./page";

// ─── Design tokens ─────────────────────────────────────────────────────────────

const GOLD = "var(--primary)";
const BG_BODY = "var(--background)";
const BG_CARD = "var(--card)";
const BG_ELEVATED = "var(--secondary)";
const BG_SURFACE = "var(--card)";
const TEXT_PRIMARY = "var(--foreground)";
const TEXT_MUTED = "var(--muted-foreground)";
const TEXT_DIM = "var(--muted-foreground)";
const BORDER_GOLD = "rgba(201,150,58,0.15)";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  new_whatsapp:  "💬",
  deal_assigned: "🏷️",
  deal_stalled:  "⏰",
  deal_won:      "🏆",
};

const TYPE_LABELS: Record<string, string> = {
  new_whatsapp:  "WhatsApp",
  deal_assigned: "Deal asignado",
  deal_stalled:  "Deal estancado",
  deal_won:      "Deal ganado",
};

type FilterValue = "all" | "unread" | "new_whatsapp" | "deal_assigned" | "deal_stalled" | "deal_won";

const FILTER_TABS: { value: FilterValue; label: string }[] = [
  { value: "all",           label: "Todas" },
  { value: "unread",        label: "No leídas" },
  { value: "new_whatsapp",  label: "💬 WhatsApp" },
  { value: "deal_assigned", label: "🏷️ Asignados" },
  { value: "deal_stalled",  label: "⏰ Estancados" },
  { value: "deal_won",      label: "🏆 Ganados" },
];

const PAGE_SIZE = 30;

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "ahora";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "ayer";
  if (days < 7)   return `${days}d`;
  const date = new Date(iso);
  return date.toLocaleDateString("es-DO", { day: "numeric", month: "short" });
}

function groupByDate(notifications: NotificationRow[]): { label: string; items: NotificationRow[] }[] {
  const groups: Map<string, NotificationRow[]> = new Map();
  for (const n of notifications) {
    const d = new Date(n.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let label: string;
    if (d.toDateString() === today.toDateString()) {
      label = "Hoy";
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = "Ayer";
    } else {
      label = d.toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long" });
      label = label.charAt(0).toUpperCase() + label.slice(1);
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(n);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialNotifications: NotificationRow[];
  initialUnread: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationsClient({ initialNotifications, initialUnread }: Props) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[]>(initialNotifications);
  const [unread, setUnread] = useState(initialUnread);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [marking, setMarking] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialNotifications.length === PAGE_SIZE);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Real-time subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    let userId: string | null = null;

    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
      setCurrentUserId(userId);
      if (!userId) return;

      const channel = supabase
        .channel("notifications-page")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const newNotif = payload.new as NotificationRow;
            setNotifications((prev) => [newNotif, ...prev]);
            setUnread((n) => n + 1);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    });
  }, []);

  // ── Infinite scroll ─────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !currentUserId) return;
    const oldest = notifications[notifications.length - 1];
    if (!oldest) return;

    setLoadingMore(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, title, body, read, link, created_at")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false })
      .lt("created_at", oldest.created_at)
      .limit(PAGE_SIZE);

    if (error) {
      toast.error("Error cargando más notificaciones");
      setLoadingMore(false);
      return;
    }

    const rows = (data ?? []) as NotificationRow[];
    setNotifications((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [loadingMore, hasMore, notifications, currentUserId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // ── Filter logic ────────────────────────────────────────────────────────────
  const filtered =
    filter === "all"
      ? notifications
      : filter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications.filter((n) => n.type === filter);

  const groups = groupByDate(filtered);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function markRead(n: NotificationRow) {
    if (n.read) {
      if (n.link) router.push(n.link);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", n.id);
    if (error) {
      toast.error("Error al marcar como leída");
      return;
    }
    setNotifications((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
    );
    setUnread((c) => Math.max(0, c - 1));
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    if (unread === 0 || !currentUserId) return;
    setMarking(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", currentUserId)
      .eq("read", false);
    if (error) {
      toast.error("Error al marcar todas como leídas");
      setMarking(false);
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    setMarking(false);
    toast.success("Todas las notificaciones marcadas como leídas");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG_BODY,
        color: TEXT_PRIMARY,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(13,14,18,0.85)",
          backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${BG_SURFACE}`,
          padding: "20px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1
            style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 800,
              fontSize: 28,
              letterSpacing: "-0.02em",
              color: TEXT_PRIMARY,
              margin: 0,
            }}
          >
            Notificaciones
          </h1>
          {unread > 0 && (
            <span
              style={{
                background: "#ef4444",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 9999,
                lineHeight: 1.6,
              }}
            >
              {unread} nueva{unread !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {unread > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              color: GOLD,
              background: "none",
              border: `1px solid ${BORDER_GOLD}`,
              borderRadius: 6,
              padding: "7px 14px",
              cursor: marking ? "not-allowed" : "pointer",
              opacity: marking ? 0.6 : 1,
              transition: "background 0.15s",
              letterSpacing: "0.04em",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,150,58,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "none";
            }}
          >
            <CheckCheck style={{ width: 13, height: 13 }} />
            {marking ? "Marcando…" : "Marcar todas como leídas"}
          </button>
        )}
      </header>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Filter tabs — horizontally scrollable */}
        <div
          style={{
            display: "flex",
            gap: 4,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
            scrollbarWidth: "none" as React.CSSProperties["scrollbarWidth"],
            marginBottom: 32,
            paddingBottom: 2,
          }}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = filter === tab.value;
            const count = tab.value === "unread" && unread > 0 ? ` (${unread})` : "";
            return (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  border: isActive ? "none" : `1px solid ${BORDER_GOLD}`,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: isActive ? GOLD : BG_ELEVATED,
                  color: isActive ? "var(--primary-foreground)" : TEXT_MUTED,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {tab.label}{count}
              </button>
            );
          })}
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 0",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: BG_ELEVATED,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bell style={{ width: 28, height: 28, color: TEXT_DIM }} />
            </div>
            <p style={{ fontSize: 14, color: TEXT_MUTED, margin: 0 }}>
              {filter === "unread" ? "Sin notificaciones sin leer" : "Sin notificaciones"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {groups.map(({ label, items }) => (
              <section key={label}>
                {/* Group header */}
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: TEXT_DIM,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 12,
                    fontFamily: "Manrope, sans-serif",
                  }}
                >
                  {label}
                </p>

                {/* Notification cards */}
                <div
                  style={{
                    background: BG_CARD,
                    backdropFilter: "blur(12px)",
                    border: `1px solid ${BORDER_GOLD}`,
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {items.map((n, idx) => (
                    <button
                      key={n.id}
                      onClick={() => markRead(n)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 14,
                        padding: "16px 20px",
                        background: n.read ? "transparent" : "rgba(201,150,58,0.04)",
                        border: "none",
                        borderBottom:
                          idx < items.length - 1
                            ? "1px solid rgba(255,255,255,0.04)"
                            : "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "rgba(255,255,255,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = n.read
                          ? "transparent"
                          : "rgba(201,150,58,0.04)";
                      }}
                    >
                      {/* Icon bubble */}
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          background: BG_ELEVATED,
                          border: `1px solid ${BORDER_GOLD}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 16,
                          lineHeight: 1,
                          marginTop: 1,
                        }}
                      >
                        {TYPE_ICONS[n.type] ?? "🔔"}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 600,
                                color: GOLD,
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                display: "block",
                                marginBottom: 3,
                                fontFamily: "Manrope, sans-serif",
                              }}
                            >
                              {TYPE_LABELS[n.type] ?? n.type}
                            </span>
                            <p
                              style={{
                                fontSize: 13,
                                fontWeight: n.read ? 500 : 700,
                                color: n.read ? TEXT_MUTED : TEXT_PRIMARY,
                                margin: 0,
                                lineHeight: 1.4,
                              }}
                            >
                              {n.title}
                            </p>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          >
                            <span style={{ fontSize: 11, color: TEXT_DIM, whiteSpace: "nowrap" }}>
                              {timeAgo(n.created_at)}
                            </span>
                            {!n.read && (
                              <div
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: GOLD,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </div>
                        </div>

                        {n.body && (
                          <p
                            style={{
                              fontSize: 12,
                              color: TEXT_DIM,
                              margin: 0,
                              lineHeight: 1.5,
                            }}
                          >
                            {n.body}
                          </p>
                        )}

                        {n.link && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              marginTop: 8,
                              color: GOLD,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            <ExternalLink style={{ width: 10, height: 10 }} />
                            Ver detalle
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} style={{ height: 1 }} />

            {/* Loading more indicator */}
            {loadingMore && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "16px 0",
                  color: TEXT_DIM,
                }}
              >
                <Loader2
                  style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }}
                />
              </div>
            )}

            {/* End of list */}
            {!hasMore && notifications.length >= PAGE_SIZE && (
              <p
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  color: TEXT_DIM,
                  letterSpacing: "0.05em",
                }}
              >
                — fin —
              </p>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
