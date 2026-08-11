/**
 * Single access layer for the Meta Graph endpoints used by lead ingestion.
 *
 * Shared by the poller (/api/cron/lead-poll) and the reconciler
 * (/api/cron/lead-audit) on purpose: if both read the same edge with the same
 * token, a permission or token regression cannot blind the poller while leaving
 * the auditor falsely green. They fail together, and the auditor is the one
 * that reports it.
 *
 * Note: GET /<ad_id>/leads is NOT usable here -- the available user token
 * returns "(#100) Requires pages_manage_ads or leads_retrieval". The page token
 * derived from /me/accounts reads /<form_id>/leads successfully, which is the
 * path used throughout.
 */

import type { FieldData } from "@/lib/meta-leads";

export const GRAPH_VERSION = "v19.0";

/** Pagination cap per form, so one huge backlog cannot outrun the function budget. */
const MAX_PAGES_PER_FORM = 20;

/** Meta object ids are numeric strings. Anything else is not trusted into a filter. */
export function isMetaId(v: unknown): v is string {
  return typeof v === "string" && /^\d{1,32}$/.test(v);
}

export interface GraphResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

/**
 * `ok` distinguishes "the read failed" from "the read succeeded and was empty".
 * The old code could not tell those apart, and that ambiguity is exactly what
 * let the watermark advance over windows that were never actually read.
 */
/** Strip any access_token the caller (or a Meta pagination cursor) put in the URL. */
function stripToken(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("access_token");
    return u.toString();
  } catch {
    return url;
  }
}

export async function graphGet<T>(
  url: string,
  token: string,
  timeoutMs = 8000,
): Promise<GraphResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The token goes in the Authorization header, NEVER the query string.
    // Sentry's automatic fetch instrumentation records the raw query string as
    // `http.query` on every outgoing-request breadcrumb, with no redaction, so a
    // token in the URL is a token shipped to Sentry on the next captured error.
    // Meta accepts header auth on these leadgen edges (see lead-webhook route).
    const res = await fetch(stripToken(url), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.error(`[meta-graph] ${res.status} on ${url.split("?")[0]}`);
      return { ok: false, status: res.status, data: null };
    }
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch (e) {
    // A thrown fetch (DNS, reset, abort) is a failed read, not an empty one.
    console.error("[meta-graph] fetch error:", (e as Error).message);
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

interface AccountRow {
  id: string;
  access_token: string;
}

/**
 * Page access token for `pageId` SPECIFICALLY.
 *
 * Returns null on ANY failure and never falls back to the user token: the user
 * token returns [] for leadgen_forms, so falling back turns a token blip into
 * "there are no forms", which used to skip the whole window silently.
 * Selecting by id (not data[0]) also removes the latent break the day a second
 * page is added to the business account.
 */
export async function getPageToken(userToken: string, pageId: string): Promise<string | null> {
  const res = await graphGet<{ data: AccountRow[] }>(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,access_token&limit=100`,
    userToken,
  );
  if (!res.ok || !res.data) return null;
  const match = (res.data.data ?? []).find((a) => a.id === pageId);
  if (!match?.access_token) {
    console.error(`[meta-graph] page ${pageId} not present in /me/accounts`);
    return null;
  }
  return match.access_token;
}

export interface FormRow {
  id: string;
  status?: string;
  name?: string;
}

/** null means the read FAILED. [] means the read succeeded and there are no ACTIVE forms. */
export async function listActiveForms(
  pageToken: string,
  pageId: string,
): Promise<FormRow[] | null> {
  const res = await graphGet<{ data: FormRow[] }>(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/leadgen_forms?fields=id,status,name&limit=100`,
    pageToken,
  );
  if (!res.ok || !res.data) return null;
  return (res.data.data ?? []).filter((f) => f.status === "ACTIVE" || !f.status);
}

export interface LeadRow {
  id: string;
  created_time?: string;
  field_data?: FieldData[];
  campaign_id?: string;
  ad_id?: string;
  form_id?: string;
  platform?: string;
}

interface LeadsResp {
  data: LeadRow[];
  paging?: { next?: string };
}

/**
 * Every lead on `formId` created after `sinceUnix`, following pagination.
 * `ok:false` means at least one page failed; `leads` still holds whatever was
 * read, so the caller can ingest those and still refuse to advance the watermark.
 */
export async function fetchFormLeads(
  pageToken: string,
  formId: string,
  sinceUnix: number,
): Promise<{ ok: boolean; leads: LeadRow[] }> {
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]),
  );
  let url: string | null =
    `https://graph.facebook.com/${GRAPH_VERSION}/${formId}/leads` +
    `?fields=id,created_time,field_data,campaign_id,ad_id,form_id,platform` +
    `&filtering=${filtering}&limit=100`;

  const leads: LeadRow[] = [];
  let pages = 0;
  while (url) {
    // Bounded: the caller runs inside a 60s function budget, and an unbounded
    // cursor walk would be SIGKILLed mid-loop -- which skips the watermark
    // decision entirely and livelocks the poller on an ever-growing window.
    // Returning ok:false instead makes it a counted graphError and keeps the
    // watermark pinned deliberately rather than by accident.
    if (pages >= MAX_PAGES_PER_FORM) {
      console.error(`[meta-graph] form ${formId} exceeded ${MAX_PAGES_PER_FORM} pages; truncating`);
      return { ok: false, leads };
    }
    pages++;
    // The cursor URL carries its own access_token; graphGet strips it and sends
    // the header instead, so the token never reaches Sentry's http.query.
    const page: GraphResult<LeadsResp> = await graphGet<LeadsResp>(url, pageToken);
    if (!page.ok || !page.data) return { ok: false, leads };
    leads.push(...(page.data.data ?? []));
    // Only follow Graph-hosted cursors (defensive against a tampered next URL).
    const next = page.data.paging?.next ?? null;
    url = next && next.startsWith("https://graph.facebook.com/") ? next : null;
  }
  return { ok: true, leads };
}
