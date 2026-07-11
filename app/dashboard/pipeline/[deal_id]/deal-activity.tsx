"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Phone, MessageSquare, Mail, Users, Home, FileText, CheckSquare, Square,
  Plus, X, CalendarClock,
} from "lucide-react";
import type { Task } from "@/lib/types";

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

type TaskPriority = "urgent" | "high" | "medium" | "low";
const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: "Urgente", color: "#dc2626" },
  high:   { label: "Alta",    color: "#ef4444" },
  medium: { label: "Media",   color: "#C9963A" },
  low:    { label: "Baja",    color: "#64748b" },
};

// Fire-and-forget email notification to the assigned agent (immediate
// confirmation). Non-blocking: any failure is ignored in the UI — the server
// route handles auth/gating and is best-effort.
function notifyAssignedAgent(kind: "activity" | "task", id: string) {
  fetch("/api/notify/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, id }),
  }).catch(() => {});
}

// Unified "Actividad" block: register an activity (past event) OR schedule a
// seguimiento (a future task) in the same card. Pending seguimientos render at
// the top; the activity timeline below.
export function DealActivityPanel({
  dealId,
  contactId,
  agentId,
  initialActivities,
  initialTasks,
}: {
  dealId: string;
  contactId?: string | null;
  agentId: string;
  initialActivities: DealActivity[];
  initialTasks: Task[];
}) {
  const [activities, setActivities] = useState<DealActivity[]>(initialActivities);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"activity" | "task">("activity");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    activity_type: "call" as ActivityType,
    title: "",
    description: "",
    duration_minutes: "",
  });
  const [taskForm, setTaskForm] = useState({
    title: "",
    due_date: "",
    priority: "medium" as TaskPriority,
  });

  const pendingTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const doneTasks = tasks.filter((t) => t.status === "completed");
  const count = activities.length + pendingTasks.length;

  function closeForm() {
    setForm({ activity_type: "call", title: "", description: "", duration_minutes: "" });
    setTaskForm({ title: "", due_date: "", priority: "medium" });
    setShowForm(false);
  }

  async function handleSaveActivity() {
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
    notifyAssignedAgent("activity", (data as DealActivity).id);
    toast.success("Actividad registrada");
    setSaving(false);
    closeForm();
  }

  async function handleSaveTask() {
    if (!taskForm.title.trim()) { toast.error("El título es requerido"); return; }
    setSaving(true);
    const supabase = createClient();
    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      title: taskForm.title.trim(),
      deal_id: dealId,
      contact_id: contactId ?? null,
      agent_id: agentId,
      priority: taskForm.priority,
      status: "pending",
      is_automated: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
    if (taskForm.due_date) payload.due_date = new Date(taskForm.due_date).toISOString();

    const { data, error } = await supabase.from("tasks").insert(payload).select().single();
    if (error || !data) { toast.error("Error al agendar: " + (error?.message ?? "desconocido")); setSaving(false); return; }
    setTasks((prev) => [data as Task, ...prev]);
    notifyAssignedAgent("task", (data as Task).id);
    toast.success("Seguimiento agendado");
    setSaving(false);
    closeForm();
  }

  async function toggleTask(task: Task) {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    const supabase = createClient();
    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    if (error) { toast.error("Error actualizando seguimiento"); return; }
    setTasks((prev) =>
      prev.map((t) => t.id === task.id ? { ...t, status: newStatus as Task["status"] } : t)
    );
  }

  const fieldStyle = { background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", outline: "none" } as const;

  return (
    <div className="card-base p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          Actividad
          <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px]" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {count}
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
          {showForm ? "Cancelar" : "Agregar"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-5 p-4 rounded-xl space-y-3" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
          {/* Mode toggle: Actividad | Seguimiento */}
          <div className="flex gap-1.5">
            {(["activity", "task"] as const).map((m) => {
              const active = mode === m;
              const label = m === "activity" ? "Registrar actividad" : "Agendar seguimiento";
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    background: active ? "rgba(201,150,58,0.12)" : "transparent",
                    color: active ? "#C9963A" : "var(--muted-foreground)",
                    border: active ? "1px solid rgba(201,150,58,0.3)" : "1px solid var(--border)",
                  }}
                >
                  {m === "activity" ? <FileText size={12} /> : <CalendarClock size={12} />}
                  {label}
                </button>
              );
            })}
          </div>

          {mode === "activity" ? (
            <>
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
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveActivity(); if (e.key === "Escape") closeForm(); }}
                placeholder="Título (ej. Llamada de seguimiento)"
                className="w-full text-sm px-3 py-2 rounded-lg"
                style={fieldStyle}
              />

              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Notas adicionales (opcional)"
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg resize-none"
                style={fieldStyle}
              />

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={form.duration_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                  placeholder="Duración (min)"
                  className="w-32 text-xs px-3 py-2 rounded-lg"
                  style={fieldStyle}
                />
                <div className="flex-1" />
                <button onClick={closeForm} className="px-3 py-1.5 text-xs rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  Cancelar
                </button>
                <button
                  onClick={handleSaveActivity}
                  disabled={saving || !form.title.trim()}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg disabled:opacity-50"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTask(); if (e.key === "Escape") closeForm(); }}
                placeholder="Título del seguimiento…"
                className="w-full text-sm px-3 py-2 rounded-lg"
                style={fieldStyle}
              />
              <div className="flex gap-2 flex-wrap items-center">
                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="flex-1 min-w-[9rem] text-xs px-3 py-2 rounded-lg"
                  style={fieldStyle}
                />
                <div className="flex gap-1.5">
                  {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => {
                    const active = taskForm.priority === p;
                    const meta = PRIORITY_META[p];
                    return (
                      <button
                        key={p}
                        onClick={() => setTaskForm((f) => ({ ...f, priority: p }))}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                        style={{
                          background: active ? `${meta.color}1a` : "transparent",
                          color: active ? meta.color : "var(--muted-foreground)",
                          border: active ? `1px solid ${meta.color}55` : "1px solid var(--border)",
                        }}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={closeForm} className="px-3 py-1.5 text-xs rounded-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  Cancelar
                </button>
                <button
                  onClick={handleSaveTask}
                  disabled={saving || !taskForm.title.trim()}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg disabled:opacity-50"
                  style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  {saving ? "Agendando…" : "Agendar"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Seguimientos (pending + done) */}
      {(pendingTasks.length > 0 || doneTasks.length > 0) && (
        <div className="mb-4">
          <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>
            Seguimientos
          </p>
          <div className="space-y-1">
            {[...pendingTasks, ...doneTasks].map((task) => {
              const isDone = task.status === "completed";
              const prio = (task.priority ?? "medium") as TaskPriority;
              const prioColor = PRIORITY_META[prio]?.color ?? "#64748b";
              return (
                <div key={task.id} className="flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors hover:bg-muted/50">
                  <button
                    onClick={() => toggleTask(task)}
                    className="mt-0.5 shrink-0 transition-colors"
                    style={{ color: isDone ? "#10b981" : "var(--muted-foreground)" }}
                    aria-label={isDone ? "Marcar pendiente" : "Marcar completado"}
                  >
                    {isDone ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm leading-snug"
                      style={{ color: isDone ? "var(--muted-foreground)" : "var(--foreground)", textDecoration: isDone ? "line-through" : "none" }}
                    >
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-bold uppercase" style={{ color: prioColor }}>
                        {PRIORITY_META[prio]?.label ?? "Media"}
                      </span>
                      {task.due_date && (
                        <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                          · Vence {format(parseISO(task.due_date), "d MMM", { locale: es })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity timeline */}
      {activities.length === 0 ? (
        pendingTasks.length === 0 && doneTasks.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: "var(--muted-foreground)" }}>
            Sin actividad. Haz clic en Agregar para registrar una actividad o agendar un seguimiento.
          </p>
        ) : null
      ) : (
        <div className="space-y-0">
          {activities.map((act, i) => {
            const cfg = ACTIVITY_CONFIG[act.activity_type];
            const ts = act.completed_at ?? act.created_at;
            return (
              <div key={act.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.icon}
                  </div>
                  {i < activities.length - 1 && (
                    <div className="w-px flex-1 my-1" style={{ background: "var(--border)", minHeight: 16 }} />
                  )}
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
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
