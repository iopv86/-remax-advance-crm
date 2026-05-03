import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GCAL_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

// POST /api/integrations/google/sync
// Body: { task_id: string }
// Creates or updates a Google Calendar event for the given task.
// Stores the gcal_event_id back on the task row.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 60 sync ops per minute per user
  const rl = await checkRateLimit(`gcal-sync:${user.id}`, 60, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  let body: { task_id?: string };
  try { body = await request.json(); } catch { body = {}; }

  const { task_id } = body;
  if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });
  if (!UUID_RE.test(task_id)) return NextResponse.json({ error: "task_id inválido" }, { status: 400 });

  // Fetch the agent
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("email", user.email!)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  // Fetch the task (verify ownership)
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, description, due_date, gcal_event_id, agent_id")
    .eq("id", task_id)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (task.agent_id !== agent.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch integration tokens
  const { data: integration } = await supabase
    .from("agent_integrations")
    .select("access_token, refresh_token, token_expiry")
    .eq("agent_id", agent.id)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (!integration?.access_token) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 412 });
  }

  // Refresh token if expired (with 60s buffer)
  let accessToken = integration.access_token;
  if (
    integration.refresh_token &&
    integration.token_expiry &&
    new Date(integration.token_expiry).getTime() - 60_000 < Date.now()
  ) {
    const refreshed = await refreshAccessToken(integration.refresh_token);
    if (refreshed) {
      accessToken = refreshed;
      await supabase.from("agent_integrations").update({
        access_token: refreshed,
        token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
      }).eq("agent_id", agent.id).eq("provider", "google_calendar");
    }
  }

  // Build event payload
  const dueDate = task.due_date ? new Date(task.due_date) : new Date();
  const endDate  = new Date(dueDate.getTime() + 60 * 60 * 1000); // +1h

  const eventPayload = {
    summary:     task.title,
    description: task.description ?? undefined,
    start: { dateTime: dueDate.toISOString(), timeZone: "America/Santo_Domingo" },
    end:   { dateTime: endDate.toISOString(),  timeZone: "America/Santo_Domingo" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
  };

  let gcalEventId: string;

  if (task.gcal_event_id) {
    // Update existing event
    const res = await fetch(`${GCAL_EVENTS_URL}/${task.gcal_event_id}`, {
      method:  "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify(eventPayload),
    });
    if (res.status === 404) {
      // Event was deleted externally — create a new one
      const create = await fetch(GCAL_EVENTS_URL, {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(eventPayload),
      });
      if (!create.ok) {
        console.error("[GCal] create failed:", (await create.text()).slice(0, 500));
        return NextResponse.json({ error: "GCal create failed" }, { status: 502 });
      }
      const created = await create.json();
      gcalEventId = created.id;
    } else if (!res.ok) {
      console.error("[GCal] update failed:", (await res.text()).slice(0, 500));
      return NextResponse.json({ error: "GCal update failed" }, { status: 502 });
    } else {
      gcalEventId = task.gcal_event_id;
    }
  } else {
    // Create new event
    const res = await fetch(GCAL_EVENTS_URL, {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify(eventPayload),
    });
    if (!res.ok) {
      console.error("[GCal] create failed:", (await res.text()).slice(0, 500));
      return NextResponse.json({ error: "GCal create failed" }, { status: 502 });
    }
    const created = await res.json();
    gcalEventId = created.id;
  }

  // Store event id back on task
  await supabase.from("tasks").update({
    gcal_event_id:  gcalEventId,
    gcal_synced_at: new Date().toISOString(),
  }).eq("id", task_id);

  return NextResponse.json({ gcal_event_id: gcalEventId, synced: true });
}

// DELETE /api/integrations/google/sync?task_id=xxx
// Removes the GCal event and clears gcal_event_id on the task.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl2 = await checkRateLimit(`gcal-sync:${user.id}`, 60, 60_000);
  if (!rl2.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get("task_id");
  if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });
  if (!UUID_RE.test(task_id)) return NextResponse.json({ error: "task_id inválido" }, { status: 400 });

  const { data: agent } = await supabase.from("agents").select("id").eq("email", user.email!).maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: task } = await supabase
    .from("tasks").select("gcal_event_id, agent_id").eq("id", task_id).maybeSingle();
  if (!task || task.agent_id !== agent.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (task.gcal_event_id) {
    const { data: integration } = await supabase
      .from("agent_integrations")
      .select("access_token")
      .eq("agent_id", agent.id)
      .eq("provider", "google_calendar")
      .maybeSingle();

    if (integration?.access_token) {
      await fetch(`${GCAL_EVENTS_URL}/${task.gcal_event_id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${integration.access_token}` },
      });
    }
  }

  await supabase.from("tasks").update({ gcal_event_id: null, gcal_synced_at: null }).eq("id", task_id);

  return NextResponse.json({ removed: true });
}
