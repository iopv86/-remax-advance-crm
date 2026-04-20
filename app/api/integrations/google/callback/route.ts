import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/integrations/google/callback
// Handles OAuth callback, exchanges code for tokens, stores in agent_integrations.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/tasks?gcal=error`
    );
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://remax-advance-crm.vercel.app"}/api/integrations/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/tasks?gcal=not_configured`
    );
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/tasks?gcal=error`
    );
  }

  const tokens = await tokenRes.json();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`);

  const { data: agent } = await supabase.from("agents").select("id").eq("email", user.email!).maybeSingle();
  if (!agent) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/tasks?gcal=error`);

  const { error: upsertError } = await supabase.from("agent_integrations").upsert({
    agent_id:      agent.id,
    provider:      "google_calendar",
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry:  tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
  }, { onConflict: "agent_id,provider" });

  if (upsertError) {
    console.error("[GCal callback] upsert error:", upsertError.message, upsertError.code);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/tasks?gcal=error`
    );
  }

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/tasks?gcal=connected`
  );
}
