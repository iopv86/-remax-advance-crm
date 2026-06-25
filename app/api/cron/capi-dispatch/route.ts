import { timingSafeEqual } from "crypto";
import { adminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { dispatchCapiOutbox } from "@/lib/meta-capi";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// GET /api/cron/capi-dispatch
// Vercel cron — drains the capi_outbox and POSTs pending events to Meta CAPI.
// Auth: Authorization: Bearer {CRON_SECRET} (Vercel injects this for cron jobs).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !safeCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminClient();
  const result = await dispatchCapiOutbox(db, 25);
  return NextResponse.json({ ok: true, ...result });
}
