"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  List, CalendarDays, ChevronLeft, ChevronRight,
  Plus, Pencil, Trash2, CheckCircle2, Search, CalendarCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskSheet } from "@/components/task-sheet";
import {
  PRIORITY_LABELS, PRIORITY_COLORS, STATUS_LABELS,
  type Task, type TaskPriority, type TaskStatus,
} from "@/lib/types";
import {
  format, parseISO, isToday, isBefore, startOfDay,
  startOfMonth, getDay, addDays, subDays,
  isSameMonth, formatDistanceToNow, addMonths, subMonths,
} from "date-fns";
import { es } from "date-fns/locale";

interface ContactOption { id: string; first_name: string | null; last_name: string | null; }

interface TaskStats {
  pending: number;
  overdue: number;
  completedToday: number;
  urgent: number;
}

interface TasksClientProps {
  tasks: Task[];
  contacts: ContactOption[];
  stats: TaskStats;
  initialView: "list" | "calendar";
  initialPriority?: string;
  initialStatus?: string;
  initialSearch?: string;
  initialMonth?: string;
  gcalConnected?: boolean;
  gcalParam?: string;
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

function parseInitialMonth(s?: string): Date {
  if (!s) return new Date();
  const [y, m] = s.split("-").map(Number);
  if (!y || !m) return new Date();
  return new Date(y, m - 1, 1);
}

function getCalendarDays(month: Date) {
  const start = startOfMonth(month);
  const dayOfWeek = getDay(start); // 0 = Sunday
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday start
  const calStart = subDays(start, offset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(calStart, i);
    return { date, isCurrentMonth: isSameMonth(date, month) };
  });
}

function groupTasksByDate(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const key = t.due_date.slice(0, 10);
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return map;
}

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ── Main component ────────────────────────────────────────────────────────────

