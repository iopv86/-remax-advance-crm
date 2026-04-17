"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  new_whatsapp:  "💬",
  deal_assigned: "🏷️",
  deal_stalled:  "⏰",
  deal_won:      "🏆",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationBell() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [marking, setMarking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Get userId + initial unread count
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("read", false)
        .then(({ count }) => setUnread(count ?? 0));
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Realtime subscription for unread count
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setUnread((n) => n + 1);
          if (open) loadNotifications();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, open]);

  const loadNotifications = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, read, link, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setNotifications((data ?? []) as Notification[]);
    setLoaded(true);
  }, []);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!loaded) await loadNotifications();
  }

  async function markRead(n: Notification) {
    if (!n.read) {
      const supabase = createClient();
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    if (!userId) return;
    setMarking(true);
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    setMarking(false);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        style={{
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          background: open ? "rgba(201,150,58,0.12)" : "transparent",
          border: "none",
          color: open ? "#C9963A" : "#a8a29e",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.15s, color 0.15s",
        }}
        title="Notificaciones"
      >
        <Bell style={{ width: 18, height: 18 }} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: "#ef4444",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
              border: "1.5px solid var(--background, #0D0E14)",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            background: "#161618",
            border: "1px solid rgba(201,150,58,0.15)",
            borderRadius: 8,
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            zIndex: 9999,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#a8a29e",
              }}
            >
              Notificaciones
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                disabled={marking}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "#C9963A",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  opacity: marking ? 0.5 : 1,
                }}
              >
                <CheckCheck style={{ width: 12, height: 12 }} />
                Marcar todas
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {!loaded ? (
              <p style={{ textAlign: "center", padding: 24, color: "#a8a29e", fontSize: 12 }}>
                Cargando…
              </p>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 16px" }}>
                <Bell style={{ width: 28, height: 28, margin: "0 auto 8px", color: "#3f3f46", display: "block" }} />
                <p style={{ fontSize: 12, color: "#a8a29e" }}>Sin notificaciones</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 16px",
                    background: n.read ? "transparent" : "rgba(201,150,58,0.04)",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = n.read
                      ? "transparent"
                      : "rgba(201,150,58,0.04)";
                  }}
                >
                  {/* Icon */}
                  <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                    {TYPE_ICONS[n.type] ?? "🔔"}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: n.read ? 500 : 700,
                          color: n.read ? "#a8a29e" : "#e5e0d8",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.title}
                      </p>
                      <span style={{ fontSize: 10, color: "#71717a", flexShrink: 0 }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "#71717a",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.body}
                      </p>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#C9963A",
                        flexShrink: 0,
                        marginTop: 5,
                      }}
                    />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div
              style={{
                padding: "8px 16px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                textAlign: "center",
              }}
            >
              <button
                onClick={() => { setOpen(false); router.push("/dashboard/notifications"); }}
                style={{
                  fontSize: 11,
                  color: "#C9963A",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Ver todas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
