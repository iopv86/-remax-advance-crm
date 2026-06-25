import { createHash } from "crypto";
import { adminClient } from "@/lib/supabase/admin";

// v23.0: the CTWA fields used below (action_source "business_messaging",
// user_data.ctwa_clid, messaging_channel) are recent CAPI additions; an older
// events endpoint can reject them. The insights/lead-enrichment paths stay on
// their own version — they work and are out of scope here.
export const CAPI_VERSION = "v23.0";

type Db = ReturnType<typeof adminClient>;

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// Pipeline stage → Meta standard event. closed_lost is handled specially (a
// standard Lead with value:0 + disqualified status — see buildCapiEvent).
const STAGE_EVENTS: Partial<Record<string, string>> = {
  lead_captured:     "Lead",
  qualified:         "Lead",
  showing_scheduled: "ViewContent",
  showing_done:      "ViewContent",
  offer_made:        "InitiateCheckout",
  negotiation:       "InitiateCheckout",
  promesa_de_venta:  "InitiateCheckout",
  closed_won:        "Purchase",
};

export interface EnqueueCapiInput {
  stage: string;                 // pipeline stage, or "closed_lost" for the negative signal
  dealId: string | null;         // event_id base (preferred)
  contactId?: string | null;
  email?: string | null;
  phone?: string | null;
  ctwaClid?: string | null;      // raw click-to-WhatsApp token (contacts.ctwa_clid)
  dealValue?: number | null;
  currency?: string | null;
}

interface BuiltEvent {
  eventId: string;
  eventName: string;
  actionSource: string;
  payload: Record<string, unknown>;
}

/**
 * Pure builder: turns an enqueue input into the single Graph event object + its
 * deterministic event_id. Two payload shapes:
 *   - CTWA contacts (ctwa_clid present): action_source "business_messaging",
 *     messaging_channel "whatsapp", user_data.ctwa_clid (raw token) + page_id.
 *   - Web/CRM contacts: action_source "other".
 * Returns null when the stage maps to no event.
 */
function buildCapiEvent(input: EnqueueCapiInput): BuiltEvent | null {
  const isClosedLost = input.stage === "closed_lost";
  const eventName = isClosedLost ? "Lead" : STAGE_EVENTS[input.stage];
  if (!eventName) return null;

  const userData: Record<string, string | string[]> = {};
  if (input.email) userData.em = [sha256(input.email)];
  if (input.phone) userData.ph = [sha256(input.phone.replace(/\D/g, ""))];

  const ctwaClid = input.ctwaClid?.trim() || null;
  const isCtwa = !!ctwaClid;
  let actionSource = "other";
  if (isCtwa) {
    actionSource = "business_messaging";
    // Raw token goes in the dedicated user_data.ctwa_clid field (NOT fbc-wrapped).
    userData.ctwa_clid = ctwaClid!;
    // page_id is REQUIRED alongside ctwa_clid for CTWA attribution.
    const pageId = process.env.META_PAGE_ID || "513362528519585";
    if (pageId) userData.page_id = pageId;
  }

  const event: Record<string, unknown> = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data:     userData,
  };
  if (isCtwa) event.messaging_channel = "whatsapp";

  if (isClosedLost) {
    // D3: negative signal = standard Lead carrying zero value + disqualified status.
    event.custom_data = {
      value:             0,
      currency:          input.currency ?? "USD",
      lead_event_status: "disqualified",
    };
  } else if (eventName === "Purchase" && input.dealValue) {
    event.custom_data = { value: input.dealValue, currency: input.currency ?? "USD" };
  }

  // Deterministic event_id keyed on the STAGE transition (NOT the Meta event
  // name): distinct stages can map to the same event name (lead_captured &
  // qualified → Lead; the two ViewContent stages; the three InitiateCheckout
  // stages; closed_lost's disqualified Lead). Keying on event name would make
  // the outbox unique constraint silently drop the second one. Re-entering the
  // same stage on a deal dedups (idempotent retry).
  const base = input.dealId ?? input.contactId ?? "nodeal";
  const eventId = `${base}:${input.stage}`;
  event.event_id = eventId;

  return { eventId, eventName, actionSource, payload: event };
}

