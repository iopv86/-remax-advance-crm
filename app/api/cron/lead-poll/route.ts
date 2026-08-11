import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { processLead, type LeadFormData } from "@/lib/meta-leads";
import { getPageToken, listActiveForms, fetchFormLeads } from "@/lib/meta-graph";
import { computeScanWindow, shouldAdvanceWatermark } from "@/lib/lead-poll-watermark";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const PAGE_ID = process.env.META_PAGE_ID ?? "513362528519585"; // RE/MAX Advance - R.D.

// GET /api/cron/lead-poll
// Vercel cron (every minute) -- PULLS new Meta Lead-Form leads via the Graph API
// and ingests them. Retrieval uses a page token derived from /me/accounts, which
// carries leads_retrieval, so leads flow without Lead Access Manager.
//
// The watermark is FAIL-CLOSED: it only advances when the run actually saw the
// whole window. Any failure leaves it where it was so the next run re-reads the
// same window, which is safe because processLead is idempotent. See
// lib/lead-poll-watermark.ts for the defect this replaced.
//
// Auth: Authorization: Bearer {CRON_SECRET}
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !safeCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userToken = process.env.META_ACCESS_TOKEN;
  if (!userToken) return NextResponse.json({ error: "META_ACCESS_TOKEN not set" }, { status: 503 });

  const db = adminClient();
  const startedAt = new Date().toISOString();

  const { data: wmRow } = await db
    .from("agency_config").select("value").eq("key", "lead_poll_last_ts").maybeSingle();
  const win = computeScanWindow(wmRow?.value as string | undefined, Date.now());
  const sinceUnix = Math.floor(win.sinceMs / 1000);

  // No fallback to the user token: it returns [] for leadgen_forms, which would
  // masquerade as "no forms" and skip the window.
  const pageToken = await getPageToken(userToken, PAGE_ID);
  const tokenOk = pageToken !== null;

  let formsOk = false;
  let seen = 0, created = 0, noAgent = 0, graphErrors = 0;
  let formCount = 0;

  if (pageToken) {
    const forms = await listActiveForms(pageToken, PAGE_ID);
    formsOk = forms !== null;
    formCount = forms?.length ?? 0;

    for (const form of forms ?? []) {
      const { ok, leads } = await fetchFormLeads(pageToken, form.id, sinceUnix);
      if (!ok) graphErrors++;
      // Ingest whatever was read even on a partial failure -- the watermark stays
      // pinned regardless, so the rest is picked up next run.
      for (const l of leads) {
        seen++;
        const lead: LeadFormData = {
          id: l.id,
          field_data: l.field_data ?? [],
          campaign_id: l.campaign_id,
          ad_id: l.ad_id,
          form_id: l.form_id ?? form.id,
          platform: l.platform,
          created_time: l.created_time,
        };
        try {
          const r = await processLead(db, lead, form.name ?? null, "poll");
          if (r.created) created++;
          if (r.reason === "no_agent") noAgent++;
        } catch (e) {
          graphErrors++;
          console.error("[lead-poll] processLead threw for lead", l.id, ":", (e as Error).message);
        }
      }
    }
  }

  const advanced = shouldAdvanceWatermark({ tokenOk, formsOk, graphErrors, noAgent });
  if (advanced) {
    await db.from("agency_config").upsert(
      { key: "lead_poll_last_ts", value: startedAt }, { onConflict: "key" },
    );
  } else {
    console.error(
      `[lead-poll] watermark PINNED: tokenOk=${tokenOk} formsOk=${formsOk} ` +
      `graphErrors=${graphErrors} noAgent=${noAgent}`,
    );
  }
  if (noAgent > 0) console.error(`[lead-poll] ${noAgent} lead(s) had no agent to assign`);
  // Pinned past the 24h floor: the window is being truncated and leads can be
  // dropped again. This is the one state that needs a human.
  if (win.clamped) console.error("[lead-poll] scan window CLAMPED at 24h -- watermark pinned too long");

  console.log(
    `[lead-poll] forms=${formCount} seen=${seen} created=${created} ` +
    `noAgent=${noAgent} graphErrors=${graphErrors} advanced=${advanced} since=${sinceUnix}`,
  );

  // Every counter that gates the upsert is in the body, so a curl is a real
  // observation rather than a bare ok:true.
  return NextResponse.json({
    ok: advanced,
    advanced,
    tokenOk,
    formsOk,
    forms: formCount,
    seen,
    created,
    noAgent,
    graphErrors,
    firstRun: win.firstRun,
    clamped: win.clamped,
    since: new Date(win.sinceMs).toISOString(),
  });
}
