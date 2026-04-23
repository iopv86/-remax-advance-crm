"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Phone, MessageSquare, Mail, Users, Home, FileText, CheckSquare, Plus, X,
} from "lucide-react";

export type ActivityType =
  | "call" | "whatsapp_message" | "email"
  | "meeting" | "showing" | "note" | "task_completed";

export interface DealActivity {
  id: string;
  contact_id?: string | null;
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

const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  call:             { label: "Llamada",  icon: <Phone size={12} />,         color: "#2563eb", bg: "rgba(37,99,235,0.1)" },
  whatsapp_message: { label: "WhatsApp", icon: <MessageSquare size={12} />, color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  email:            { label: "Email",    icon: <Mail size={12} />,           color: "#7c3aed", bg: "rgba(124,58,237,0.1)" },
  meeting:          { label: "Reunión",  icon: <Users size={12} />,          color: "#C9963A", bg: "rgba(201,150,58,0.1)" },
  showing:          { label: "Visita",   icon: <Home size={12} />,           color: "#0d9488", bg: "rgba(13,148,136,0.1)" },
  note:             { label: "Nota",     icon: <FileText size={12} />,       color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  task_completed:   { label: "Tarea",    icon: <CheckSquare size={12} />,    color: "#059669", bg: "rgba(5,150,105,0.1)" },
};

const LOGGABLE: ActivityType[] = ["call", "whatsapp_message", "email", "meeting", "note"];

export function DealActivityPanel({
  dealId,
  contactId,
  agentId,
  initialActivities,
}: {
  dealId: string;
  contactId?: string | null;
  agentId: string;
  initialActivities: DealActivity[];
}) {
  const [activities, setActivities] = useState<DealActivity[]>(initialActivities);
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
    if (!form.title.trim()) { toast.error("El título es requerido"); return; }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("activities")
      .insert({
        deal_id: dealId,
        contact_id: contactId ?? null,
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

    if (error || !data) { toast.error("Error al guardar: " + (error?.message ?? "desconocido")); setSaving(false); return; }
    setActivities((prev) => [data as DealActivity, ...prev]);
    toast.success("Actividad registrada");
    setSaving(false);
    resetForm();
  }

  return (
    <div className="card-base p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          Actividad
          <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px]" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {activities.length}
          </span>
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors"
          style={showForm
            ? { background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }
            : { background: "rgba(201,150,58,0.1)", color: "#C9963A", border: "1px solid rgba(201,150,58,0.25)" }
          }
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? "Cancelar" : "Registrar"}
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div className="mb-5 p-4 rounded-xl space-y-3" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
          {/* Type pills */}
          <div className="flex gap-1.5 flex-wrap">
            {LOGGABLE.map((t) => {
              const cfg = ACTIVITY_CONFIG[t];
              const active = form.activity_type === t;
              return (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, activity_type: t }))}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                  style={{
                    background: active ? cfg.bg : "transparent",
                    color: active ? cfg.color : "var(--muted-foreground)",
                    border: active ? `1px solid ${cfg.color}40` : "1px solid var(--border)",
                  }}
                >
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
          </div>

          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") resetForm(); }}
            placeholder="Título (ej. Llamada de seguimiento)"
            className="w-full text-sm px-3 py-2 rounded-lg"
            style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", outline: "none" }}
          />

          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Notas adicionales (opcional)"
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-lg resize-none"
            style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", outline: "none" }}
          />

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={form.duration_minutes}
              onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
              placeholder="Duración (min)"
              className="w-32 text-xs px-3 py-2 rounded-lg"
              style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", outline: "none" }}
            />
            <div className="flex-1" />
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs rounded-lg"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="px-4 py-1.5 text-xs font-bold rounded-lg disabled:opacity-50"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {activities.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: "var(--muted-foreground)" }}>
          Sin actividades registradas. Haz clic en Registrar para agregar.
        </p>
      ) : (
        <div className="space-y-0">
          {activities.map((act, i) => {
            const cfg = ACTIVITY_CONFIG[act.activity_type];
            const ts = act.completed_at ?? act.created_at;
            return (
              <div key={act.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {cfg.icon}
                  </div>
                  {i < activities.length - 1 && (
                    <div className="w-px flex-1 my-1" style={{ background: "var(--border)", minHeight: 16 }} />
                  )}
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                      <p className="text-sm font-semibold mt-1" style={{ color: "var(--foreground)" }}>
                        {act.title}
                      </p>
                      {act.description && (
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                          {act.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }} suppressHydrationWarning>
                        {formatDistanceToNow(new Date(ts), { addSuffix: true, locale: es })}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        {format(new Date(ts), "d MMM", { locale: es })}
                      </p>
                      {act.duration_minutes && (
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
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
      )}
    </div>
  );
}
