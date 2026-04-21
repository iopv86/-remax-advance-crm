import { createHash } from "crypto";

const CAPI_VERSION = "v19.0";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// Pipeline stage → Meta standard event
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

export interface CapiEventOptions {
  stage: string;
  email?: string | null;
  phone?: string | null;
  dealValue?: number | null;
  currency?: string | null;
}

export async function fireCapiEvent(opts: CapiEventOptions): Promise<void> {
  const pixelId = process.env.META_PIXEL_ID;
  const token   = process.env.META_ACCESS_TOKEN;
  if (!pixelId || !token) return;

  const eventName = STAGE_EVENTS[opts.stage];
  if (!eventName) return;

  const userData: Record<string, string[]> = {};
  if (opts.email) userData.em = [sha256(opts.email)];
  if (opts.phone) userData.ph = [sha256(opts.phone.replace(/\D/g, ""))];

  const event: Record<string, unknown> = {
    event_name:    eventName,
    event_time:    Math.floor(Date.now() / 1000),
    user_data:     userData,
    action_source: "other",
  };

  if (eventName === "Purchase" && opts.dealValue) {
    event.custom_data = {
      value:    opts.dealValue,
      currency: opts.currency ?? "USD",
    };
  }

  const url = `https://graph.facebook.com/${CAPI_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${token}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ data: [event] }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Meta CAPI] event=${eventName} stage=${opts.stage} status=${res.status}`, err.slice(0, 200));
  }
}
