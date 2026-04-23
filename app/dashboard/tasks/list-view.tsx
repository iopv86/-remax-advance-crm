"use client";

import {
  CheckCircle2, Pencil, Trash2, CalendarCheck,
} from "lucide-react";
import {
  PRIORITY_LABELS, PRIORITY_COLORS, STATUS_LABELS,
  type Task, type TaskPriority, type TaskStatus,
} from "@/lib/types";
import {
  format, parseISO, isToday, isBefore, startOfDay, formatDistanceToNow,
} from "date-fns";
import { es } from "date-fns/locale";

export interface ListViewProps {
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

export function ListView({
  tasks, onEdit, onDelete, onToggleComplete, deletingId, today,
  gcalConnected, syncingGcalId, onSyncGcal, onUnsyncGcal,
}: ListViewProps) {
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
      {/* Desktop table */}
      <div className="hidden md:block">
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
                      <p className="text-[10px] mt-0.5" style={{ color: isOverdue ? "rgba(239,68,68,0.7)" : "var(--muted-foreground)" }} suppressHydrationWarning>
                        {formatDistanceToNow(dueDate, { addSuffix: true, locale: es })}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </div>

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

      {/* Mobile card list */}
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