export function TasksClient({
  tasks: initial, contacts, stats,
  initialView, initialPriority, initialStatus, initialSearch, initialMonth,
  gcalConnected = false, gcalParam,
}: TasksClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (gcalParam === "connected") toast.success("Google Calendar conectado correctamente");
    if (gcalParam === "error") toast.error("Error conectando Google Calendar. Intenta de nuevo.");
    if (gcalParam === "not_configured") toast.error("Google Calendar no está configurado en el servidor.");
  }, [gcalParam]);

  const [tasks, setTasks] = useState<Task[]>(initial);
  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [priorityFilter, setPriorityFilter] = useState(initialPriority ?? "");
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [calendarMonth, setCalendarMonth] = useState(() => parseInitialMonth(initialMonth));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingGcalId, setSyncingGcalId] = useState<string | null>(null);

  const createQueryString = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v); else params.delete(k);
    }
    return params.toString();
  }, [searchParams]);

  function pushFilter(updates: Record<string, string | undefined>) {
    router.push(`${pathname}?${createQueryString(updates)}`);
  }

  function handleView(v: "list" | "calendar") {
    setView(v);
    pushFilter({ view: v });
  }

  function handleSearch(q: string) {
    setSearch(q);
    pushFilter({ q: q || undefined });
  }

  function handlePriority(p: string) {
    setPriorityFilter(p);
    pushFilter({ priority: p || undefined });
  }

  function handleStatus(s: string) {
    setStatusFilter(s);
    pushFilter({ status: s || undefined });
  }

  function handleCalendarNav(direction: "prev" | "next") {
    const next = direction === "next" ? addMonths(calendarMonth, 1) : subMonths(calendarMonth, 1);
    setCalendarMonth(next);
    pushFilter({ month: format(next, "yyyy-MM"), view: "calendar" });
  }

  function openNew() {
    setEditTask(null);
    setSheetOpen(true);
  }

  function openEdit(task: Task, e?: React.MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    setEditTask(task);
    setSheetOpen(true);
  }

  async function handleDelete(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`¿Eliminar "${task.title}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(task.id);
    const supabase = createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    setDeletingId(null);
    if (error) { toast.error("Error al eliminar: " + error.message); return; }
    toast.success("Tarea eliminada");
    router.refresh();
  }

  async function toggleComplete(task: Task) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: agent } = await supabase
      .from("agents").select("id").eq("email", user?.email ?? "").single();
    const completing = task.status !== "completed";
    const { error } = await supabase.from("tasks").update({
      status: completing ? "completed" : "pending",
      completed_at: completing ? new Date().toISOString() : null,
      completed_by: completing ? (agent?.id ?? null) : null,
    }).eq("id", task.id);
    if (error) { toast.error("Error: " + error.message); return; }
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: completing ? "completed" : "pending" }
      : t
    ));
    toast.success(completing ? "Tarea completada ✓" : "Tarea reabierta");
  }

  function handleSaved() {
    setSheetOpen(false);
    setEditTask(null);
    router.refresh();
  }

  async function syncGcal(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!gcalConnected) {
      toast.error("Conecta Google Calendar primero");
      return;
    }
    setSyncingGcalId(task.id);
    try {
      const res = await fetch("/api/integrations/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al sincronizar con Google Calendar");
      } else {
        toast.success("Tarea sincronizada con Google Calendar");
        router.refresh();
      }
    } catch {
      toast.error("Error de red al sincronizar");
    } finally {
      setSyncingGcalId(null);
    }
  }

  async function unsyncGcal(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setSyncingGcalId(task.id);
    try {
      const res = await fetch(`/api/integrations/google/sync?task_id=${task.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Evento eliminado de Google Calendar");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Error al desincronizar");
      }
    } catch {
      toast.error("Error de red");
    } finally {
      setSyncingGcalId(null);
    }
  }

  const today = startOfDay(new Date());

  // ── STATS ROW ───────────────────────────────────────────────────────────────

  const statsCards = [
    { label: "Pendientes",      value: stats.pending,        dot: "#3b82f6" },
    { label: "Vencidas",        value: stats.overdue,        dot: "#ef4444" },
    { label: "Completadas hoy", value: stats.completedToday, dot: "#10b981" },
    { label: "Urgentes",        value: stats.urgent,         dot: "#C9963A" },
  ];

  // ── FILTER BAR ──────────────────────────────────────────────────────────────

  const statusPills: { value: string; label: string }[] = [
    { value: "", label: "Todas" },
    { value: "pending", label: "Pendientes" },
    { value: "in_progress", label: "En progreso" },
    { value: "completed", label: "Completadas" },
    { value: "cancelled", label: "Canceladas" },
  ];

  return (
    <>
      {/* ── Google Calendar banner ─────────────────────────────────────────── */}
      {!gcalConnected && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-5"
          style={{ background: "rgba(201,150,58,0.07)", border: "1px solid rgba(201,150,58,0.18)" }}
        >
          <div className="flex items-center gap-2.5">
            <CalendarCheck className="w-4 h-4 shrink-0" style={{ color: "#C9963A" }} />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Conecta{" "}
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>Google Calendar</span>
              {" "}para sincronizar tus tareas automáticamente.
            </p>
          </div>
          <a
            href="/api/integrations/google/auth"
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(201,150,58,0.15)", color: "#C9963A" }}
          >
            Conectar
          </a>
        </div>
      )}

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statsCards.map((s) => (
          <div key={s.label} className="card-base p-4 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: s.dot }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                {s.label}
              </p>
              <p className="text-xl font-bold mt-0.5" style={{ color: "var(--foreground)" }}>
                {s.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter bar + view toggle + new task ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-5">
        {/* Left: status pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {statusPills.map((p) => (
            <button
              key={p.value}
              onClick={() => handleStatus(p.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={
                statusFilter === p.value
                  ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                  : { background: "var(--muted)", color: "var(--muted-foreground)" }
              }
            >
              {p.label}
            </button>
          ))}

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => handlePriority(e.target.value)}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{
              background: "var(--muted)", color: "var(--muted-foreground)",
              border: "1px solid var(--border)", outline: "none",
            }}
          >
            <option value="">Toda prioridad</option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
        </div>

        {/* Right: search + view toggle + new task */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--muted-foreground)" }} />
            <input
              type="text"
              placeholder="Buscar tarea…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="h-8 pl-8 pr-3 text-xs rounded-lg w-full sm:w-40"
              style={{
                background: "var(--muted)", color: "var(--foreground)",
                border: "1px solid var(--border)", outline: "none",
              }}
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center p-1 rounded-lg gap-0.5" style={{ background: "var(--border)" }}>
            {[
              { v: "list" as const, icon: <List className="w-3.5 h-3.5" />, label: "Lista" },
              { v: "calendar" as const, icon: <CalendarDays className="w-3.5 h-3.5" />, label: "Calendario" },
            ].map(({ v, icon, label }) => (
              <button
                key={v}
                onClick={() => handleView(v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={
                  view === v
                    ? { background: "var(--card)", color: "var(--foreground)", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }
                    : { color: "var(--muted-foreground)" }
                }
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* New task */}
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-95"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva tarea
          </button>
        </div>
      </div>

      {/* ── Views ──────────────────────────────────────────────────────────── */}
      {view === "list" ? (
        <ListView
          tasks={tasks}
          onEdit={openEdit}
          onDelete={handleDelete}
          onToggleComplete={toggleComplete}
          deletingId={deletingId}
          today={today}
          gcalConnected={gcalConnected}
          syncingGcalId={syncingGcalId}
          onSyncGcal={syncGcal}
          onUnsyncGcal={unsyncGcal}
        />
      ) : (
        <CalendarView
          tasks={tasks}
          month={calendarMonth}
          onNav={handleCalendarNav}
          onEdit={openEdit}
          today={today}
        />
      )}

      <TaskSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={editTask}
        contacts={contacts}
        onSaved={handleSaved}
      />
    </>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

interface ListViewProps {
  tasks: Task[];
  onEdit: (t: Task, e: React.MouseEvent) => void;
  onDelete: (t: Task, e: React.MouseEvent) => Promise<void>;
  onToggleComplete: (t: Task) => Promise<void>;
  deletingId: string | null;
  today: Date;
  gcalConnected?: boolean;
  syncingGcalId?: string | null;
  onSyncGcal?: (t: Task, e: React.MouseEvent) => void;
  onUnsyncGcal?: (t: Task, e: React.MouseEvent) => void;
}

function ListView({ tasks, onEdit, onDelete, onToggleComplete, deletingId, today, gcalConnected, syncingGcalId, onSyncGcal, onUnsyncGcal }: ListViewProps) {
  if (tasks.length === 0) {
    return (
      <div className="card-base flex flex-col items-center justify-center py-20" style={{ color: "var(--muted-foreground)" }}>
        <CheckCircle2 className="w-10 h-10 mb-3 opacity-20" />
        <p className="text-sm font-medium">Sin tareas para mostrar</p>
        <p className="text-xs mt-1 opacity-60">Crea una nueva tarea con el botón de arriba</p>
      </div>
    );
  }

  return (
    <div className="card-base overflow-hidden">
      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="hidden md:block">
        {/* Table header */}
        <div
          className="grid gap-4 px-5 py-3 text-[10px] font-bold uppercase tracking-widest"
          style={{
            gridTemplateColumns: "40px 1fr 100px 140px 100px 72px",
            background: "color-mix(in srgb, var(--muted) 60%, transparent)",
            color: "var(--muted-foreground)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div />
          <div>Tarea</div>
          <div>Prioridad</div>
          <div>Vencimiento</div>
          <div>Estado</div>
          <div />
        </div>

        {/* Rows */}
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {tasks.map((task) => {
            const dueDate = task.due_date ? parseISO(task.due_date) : null;
            const isOverdue = dueDate && isBefore(startOfDay(dueDate), today) && task.status !== "completed";
            const isDueToday = dueDate && isToday(dueDate);
            const isCompleted = task.status === "completed";
            const contact = task.contact as { first_name?: string | null; last_name?: string | null } | null;
            const contactName = contact
              ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
              : null;

            return (
              <div
                key={task.id}
                className="group grid gap-4 px-5 py-3.5 table-row-hover transition-colors items-center"
                style={{
                  gridTemplateColumns: "40px 1fr 100px 140px 100px 72px",
                  borderLeft: isOverdue ? "2px solid rgba(239,68,68,0.5)" : "2px solid transparent",
                }}
              >
                {/* Completion toggle */}
                <button
                  onClick={() => onToggleComplete(task)}
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110"
                  style={{
                    borderColor: isCompleted ? "#10b981" : "var(--border)",
                    background: isCompleted ? "rgba(16,185,129,0.1)" : "transparent",
                  }}
                  title={isCompleted ? "Marcar como pendiente" : "Marcar como completada"}
                >
                  {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#10b981" }} />}
                </button>

                {/* Title + contact */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{
                        color: isCompleted ? "var(--muted-foreground)" : "var(--foreground)",
                        textDecoration: isCompleted ? "line-through" : "none",
                        opacity: isCompleted ? 0.6 : 1,
                      }}
                    >
                      {task.title}
                    </p>
                    {task.gcal_event_id && (
                      <span title="Sincronizado con Google Calendar" className="shrink-0">
                        <CalendarCheck className="w-3 h-3" style={{ color: "#4285F4" }} />
                      </span>
                    )}
                  </div>
                  {contactName && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>
                      {contactName}
                    </p>
                  )}
                </div>

                {/* Priority badge */}
                <div>
                  <span
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold w-fit"
                    style={{
                      background: PRIORITY_COLORS[task.priority as TaskPriority]?.bg ?? "var(--muted)",
                      color: PRIORITY_COLORS[task.priority as TaskPriority]?.text ?? "var(--foreground)",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: PRIORITY_COLORS[task.priority as TaskPriority]?.dot }}
                    />
                    {PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority}
                  </span>
                </div>

                {/* Due date */}
                <div>
                  {dueDate ? (
                    <>
                      <p
                        className="text-xs font-medium"
                        style={{
                          color: isOverdue ? "#ef4444" : isDueToday ? "#C9963A" : "var(--foreground)",
                        }}
                      >
                        {isDueToday ? "Hoy" : format(dueDate, "d MMM yyyy", { locale: es })}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: isOverdue ? "rgba(239,68,68,0.7)" : "var(--muted-foreground)" }}>
                        {formatDistanceToNow(dueDate, { addSuffix: true, locale: es })}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </div>

                {/* Status badge */}
                <div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: task.status === "completed" ? "rgba(16,185,129,0.1)"
                        : task.status === "in_progress" ? "rgba(59,130,246,0.1)"
                        : task.status === "cancelled" ? "rgba(100,116,139,0.1)"
                        : "rgba(201,150,58,0.08)",
                      color: task.status === "completed" ? "#10b981"
                        : task.status === "in_progress" ? "#3b82f6"
                        : task.status === "cancelled" ? "#64748b"
                        : "#C9963A",
                    }}
                  >
                    {STATUS_LABELS[task.status as TaskStatus] ?? task.status}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {gcalConnected && (
                    <button
                      onClick={(e) => task.gcal_event_id ? onUnsyncGcal?.(task, e) : onSyncGcal?.(task, e)}
                      disabled={syncingGcalId === task.id}
                      className="p-1.5 rounded transition-colors disabled:opacity-40"
                      style={task.gcal_event_id
                        ? { color: "#4285F4", background: "rgba(66,133,244,0.1)" }
                        : { color: "var(--muted-foreground)" }
                      }
                      title={task.gcal_event_id ? "Quitar de Google Calendar" : "Sincronizar con Google Calendar"}
                    >
                      <CalendarCheck className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={(e) => onEdit(task, e)}
                    className="p-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-slate-400 hover:text-slate-700 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => onDelete(task, e)}
                    disabled={deletingId === task.id}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Mobile card list (visible only on mobile) ── */}
      <div className="md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {tasks.map((task) => {
          const dueDate = task.due_date ? parseISO(task.due_date) : null;
          const isOverdue = dueDate && isBefore(startOfDay(dueDate), today) && task.status !== "completed";
          const isDueToday = dueDate && isToday(dueDate);
          const isCompleted = task.status === "completed";
          const contact = task.contact as { first_name?: string | null; last_name?: string | null } | null;
          const contactName = contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
            : null;

          return (
            <div
              key={task.id}
              className="flex items-start gap-3 px-4 py-3.5"
              style={{ borderLeft: isOverdue ? "2px solid rgba(239,68,68,0.5)" : "2px solid transparent" }}
            >
              {/* Completion toggle */}
              <button
                onClick={() => onToggleComplete(task)}
                className="mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                style={{
                  borderColor: isCompleted ? "#10b981" : "var(--border)",
                  background: isCompleted ? "rgba(16,185,129,0.1)" : "transparent",
                }}
                title={isCompleted ? "Marcar como pendiente" : "Marcar como completada"}
              >
                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#10b981" }} />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{
                      color: isCompleted ? "var(--muted-foreground)" : "var(--foreground)",
                      textDecoration: isCompleted ? "line-through" : "none",
                      opacity: isCompleted ? 0.6 : 1,
                    }}
                  >
                    {task.title}
                  </p>
                  {task.gcal_event_id && (
                    <span title="Sincronizado con Google Calendar" className="shrink-0">
                      <CalendarCheck className="w-3 h-3" style={{ color: "#4285F4" }} />
                    </span>
                  )}
                </div>
                {contactName && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>
                    {contactName}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {/* Priority */}
                  <span
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: PRIORITY_COLORS[task.priority as TaskPriority]?.bg ?? "var(--muted)",
                      color: PRIORITY_COLORS[task.priority as TaskPriority]?.text ?? "var(--foreground)",
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[task.priority as TaskPriority]?.dot }} />
                    {PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority}
                  </span>
                  {/* Status */}
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: task.status === "completed" ? "rgba(16,185,129,0.1)"
                        : task.status === "in_progress" ? "rgba(59,130,246,0.1)"
                        : task.status === "cancelled" ? "rgba(100,116,139,0.1)"
                        : "rgba(201,150,58,0.08)",
                      color: task.status === "completed" ? "#10b981"
                        : task.status === "in_progress" ? "#3b82f6"
                        : task.status === "cancelled" ? "#64748b"
                        : "#C9963A",
                    }}
                  >
                    {STATUS_LABELS[task.status as TaskStatus] ?? task.status}
                  </span>
                  {/* Due date */}
                  {dueDate && (
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: isOverdue ? "#ef4444" : isDueToday ? "#C9963A" : "var(--muted-foreground)" }}
                    >
                      {isDueToday ? "Hoy" : format(dueDate, "d MMM", { locale: es })}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {gcalConnected && (
                  <button
                    onClick={(e) => task.gcal_event_id ? onUnsyncGcal?.(task, e) : onSyncGcal?.(task, e)}
                    disabled={syncingGcalId === task.id}
                    className="p-1.5 rounded transition-colors disabled:opacity-40"
                    style={task.gcal_event_id
                      ? { color: "#4285F4", background: "rgba(66,133,244,0.1)" }
                      : { color: "var(--muted-foreground)" }
                    }
                    title={task.gcal_event_id ? "Quitar de Google Calendar" : "Sincronizar con Google Calendar"}
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => onEdit(task, e)}
                  className="p-1.5 rounded text-slate-400 hover:text-slate-700 transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => onDelete(task, e)}
                  disabled={deletingId === task.id}
                  className="p-1.5 rounded text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
                  title="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────

interface CalendarViewProps {
  tasks: Task[];
  month: Date;
  onNav: (dir: "prev" | "next") => void;
  onEdit: (t: Task, e?: React.MouseEvent) => void;
  today: Date;
}

function CalendarView({ tasks, month, onNav, onEdit, today }: CalendarViewProps) {
  const days = getCalendarDays(month);
  const tasksByDate = groupTasksByDate(tasks);

  return (
    <div className="card-base overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => onNav("prev")}
          className="p-1.5 rounded-lg transition-colors hover:bg-muted"
          style={{ color: "var(--muted-foreground)" }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3
          className="font-bold capitalize"
          style={{
            fontFamily: "var(--font-display),var(--font-manrope),system-ui",
            fontSize: 16,
            color: "var(--foreground)",
          }}
        >
          {format(month, "MMMM yyyy", { locale: es })}
        </h3>
        <button
          onClick={() => onNav("next")}
          className="p-1.5 rounded-lg transition-colors hover:bg-muted"
          style={{ color: "var(--muted-foreground)" }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--border)" }}>
        {WEEK_DAYS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map(({ date, isCurrentMonth }, i) => {
          const dateKey = format(date, "yyyy-MM-dd");
          const dayTasks = tasksByDate.get(dateKey) ?? [];
          const isNow = isToday(date);
          const isPast = isBefore(startOfDay(date), today) && !isNow;
          const isWeekend = [0, 6].includes(getDay(date));

          return (
            <div
              key={i}
              className="min-h-[100px] p-1.5"
              style={{
                borderRight: (i + 1) % 7 !== 0 ? "1px solid var(--border)" : undefined,
                borderBottom: i < 35 ? "1px solid var(--border)" : undefined,
                background: isNow
                  ? "rgba(201,150,58,0.04)"
                  : isWeekend ? "color-mix(in srgb, var(--muted) 30%, transparent)"
                  : undefined,
                opacity: isCurrentMonth ? 1 : 0.35,
              }}
            >
              {/* Day number */}
              <span
                className="text-xs font-bold flex items-center justify-center w-6 h-6 rounded-full mb-1"
                style={{
                  color: isNow ? "var(--primary-foreground)"
                    : isPast && isCurrentMonth ? "var(--muted-foreground)"
                    : "var(--foreground)",
                  background: isNow ? "var(--primary)" : "transparent",
                  fontWeight: isNow ? 700 : 500,
                }}
              >
                {format(date, "d")}
              </span>

              {/* Task pills */}
              {dayTasks.slice(0, 3).map((task) => (
                <button
                  key={task.id}
                  onClick={(e) => onEdit(task, e)}
                  className="w-full text-left mb-0.5 rounded flex items-center gap-1 px-1.5 py-0.5 transition-opacity hover:opacity-80"
                  style={{
                    background: PRIORITY_COLORS[task.priority as TaskPriority]?.bg ?? "var(--muted)",
                    borderLeft: `2px solid ${PRIORITY_COLORS[task.priority as TaskPriority]?.dot ?? "var(--border)"}`,
                    opacity: task.status === "completed" ? 0.45 : 1,
                  }}
                >
                  <span
                    className="text-[10px] font-medium truncate"
                    style={{
                      color: PRIORITY_COLORS[task.priority as TaskPriority]?.text ?? "var(--foreground)",
                      textDecoration: task.status === "completed" ? "line-through" : "none",
                    }}
                  >
                    {task.title}
                  </span>
                </button>
              ))}
              {dayTasks.length > 3 && (
                <p className="text-[9px] pl-1 mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  +{dayTasks.length - 3} más
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
