"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Phone, MessageSquare, Mail, Users, Home, FileText, CheckSquare, Plus, X
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityType =
  | "call" | "whatsapp_message" | "email"
  | "meeting" | "showing" | "note" | "task_completed";

export interface ContactActivity {
  id: string;
  contact_id: string;
  deal_id?: string | null;
  agent_id?: string | null;
  activity_type: ActivityType;
  title?: string | null;
  description?: string | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  duration_minutes?: number | null;
  is_automated: boolean;
  created_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  call:              { label: "Llamada",    icon: <Phone size={13} />,          color: "#2563eb", bg: "rgba(37,99,235,0.1)" },
  whatsapp_message:  { label: "WhatsApp",   icon: <MessageSquare size={13} />,  color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  email:             { label: "Email",      icon: <Mail size={13} />,            color: "#7c3aed", bg: "rgba(124,58,237,0.1)" },
  meeting:           { label: "Reunión",    icon: <Users size={13} />,           color: "#C9963A", bg: "rgba(201,150,58,0.1)" },
  showing:           { label: "Visita",     icon: <Home size={13} />,            color: "#0d9488", bg: "rgba(13,148,136,0.1)" },
  note:              { label: "Nota",       icon: <FileText size={13} />,        color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  task_completed:    { label: "Tarea",      icon: <CheckSquare size={13} />,     color: "#059669", bg: "rgba(5,150,105,0.1)" },
};

const LOGGABLE: ActivityType[] = ["call", "whatsapp_message", "email", "meeting", "note"];

const GOLD = "var(--primary)";
const BG_ELEVATED = "var(--secondary)";
const TEXT_PRIMARY = "var(--foreground)";
const TEXT_MUTED = "var(--muted-foreground)";
const BORDER_DIM = "rgba(255,255,255,0.06)";

// ─── Component ────────────────────────────────────────────────────────────────

export function ContactActivity({
  contactId,
  agentId,
  initialActivities,
}: {
  contactId: string;
  agentId: string;
  initialActivities: ContactActivity[];
}) {
  const [activities, setActivities] = useState<ContactActivity[]>(initialActivities);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    activity_type: "call" as ActivityType,
    title: "",
    description: "",
    duration_minutes: "",
  });

  function resetForm() {
    setForm({ activity_type: "call", title: "", description: "", duration_minutes: "" });
    setShowForm(false);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("El título es requerido");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("activities")
      .insert({
        contact_id: contactId,
        agent_id: agentId,
        activity_type: form.activity_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        completed_at: new Date().toISOString(),
        is_automated: false,
      })
      .select("id, contact_id, deal_id, agent_id, activity_type, title, description, scheduled_at, completed_at, duration_minutes, is_automated, created_at")
      .single();

    if (error || !data) {
      toast.error("Error al guardar: " + (error?.message ?? "desconocido"));
      setSaving(false);
      return;
    }

    setActivities((prev) => [data as ContactActivity, ...prev]);
    toast.success("Actividad registrada");
    setSaving(false);
    resetForm();
  }

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: TEXT_MUTED, textTransform: "uppercase", margin: 0 }}>
          Actividad · {activities.length}
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: showForm ? "rgba(239,68,68,0.1)" : "rgba(201,150,58,0.12)",
            color: showForm ? "#ef4444" : GOLD,
            border: showForm ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(201,150,58,0.25)",
          }}
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? "Cancelar" : "Registrar"}
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div
          style={{
            background: BG_ELEVATED, border: `1px solid ${BORDER_DIM}`,
            borderRadius: 12, padding: 20, marginBottom: 20,
          }}
        >
          {/* Type pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {LOGGABLE.map((t) => {
              const cfg = ACTIVITY_CONFIG[t];
              const active = form.activity_type === t;
              return (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, activity_type: t }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: active ? cfg.bg : "transparent",
                    color: active ? cfg.color : TEXT_MUTED,
                    border: active ? `1px solid ${cfg.color}40` : `1px solid ${BORDER_DIM}`,
                  }}
                >
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Title */}
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título (ej. Llamada de seguimiento)"
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER_DIM}`,
              color: TEXT_PRIMARY, outline: "none", boxSizing: "border-box", marginBottom: 10,
            }}
          />

          {/* Description */}
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Notas adicionales (opcional)"
            rows={2}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13, resize: "none",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER_DIM}`,
              color: TEXT_PRIMARY, outline: "none", boxSizing: "border-box", marginBottom: 10,
            }}
          />

          {/* Duration + save */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min={1}
              value={form.duration_minutes}
              onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
              placeholder="Duración (min)"
              style={{
                width: 140, padding: "7px 12px", borderRadius: 8, fontSize: 12,
                background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER_DIM}`,
                color: TEXT_PRIMARY, outline: "none",
              }}
            />
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer",
                background: GOLD, color: "#0D0E12", border: "none", opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {activities.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: TEXT_MUTED }}>
          <FileText style={{ width: 36, height: 36, margin: "0 auto 10px", opacity: 0.2 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Sin actividad registrada.</p>
          <p style={{ fontSize: 11, margin: "4px 0 0", opacity: 0.6 }}>Usa "Registrar" para añadir llamadas, emails, reuniones…</p>
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 20 }}>
          {/* Vertical line */}
          <div style={{
            position: "absolute", left: 7, top: 8, bottom: 8,
            width: 1, background: BORDER_DIM,
          }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {activities.map((act, idx) => {
              const cfg = ACTIVITY_CONFIG[act.activity_type] ?? ACTIVITY_CONFIG.note;
              const date = act.completed_at ?? act.created_at;
              return (
                <div key={act.id} style={{ position: "relative", paddingBottom: idx < activities.length - 1 ? 20 : 0 }}>
                  {/* Dot */}
                  <div style={{
                    position: "absolute", left: -13, top: 14,
                    width: 14, height: 14, borderRadius: "50%",
                    background: cfg.bg, border: `1.5px solid ${cfg.color}60`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: cfg.color,
                  }}>
                    <span style={{ fontSize: 8, lineHeight: 1 }}>{cfg.icon}</span>
                  </div>

                  {/* Card */}
                  <div style={{
                    background: BG_ELEVATED, border: `1px solid ${BORDER_DIM}`,
                    borderRadius: 10, padding: "10px 14px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                            background: cfg.bg, color: cfg.color,
                          }}>
                            {cfg.icon} {cfg.label}
                          </span>
                          {act.is_automated && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: TEXT_MUTED, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.04)" }}>
                              Auto
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {act.title ?? cfg.label}
                        </p>
                        {act.description && (
                          <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "3px 0 0", lineHeight: 1.4 }}>
                            {act.description}
                          </p>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontSize: 10, color: TEXT_MUTED, margin: 0 }} suppressHydrationWarning>
                          {formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })}
                        </p>
                        {act.duration_minutes && (
                          <p style={{ fontSize: 10, color: TEXT_MUTED, margin: "2px 0 0" }}>
                            {act.duration_minutes} min
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
