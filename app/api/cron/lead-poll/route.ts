import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { processLead, GRAPH_VERSION, type LeadFormData } from "@/lib/meta-leads";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const PAGE_ID = process.env.META_PAGE_ID ?? "513362528519585"; // RE/MAX Advance - R.D.
const LOOKBACK_MS = 60 * 60 * 1000; // first run / fallback window: 1h

interface FormRow { id: string; status?: string; name?: string }
interface LeadRow { id: string; created_time?: string; field_data?: { name: string; values: string[] }[]; campaign_id?: string; ad_id?: string; form_id?: string; platform?: string }
interface LeadsResp { data: LeadRow[]; paging?: { next?: string } }

async function graphGet<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    console.error(`[lead-poll] Graph ${res.status}: ${url.split("?")[0]}`);
    return null;
  }
  return res.json() as Promise<T>;
}

// GET /api/cron/lead-poll
// Vercel cron — PULLS new Meta Lead-Form leads via the Graph API and ingests them.
// This bypasses the push-webhook lead-access requirement: retrieval uses our own
// page-admin token (which has leads_retrieval), so leads flow without Lead Access Manager.
// Auth: Authorization: Bearer {CRON_SECRET}
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !safeCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userToken = process.env.META_ACCESS_TOKEN;
  if (!userToken) return NextResponse.json({ error: "META_ACCESS_TOKEN not set" }, { status: 503 });

  // Listing a page's leadgen_forms requires a PAGE access token (the user token returns []).
  // Derive it from the user token; fall back to the user token for lead reads.
  const accts = await graphGet<{ data: { access_token: string }[] }>(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=access_token&access_token=${userToken}`
  );
  const token = accts?.data?.[0]?.access_token ?? userToken;

  const db = adminClient();

  // Watermark (unix seconds). Default: now - 1h on first run.
  const { data: wmRow } = await db.from("agency_config").select("value").eq("key", "lead_poll_last_ts").maybeSingle();
  const watermarkMs = wmRow?.value ? new Date(wmRow.value as string).getTime() : Date.now() - LOOKBACK_MS;
  const sinceUnix = Math.floor(watermarkMs / 1000);
  const startedAt = new Date().toISOString();

  // Active lead forms for the page
  const formsResp = await graphGet<{ data: FormRow[] }>(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/leadgen_forms?fields=id,status,name&limit=100&access_token=${token}`
  );
  const forms = (formsResp?.data ?? []).filter((f) => f.status === "ACTIVE" || !f.status);

  const filtering = encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]));
  let seen = 0, created = 0, errors = 0;

  for (const form of forms) {
    let url: string | null =
      `https://graph.facebook.com/${GRAPH_VERSION}/${form.id}/leads` +
      `?fields=id,created_time,field_data,campaign_id,ad_id,form_id,platform&filtering=${filtering}&limit=100&access_token=${token}`;
    while (url) {
      const page: LeadsResp | null = await graphGet<LeadsResp>(url);
      if (!page) { errors++; break; }
      for (const l of page.data ?? []) {
        seen++;
        const lead: LeadFormData = {
          id: l.id,
          field_data: l.field_data ?? [],
          campaign_id: l.campaign_id,
          ad_id: l.ad_id,
          form_id: l.form_id ?? form.id,
          platform: l.platform,
        };
        try {
          const r = await processLead(db, lead, form.name ?? null);
          if (r.created) created++;
        } catch (e) {
          errors++;
          console.error("[lead-poll] processLead error:", (e as Error).message);
        }
      }
      // Only follow Graph-hosted pagination cursors (defensive against a tampered next URL).
      const nextUrl: string | null = page.paging?.next ?? null;
      url = nextUrl && nextUrl.startsWith("https://graph.facebook.com/") ? nextUrl : null;
    }
  }

  // Advance the watermark to the start of this run (safe overlap handled by dedup)
  await db.from("agency_config").upsert({ key: "lead_poll_last_ts", value: startedAt }, { onConflict: "key" });

  console.log(`[lead-poll] forms=${forms.length} seen=${seen} created=${created} errors=${errors} since=${sinceUnix}`);
  return NextResponse.json({ ok: true, forms: forms.length, seen, created, errors, since: startedAt });
}
