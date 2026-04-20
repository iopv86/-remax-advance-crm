import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { TasksClient } from "./tasks-client";
import type { Task } from "@/lib/types";
import { startOfDay, isAfter, parseISO, isToday } from "date-fns";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    priority?: string;
    status?: string;
    view?: string;
    month?: string;
    gcal?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const session = await getSessionAgent();

  // Fetch tasks
  let query = supabase
    .from("tasks")
    .select(
      "id, agent_id, contact_id, deal_id, title, description, due_date, priority, status, is_automated, completed_at, created_at, updated_at, contact:contacts(first_name, last_name)"
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);

  if (!isPrivileged(session.role)) {
    query = query.eq("agent_id", session.agentId);
  }

  if (params.q) query = (query as typeof query).ilike("title", `%${params.q}%`);
  if (params.priority) query = (query as typeof query).eq("priority", params.priority);
  if (params.status) query = (query as typeof query).eq("status", params.status);

  // For contacts picker: agents see only their contacts; admins/managers see all
  let contactsQuery = supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!isPrivileged(session.role)) {
    contactsQuery = contactsQuery.eq("agent_id", session.agentId);
  }

  // Check if agent has Google Calendar connected
  const { data: gcalIntegration } = await supabase
    .from("agent_integrations")
    .select("id")
    .eq("agent_id", session.agentId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  const [{ data: rawTasks }, { data: rawContacts }] = await Promise.all([
    query,
    contactsQuery,
  ]);

  const tasks = (rawTasks ?? []) as unknown as Task[];
  const contacts = (rawContacts ?? []) as { id: string; first_name: string | null; last_name: string | null }[];

  // Compute stats
  const now = startOfDay(new Date());
  const pending = tasks.filter((t) => t.status === "pending").length;
  const overdue = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled" && t.due_date && !isAfter(parseISO(t.due_date), now) && !isToday(parseISO(t.due_date))
  ).length;
  const completedToday = tasks.filter(
    (t) => t.status === "completed" && t.completed_at && isToday(new Date(t.completed_at))
  ).length;
  const urgent = tasks.filter((t) => t.priority === "urgent" && t.status !== "completed").length;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="page-header animate-fade-up">
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: "-0.02em",
              color: "var(--foreground)",
            }}
          >
            Tareas
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Gestiona tus seguimientos y pendientes
          </p>
        </div>
      </div>

      {/* Client */}
      <div className="flex-1 px-4 py-5 md:p-6 animate-fade-up-1">
        <TasksClient
          tasks={tasks}
          contacts={contacts}
          stats={{ pending, overdue, completedToday, urgent }}
          initialView={params.view === "calendar" ? "calendar" : "list"}
          initialPriority={params.priority}
          initialStatus={params.status}
          initialSearch={params.q}
          initialMonth={params.month}
          gcalConnected={!!gcalIntegration}
          gcalParam={params.gcal}
        />
      </div>
    </div>
  );
}
