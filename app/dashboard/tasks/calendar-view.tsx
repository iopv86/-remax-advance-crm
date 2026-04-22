"use client";

import { format, getDay, isBefore, isToday, startOfDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS,
  type Task, type TaskPriority, type TaskStatus,
} from "@/lib/types";
import { getCalendarDays, groupTasksByDate, WEEK_DAYS } from "@/lib/tasks/calendar";

export interface CalendarViewProps {
  tasks: Task[];
  month: Date;
  onNav: (dir: "prev" | "next") => void;
  onToday: () => void;
  onEdit: (t: Task, e?: React.MouseEvent) => void;
  today: Date;
}

function TaskChip({ task, onEdit, today }: {
  task: Task;
  onEdit: (t: Task, e?: React.MouseEvent) => void;
  today: Date;
}) {
  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const dueDate = task.due_date ? parseISO(task.due_date) : null;
  const isOverdue = dueDate && isBefore(startOfDay(dueDate), today) && !isCompleted && !isCancelled;

  const chipBg = isCancelled
    ? "rgba(100,116,139,0.1)"
    : PRIORITY_COLORS[task.priority as TaskPriority]?.bg ?? "var(--muted)";
  const chipBorder = isCancelled
    ? "#64748b"
    : isOverdue
    ? "#ef4444"
    : PRIORITY_COLORS[task.priority as TaskPriority]?.dot ?? "var(--border)";
  const chipOpacity = isCancelled ? 0.3 : isCompleted ? 0.45 : 1;
  const textColor = isCancelled
    ? "#64748b"
    : PRIORITY_COLORS[task.priority as TaskPriority]?.text ?? "var(--foreground)";

  return (
    <button
      onClick={(e) => onEdit(task, e)}
      className="w-full text-left mb-0.5 rounded flex items-center gap-1 px-1.5 py-0.5 transition-opacity hover:opacity-80"
      aria-label={`${task.title}, ${PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority}, ${STATUS_LABELS[task.status as TaskStatus] ?? task.status}`}
      style={{
        background: chipBg,
        borderLeft: `2px solid ${chipBorder}`,
        opacity: chipOpacity,
      }}
    >
      <span
        className="text-[10px] font-medium truncate"
        style={{
          color: textColor,
          textDecoration: isCompleted || isCancelled ? "line-through" : "none",
        }}
      >
        {task.title}
      </span>
    </button>
  );
}

export function CalendarView({ tasks, month, onNav, onToday, onEdit, today }: CalendarViewProps) {
  const days = getCalendarDays(month);
  const tasksByDate = groupTasksByDate(tasks);

  // For mobile agenda: only days in the current month that have tasks
  const daysWithTasks = days
    .filter(({ isCurrentMonth }) => isCurrentMonth)
    .filter(({ date }) => (tasksByDate.get(format(date, "yyyy-MM-dd")) ?? []).length > 0)
    .map(({ date }) => ({ date, tasks: tasksByDate.get(format(date, "yyyy-MM-dd")) ?? [] }));

  return (
    <div className="card-base overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => onNav("prev")}
          aria-label="Mes anterior"
          className="p-1.5 rounded-lg transition-colors hover:bg-muted"
          style={{ color: "var(--muted-foreground)" }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
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
            onClick={onToday}
            className="text-[10px] font-bold px-2 py-1 rounded-md transition-colors hover:opacity-80"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            Hoy
          </button>
        </div>

        <button
          onClick={() => onNav("next")}
          aria-label="Mes siguiente"
          className="p-1.5 rounded-lg transition-colors hover:bg-muted"
          style={{ color: "var(--muted-foreground)" }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Desktop/tablet grid */}
      <div className="hidden sm:block">
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

        <div className="grid grid-cols-7" role="grid" aria-label={format(month, "MMMM yyyy", { locale: es })}>
          {days.map(({ date, isCurrentMonth }, i) => {
            const dateKey = format(date, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(dateKey) ?? [];
            const isNow = isToday(date);
            const isPast = isBefore(startOfDay(date), today) && !isNow;
            const isWeekend = [0, 6].includes(getDay(date));

            return (
              <div
                key={i}
                role="gridcell"
                aria-label={format(date, "EEEE d 'de' MMMM", { locale: es })}
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

                {dayTasks.slice(0, 3).map((task) => (
                  <TaskChip key={task.id} task={task} onEdit={onEdit} today={today} />
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

      {/* Mobile agenda */}
      <div className="sm:hidden">
        {daysWithTasks.length === 0 ? (
          <div className="py-12 text-center" style={{ color: "var(--muted-foreground)" }}>
            <p className="text-sm">Sin tareas este mes</p>
          </div>
        ) : (
          daysWithTasks.map(({ date, tasks: dayTasks }) => {
            const isNow = isToday(date);
            return (
              <div key={format(date, "yyyy-MM-dd")} style={{ borderBottom: "1px solid var(--border)" }}>
                <div
                  className="px-4 py-2 flex items-center gap-2"
                  style={{
                    background: isNow ? "rgba(201,150,58,0.06)" : "rgba(28,29,39,0.5)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="text-xs font-bold flex items-center justify-center w-6 h-6 rounded-full"
                    style={{
                      background: isNow ? "var(--primary)" : "transparent",
                      color: isNow ? "var(--primary-foreground)" : "var(--foreground)",
                    }}
                  >
                    {format(date, "d")}
                  </span>
                  <span
                    className="text-xs font-medium capitalize"
                    style={{ color: isNow ? "var(--primary)" : "var(--muted-foreground)" }}
                  >
                    {format(date, "EEEE, d MMM", { locale: es })}
                  </span>
                </div>

                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {dayTasks.map((task) => {
                    const isCompleted = task.status === "completed";
                    const isCancelled = task.status === "cancelled";
                    const dueDate = task.due_date ? parseISO(task.due_date) : null;
                    const isOverdue = dueDate && isBefore(startOfDay(dueDate), today) && !isCompleted && !isCancelled;

                    return (
                      <button
                        key={task.id}
                        onClick={(e) => onEdit(task, e)}
                        className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                        style={{ opacity: isCancelled ? 0.4 : isCompleted ? 0.6 : 1 }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background: isCancelled ? "#64748b"
                              : isOverdue ? "#ef4444"
                              : PRIORITY_COLORS[task.priority as TaskPriority]?.dot ?? "var(--border)",
                          }}
                        />
                        <span
                          className="text-sm font-medium flex-1 min-w-0 truncate"
                          style={{
                            color: isCancelled ? "#64748b" : "var(--foreground)",
                            textDecoration: isCompleted || isCancelled ? "line-through" : "none",
                          }}
                        >
                          {task.title}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            background: PRIORITY_COLORS[task.priority as TaskPriority]?.bg ?? "var(--muted)",
                            color: PRIORITY_COLORS[task.priority as TaskPriority]?.text ?? "var(--foreground)",
                          }}
                        >
                          {PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
