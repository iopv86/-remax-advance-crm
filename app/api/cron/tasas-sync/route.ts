import { timingSafeEqual } from "crypto";
import { adminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { FX_RATES_KEY, normalizeTasaRealResponse } from "@/lib/fx-rates";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const TASAREAL_URL = "https://tasareal.com/api/v1/rates?currency=USD";

// GET /api/cron/tasas-sync
// Vercel cron — runs a few times/day (see vercel.json). TasaReal free tier is
// 50 req/day, so this NEVER runs on page load; the dashboard reads the cached
// snapshot from agency_config.fx_rates_usd.
// Auth: Authorization: Bearer {CRON_SECRET}.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !safeCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.TASAREAL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TASAREAL_API_KEY not configured." }, { status: 503 });
  }

  let res: Response;
  try {
    res = await fetch(TASAREAL_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    // Network/timeout — keep last good cache, surface upstream failure.
    return NextResponse.json({ error: "TasaReal request failed." }, { status: 502 });
  }

  if (res.status === 429) {
    return NextResponse.json({ error: "TasaReal rate limit reached." }, { status: 429 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: `TasaReal API error ${res.status}.` }, { status: 502 });
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return NextResponse.json({ error: "TasaReal returned invalid JSON." }, { status: 502 });
  }

  let snapshot;
  try {
    snapshot = normalizeTasaRealResponse(raw, new Date().toISOString());
  } catch (e) {
    console.error("[cron/tasas-sync] normalize error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "TasaReal payload could not be normalized." }, { status: 502 });
  }

  const supabase = adminClient();
  const { error: upsertError } = await supabase
    .from("agency_config")
    .upsert({ key: FX_RATES_KEY, value: JSON.stringify(snapshot) }, { onConflict: "key" });

  if (upsertError) {
    console.error("[cron/tasas-sync] upsert error:", upsertError.message);
    return NextResponse.json({ error: "Could not persist exchange rates." }, { status: 500 });
  }

  const remaining = res.headers.get("x-ratelimit-remaining");
  console.log(
    `[cron/tasas-sync] cached ${snapshot.count} institutions for ${snapshot.apiDate}` +
    (remaining ? ` (ratelimit remaining: ${remaining})` : "")
  );
  return NextResponse.json({
    message: "Rates cached.",
    apiDate: snapshot.apiDate,
    count: snapshot.count,
  });
}
