import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Generate per-request nonce for Content-Security-Policy
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com",
    "media-src 'self' https:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");

  // Forward nonce to server components via request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protect /dashboard/* routes
  if (!user && pathname.startsWith("/dashboard")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protect API routes (except /api/ava which uses its own secret-header auth)
  const protectedApiPrefixes = [
    "/api/messages",
    "/api/pdf",
    "/api/market-insights",
    "/api/contacts",
    "/api/proposals",
    "/api/agents",
    "/api/auth/sign-out",
  ];
  if (!user && protectedApiPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  supabaseResponse.headers.set("Content-Security-Policy", csp);

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
