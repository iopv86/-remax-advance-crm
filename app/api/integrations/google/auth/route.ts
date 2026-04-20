import { NextResponse } from "next/server";

// GET /api/integrations/google/auth
// Redirects the agent to Google OAuth consent screen.
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.
export async function GET() {
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://remax-advance-crm.vercel.app"}/api/integrations/google/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID not configured." },
      { status: 503 }
    );
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/calendar.events",
    access_type:   "offline",
    prompt:        "consent",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
