import { type NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

function redirectWithError(origin: string, message: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const rawType = searchParams.get("type");
  const type = (rawType ?? null) as EmailOtpType | null;
  const next = sanitizeNext(searchParams.get("next"));

  // Hash-fragment flows (#access_token=...) are browser-only — server never sees them.
  // Fall through to /auth/recover which handles them client-side.
  if (!token_hash && !code) {
    return NextResponse.redirect(`${origin}/auth/recover`);
  }

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) return redirectWithError(origin, error.message);
    if (type === "invite" || type === "recovery") {
      return NextResponse.redirect(`${origin}/auth/set-password`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    // Server-side exchangeCodeForSession works for admin-initiated invites
    // because @supabase/ssr propagates the session via Set-Cookie on the redirect.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectWithError(origin, error.message);

    const userId = data.session?.user?.id;
    if (userId) {
      const { data: agentRow } = await supabase
        .from("agents")
        .select("is_active")
        .eq("id", userId)
        .maybeSingle();
      if (agentRow && agentRow.is_active === false) {
        return NextResponse.redirect(`${origin}/auth/set-password`);
      }
    }

    if (type === "recovery" || type === "invite") {
      return NextResponse.redirect(`${origin}/auth/set-password`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  return redirectWithError(origin, "Enlace inválido o expirado");
}
