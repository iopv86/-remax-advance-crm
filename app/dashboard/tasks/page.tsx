import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";
import { CheckSquare } from "lucide-react";
import { TasksTable } from "./tasks-table";

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
    <div className="flex flex-col min-h-screen bg-background">
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Actividades
            </p>
            <h1
              style={{
                fontFamily: "var(--font-playfair),Georgia,serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                lineHeight: 1.1,
              }}
            >
              Tareas
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-amber-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm backdrop-blur">
            <CheckSquare className="h-3.5 w-3.5" />
            {tasks?.length ?? 0} pendientes
          </div>
        </div>
      </div>

      <div className="p-7 animate-fade-up-1">
        <TasksTable tasks={(tasks as unknown as Task[]) ?? []} />
      </div>
    </div>
  );
}