/**
 * Enqueue a CAPI event into capi_outbox (durable; drained by /api/cron/capi-dispatch).
 * MUST be called with the service-role client (adminClient) — the outbox is RLS deny-all.
 * Never throws; a duplicate event_id (23505) is treated as already-enqueued.
 */
export async function enqueueCapiEvent(db: Db, input: EnqueueCapiInput): Promise<void> {
  const built = buildCapiEvent(input);
  if (!built) return;
  try {
    const { error } = await db.from("capi_outbox").insert({
      event_id:      built.eventId,
      event_name:    built.eventName,
      action_source: built.actionSource,
      contact_id:    input.contactId ?? null,
      deal_id:       input.dealId ?? null,
      payload:       built.payload,
    });
    if (error && error.code !== "23505") {
      console.error("[meta-capi] enqueue error:", error.message);
    }
  } catch (e) {
    console.error("[meta-capi] enqueue exception:", (e as Error).message);
  }
}

/** Resolve the pixel/dataset id: env first, then agency_config (where it actually lives). */
async function resolvePixelId(db: Db): Promise<string | null> {
  const env = process.env.META_PIXEL_ID;
  if (env) return env;
  try {
    const { data } = await db
      .from("agency_config").select("value").eq("key", "meta_pixel_id").maybeSingle();
    const value = (data as { value?: string } | null)?.value;
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

// Total dispatch attempts (first send + retries) before a row is marked failed.
const MAX_ATTEMPTS = 5;

async function markRetry(db: Db, rowId: string, attempts: number, err: string): Promise<void> {
  const next = attempts + 1;
  if (next >= MAX_ATTEMPTS) {
    await db.from("capi_outbox").update({ status: "failed", attempts: next, last_error: err }).eq("id", rowId);
  } else {
    const backoffMin = Math.min(2 ** next, 60); // 2,4,8,16 min … capped at 60
    const nextAttemptAt = new Date(Date.now() + backoffMin * 60_000).toISOString();
    await db.from("capi_outbox")
      .update({ attempts: next, last_error: err, next_attempt_at: nextAttemptAt })
      .eq("id", rowId);
  }
}

/**
 * Drain pending outbox rows and POST them to Meta. Used by the cron route.
 * Marks rows sent / schedules retries with backoff / fails after MAX_ATTEMPTS.
 */
export async function dispatchCapiOutbox(
  db: Db,
  batchSize = 25,
): Promise<{ sent: number; failed: number; skipped?: string }> {
  const token = process.env.META_ACCESS_TOKEN;
  const pixelId = await resolvePixelId(db);
  if (!token || !pixelId) {
    console.error("[meta-capi] dispatch skipped: missing META_ACCESS_TOKEN or pixel id");
    return { sent: 0, failed: 0, skipped: "missing_config" };
  }

  const { data: rows, error } = await db
    .from("capi_outbox")
    .select("id, payload, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    console.error("[meta-capi] dispatch query error:", error.message);
    return { sent: 0, failed: 0, skipped: "query_error" };
  }
  if (!rows || rows.length === 0) return { sent: 0, failed: 0 };

  const url = `https://graph.facebook.com/${CAPI_VERSION}/${encodeURIComponent(pixelId)}/events`;
  let sent = 0, failed = 0;

  for (const row of rows as Array<{ id: string; payload: unknown; attempts: number }>) {
    // Per-row 8s budget: a hung Meta connection must not stall the whole batch.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ data: [row.payload] }),
        signal:  controller.signal,
      });
      if (res.ok) {
        await db.from("capi_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
        sent++;
      } else {
        const errText = (await res.text().catch(() => "")).slice(0, 300);
        await markRetry(db, row.id, row.attempts ?? 0, `${res.status}: ${errText}`);
        failed++;
      }
    } catch (e) {
      await markRetry(db, row.id, row.attempts ?? 0, (e as Error).message.slice(0, 300));
      failed++;
    } finally {
      clearTimeout(timer);
    }
  }

  return { sent, failed };
}
