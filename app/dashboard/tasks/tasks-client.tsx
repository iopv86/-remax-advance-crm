"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  List, CalendarDays, Plus, CalendarCheck, Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskSheet } from "@/components/task-sheet";
import { type Task } from "@/lib/types";
import { format, startOfDay, addMonths, subMonths } from "date-fns";
import { parseInitialMonth } from "@/lib/tasks/calendar";
import { ListView } from "./list-view";
import { CalendarView } from "./calendar-view";

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

  function handleCalendarToday() {
    const now = new Date();
    setCalendarMonth(now);
    pushFilter({ month: format(now, "yyyy-MM"), view: "calendar" });
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
    if (!gcalConnected) { toast.error("Conecta Google Calendar primero"); return; }
    setSyncingGcalId(task.id);
    try {
      const res = await fetch("/api/integrations/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id }),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error ?? "Error al sincronizar con Google Calendar");
      else { toast.success("Tarea sincronizada con Google Calendar"); router.refresh(); }
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
      const res = await fetch(`/api/integrations/google/sync?task_id=${encodeURIComponent(task.id)}`, { method: "DELETE" });
      if (res.ok) { toast.success("Evento eliminado de Google Calendar"); router.refresh(); }
      else { const data = await res.json(); toast.error(data.error ?? "Error al desincronizar"); }
    } catch {
      toast.error("Error de red");
    } finally {
      setSyncingGcalId(null);
    }
  }

  const today = startOfDay(new Date());

  const statsCards = [
    { label: "Pendientes",      value: stats.pending,        dot: "#3b82f6" },
    { label: "Vencidas",        value: stats.overdue,        dot: "#ef4444" },
    { label: "Completadas hoy", value: stats.completedToday, dot: "#10b981" },
    { label: "Urgentes",        value: stats.urgent,         dot: "#C9963A" },
  ];

  const statusPills: { value: string; label: string }[] = [
    { value: "", label: "Todas" },
    { value: "pending", label: "Pendientes" },
    { value: "in_progress", label: "En progreso" },
    { value: "completed", label: "Completadas" },
    { value: "cancelled", label: "Canceladas" },
  ];

  return (
    <>
      {/* Google Calendar banner */}
      {gcalConnected ? (
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-5"
          style={{ background: "rgba(66,133,244,0.06)", border: "1px solid rgba(66,133,244,0.18)" }}
        >
          <div className="flex items-center gap-2.5">
            <CalendarCheck className="w-4 h-4 shrink-0" style={{ color: "#4285F4" }} />
            <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              Google Calendar conectado
            </p>
          </div>
          <button
            onClick={async () => {
              const res = await fetch("/api/integrations/google/auth", { method: "DELETE" });
              if (res.ok) { toast.success("Google Calendar desconectado"); router.refresh(); }
              else toast.error("Error al desconectar");
            }}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ background: "rgba(100,116,139,0.1)", color: "var(--muted-foreground)" }}
          >
            Desconectar
          </button>
        </div>
      ) : (
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

      {/* Stats row */}
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

      {/* Filter bar + view toggle + new task */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-5">
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

        <div className="flex items-center gap-2 w-full sm:w-auto">
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

      {/* Views */}
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
          onToday={handleCalendarToday}
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
