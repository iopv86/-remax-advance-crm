import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required for SSR auth to stay in sync
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protect all /dashboard/* routes
  if (!user && pathname.startsWith("/dashboard")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protect internal API routes that require a logged-in user
  // /api/ava is excluded: it is called by the external Python WhatsApp agent,
  // which authenticates via x-ava-secret header (checked inside the route handler).
  const protectedApiPrefixes = ["/api/messages", "/api/pdf"];
  if (!user && protectedApiPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (Next.js static files)
     * - _next/image   (Next.js image optimization)
     * - favicon.ico
     * - public static assets
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
