import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Task } from "@/lib/types";
import { format, isPast, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { CheckSquare, Clock } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

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

export default async function TasksPage() {
  const supabase = await createClient();

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, title, description, due_date, priority, status, created_at, contact:contacts(first_name, last_name)"
    )
    .not("status", "in", '("completed","cancelled")')
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(100);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tareas</h1>
        <p className="text-sm text-gray-500 mt-1">{tasks?.length ?? 0} tareas pendientes</p>
      </div>

      {((tasks as unknown as Task[]) ?? []).length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay tareas pendientes.</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarea</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tasks as unknown as Task[]).map((t) => {
                const contact = t.contact as { first_name?: string; last_name?: string } | null;
                const due = t.due_date ? new Date(t.due_date) : null;
                const overdue = due && isPast(due) && !isToday(due);
                const dueToday = due && isToday(due);
                return (
                  <TableRow key={t.id} className={overdue ? "bg-red-50/50" : undefined}>
                    <TableCell>
                      <p className="text-sm font-medium text-gray-900">{t.title}</p>
                      {t.description && (
                        <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{t.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact ? (
                        <span className="text-sm text-gray-600">
                          {contact.first_name} {contact.last_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {due ? (
                        <span
                          className={`flex items-center gap-1 text-sm ${
                            overdue ? "text-red-600 font-medium" : dueToday ? "text-orange-500 font-medium" : "text-gray-600"
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {format(due, "dd MMM yyyy", { locale: es })}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Sin fecha</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${PRIORITY_COLORS[t.priority]}`}>
                        {PRIORITY_LABELS[t.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">{STATUS_LABELS[t.status]}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
