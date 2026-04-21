import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// GET /api/integrations/google/auth
// Redirects the authenticated agent to Google OAuth consent screen.
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/login`);

  // Rate limit: 5 OAuth initiations per minute per user
  const rl = await checkRateLimit(`gcal-auth:${user.id}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/dashboard/tasks?gcal=rate_limited`);
  }

  const clientId  = process.env.GOOGLE_CLIENT_ID;
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const redirectUri = `${appOrigin}/api/integrations/google/callback`;

  if (!clientId) {
    return NextResponse.redirect(`${appOrigin}/dashboard/tasks?gcal=not_configured`);
  }

  // Generate CSRF state token and store in short-lived cookie
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("gcal_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 300, // 5 minutes
    path: "/",
    sameSite: "lax",
  });

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/calendar.events",
    access_type:   "offline",
    prompt:        "consent",
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

// DELETE /api/integrations/google/auth
// Removes the Google Calendar integration for the current agent.
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase.from("agents").select("id").eq("email", user.email!).maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  await supabase
    .from("agent_integrations")
    .delete()
    .eq("agent_id", agent.id)
    .eq("provider", "google_calendar");

  return NextResponse.json({ disconnected: true });
}
