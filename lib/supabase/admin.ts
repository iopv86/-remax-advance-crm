import { createServerClient } from "@supabase/ssr";

let _admin: ReturnType<typeof createServerClient> | null = null;

/**
 * Service-role Supabase client — bypasses RLS.
 * Use ONLY in server-side routes that handle trusted server-to-server calls
 * (e.g. Meta webhook, cron jobs). Never expose to the browser.
 */
export function adminClient() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role env vars");
  _admin = createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
  return _admin;
}
