"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, isPast, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2, CheckSquare, Clock, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Task } from "@/lib/types";
import { TaskSheet } from "./task-sheet";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};

interface Props {
  tasks: Task[];
}

export function TasksTable({ tasks: initial }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleToggleComplete(task: Task) {
    if (task.status === "completed" || task.status === "cancelled") return;
    setTogglingId(task.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", task.id);
    setTogglingId(null);
    if (error) {
      toast.error("Error al completar: " + error.message);
      return;
    }
    toast.success("Tarea completada");
    router.refresh();
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setSheetOpen(true);
  }

  async function handleDelete(task: Task) {
    if (!confirm(`¿Eliminar "${task.title}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(task.id);
    const supabase = createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    setDeletingId(null);
    if (error) {
      toast.error("Error al eliminar: " + error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    toast.success("Tarea eliminada");
  }

  function handleSaved() {
    setSheetOpen(false);
    setEditTask(null);
    router.refresh();
  }

  return (
    <>
      <div className="card-base overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "var(--border)" }}>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground w-8" />
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Tarea</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Contacto</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Vencimiento</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Prioridad</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Estado</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CheckSquare className="w-8 h-8 opacity-20" />
                    <p className="font-sans text-sm">No hay tareas pendientes.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {tasks.map((t) => {
              const contact = t.contact as { first_name?: string; last_name?: string } | null;
              const due = t.due_date ? new Date(t.due_date) : null;
              const overdue = due && isPast(due) && !isToday(due);
              const dueToday = due && isToday(due);

              const priorityStyle =
                t.priority === "urgent"
                  ? { background: "var(--red-muted)", color: "var(--red)" }
                  : t.priority === "high"
                  ? { background: "var(--amber-muted)", color: "oklch(0.52 0.13 65)" }
                  : t.priority === "medium"
                  ? { background: "var(--teal-muted)", color: "var(--teal)" }
                  : { background: "var(--secondary)", color: "var(--muted-foreground)" };

              return (
                <TableRow
                  key={t.id}
                  className="table-row-hover transition-colors group"
                  style={{ borderColor: "var(--border)", background: overdue ? "oklch(0.48 0.21 25 / 4%)" : undefined }}
                >
                  {/* Complete toggle */}
                  <TableCell>
                    <button
                      onClick={() => handleToggleComplete(t)}
                      disabled={togglingId === t.id || t.status === "completed"}
                      title="Marcar completada"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 text-transparent hover:text-emerald-600 hover:border-emerald-400 transition-colors disabled:opacity-40"
                      style={{ borderColor: t.status === "completed" ? "var(--teal)" : "var(--border)" }}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                    </button>
                  </TableCell>

                  <TableCell>
                    <p className={`font-sans font-medium text-sm ${t.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {t.title}
                    </p>
                    {t.description && (
                      <p className="font-sans text-xs text-muted-foreground truncate max-w-xs mt-0.5">{t.description}</p>
                    )}
                  </TableCell>

                  <TableCell>
                    {contact ? (
                      <span className="font-sans text-sm text-foreground">
                        {contact.first_name} {contact.last_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {due ? (
                      <span
                        className="flex items-center gap-1 font-mono text-xs"
                        style={{
                          color: overdue ? "var(--red)" : dueToday ? "var(--amber)" : "var(--foreground)",
                          fontWeight: (overdue || dueToday) ? 600 : 400,
                        }}
                      >
                        <Clock className="w-3 h-3" />
                        {format(due, "dd MMM yyyy", { locale: es })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sin fecha</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-semibold"
                      style={priorityStyle}
                    >
                      <Flag className="w-2.5 h-2.5" />
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="font-sans text-sm text-muted-foreground">{STATUS_LABELS[t.status]}</span>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(t)}
                        title="Editar"
                        className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={deletingId === t.id}
                        title="Eliminar"
                        className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TaskSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={editTask}
        onSaved={handleSaved}
      />
    </>
  );
}
