import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/integrations/google/sync
// Creates a Google Calendar event for a given task id.
// Body: { task_id: string }
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { task_id } = await request.json();
  if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });

  const { data: agent } = await supabase.from("agents").select("id").eq("email", user.email!).maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: integration } = await supabase
    .from("agent_integrations")
    .select("access_token, token_expiry")
    .eq("agent_id", agent.id)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (!integration?.access_token) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 412 });
  }

  const { data: task } = await supabase.from("tasks").select("*").eq("id", task_id).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // TODO: create Calendar event via Google Calendar API
  // POST https://www.googleapis.com/calendar/v3/calendars/primary/events
  // Then store gcal_event_id back on the task

  return NextResponse.json({ message: "Google Calendar sync stub — connected, implementation pending." });
}
