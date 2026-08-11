import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendAgentEmail } from "@/lib/email";
import { getPageToken, listActiveForms, fetchFormLeads, isMetaId } from "@/lib/meta-graph";
import { HEALTHY_OUTCOMES } from "@/lib/meta-lead-ledger";

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const PAGE_ID = process.env.META_PAGE_ID ?? "513362528519585";
const LOOKBACK_MS = 48 * 60 * 60 * 1000;
/** Grace period: longer than the poller's 15-minute overlap, so a lead still
 *  legitimately in flight is never reported as missing. */
const SETTLE_MS = 30 * 60 * 1000;
/** A pinned poller watermark older than this needs a human. */
const WATERMARK_STALE_MIN = 60;
/** Structural alerts repeat at most this often. Hourly repetition is how an
 *  alert channel gets muted, and a muted channel is how the last one died. */
const STRUCT_ALERT_EVERY_MS = 12 * 60 * 60 * 1000;
const MAX_IDS_IN_EMAIL = 20;

interface GapRow {
  lead_id: string;
  outcome: string;
  created_time: string | null;
}

/**
 * Rate-limited structural alert.
 *
 * The cooldown key is PER KIND. A single shared key meant that an alert about a
 * dead token could silence an unrelated alert about a pinned watermark for the
 * next 12 hours -- and since this job marks lead_audit_last_ok on every
 * completed run, the dead-man in meta-sync would report all clear the whole time.
 */
async function structuralAlert(
  db: ReturnType<typeof adminClient>,
  to: string,
  kind: string,
  reason: string,
): Promise<boolean> {
  const key = `lead_audit_struct_alert_at:${kind}`;
  const { data: row } = await db
    .from("agency_config").select("value").eq("key", key).maybeSingle();
  const last = row?.value ? new Date(row.value as string).getTime() : 0;
  if (Number.isFinite(last) && Date.now() - last < STRUCT_ALERT_EVERY_MS) return false;

  const sent = await sendAgentEmail({
    to,
    subject: "[CRM] La reconciliacion de leads no pudo ejecutarse",
    text:
      `El reconciliador de leads (/api/cron/lead-audit) no pudo completar su lectura.\n\n` +
      `Motivo: ${reason}\n\n` +
      `Mientras esto siga asi, NO hay garantia de que se detecten leads perdidos.\n` +
      `Un resultado de cero huecos en este estado no significa que no haya huecos.`,
  });
  if (sent) {
    await db.from("agency_config").upsert(
      { key, value: new Date().toISOString() }, { onConflict: "key" },
    );
  }
  return sent;
}

// GET /api/cron/lead-audit
// Hourly reconciliation of Meta lead forms against the ingestion ledger.
// Reads Meta through the SAME helpers the poller uses, so a token or permission
// regression cannot blind the poller while leaving this job falsely green.
// Auth: Authorization: Bearer {CRON_SECRET}
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !safeCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alertTo = process.env.LEAD_ALERT_EMAIL;
  const userToken = process.env.META_ACCESS_TOKEN;
  if (!alertTo) return NextResponse.json({ ok: false, reason: "LEAD_ALERT_EMAIL not set" }, { status: 503 });
  if (!userToken) return NextResponse.json({ ok: false, reason: "META_ACCESS_TOKEN not set" }, { status: 503 });

  const db = adminClient();
  const now = Date.now();
  const sinceUnix = Math.floor((now - LOOKBACK_MS) / 1000);

  // --- Read Meta. A failed read is NEVER reported as "no gaps". ---
  const pageToken = await getPageToken(userToken, PAGE_ID);
  if (!pageToken) {
    const alerted = await structuralAlert(db, alertTo, "token", "no se pudo derivar el token de pagina");
    return NextResponse.json({ ok: false, tokenOk: false, structAlert: alerted });
  }

  const forms = await listActiveForms(pageToken, PAGE_ID);
  if (forms === null) {
    const alerted = await structuralAlert(db, alertTo, "forms", "no se pudo listar los formularios activos");
    return NextResponse.json({ ok: false, tokenOk: true, formsOk: false, structAlert: alerted });
  }

  const metaLeads: { id: string; created: string | null; formId: string }[] = [];
  for (const form of forms) {
    const { ok, leads } = await fetchFormLeads(pageToken, form.id, sinceUnix);
    if (!ok) {
      const alerted = await structuralAlert(db, alertTo, "read", `fallo la lectura de leads del formulario ${form.id}`);
      return NextResponse.json({ ok: false, tokenOk: true, formsOk: true, readOk: false, structAlert: alerted });
    }
    for (const l of leads) {
      // Meta object ids are numeric strings. Anything else does not go into a
      // PostgREST .in() filter, whose value builder does not escape quotes.
      if (!isMetaId(l.id)) {
        console.error("[lead-audit] skipping lead with unexpected id shape:", JSON.stringify(l.id));
        continue;
      }
      metaLeads.push({ id: l.id, created: l.created_time ?? null, formId: l.form_id ?? form.id });
    }
  }

  // Only leads old enough to have settled through the poller's overlap window.
  const settled = metaLeads.filter(
    (l) => !l.created || new Date(l.created).getTime() <= now - SETTLE_MS,
  );

  // --- Compare against the ledger. ---
  let newGaps = 0;
  if (settled.length > 0) {
    const ids = settled.map((l) => l.id);
    const { data: known } = await db
      .from("meta_lead_ingest").select("lead_id").in("lead_id", ids);
    const knownRows = (known ?? []) as { lead_id: string }[];
    const seen = new Set(knownRows.map((r) => r.lead_id));

    const missing = settled.filter((l) => !seen.has(l.id));
    newGaps = missing.length;
    // Record the gap so it becomes a permanent, queryable row rather than a log line.
    for (const m of missing) {
      const { error } = await db.from("meta_lead_ingest").upsert(
        {
          lead_id: m.id,
          form_id: m.formId,
          created_time: m.created,
          outcome: "not_ingested",
          source: "audit",
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "lead_id" },
      );
      if (error) console.error("[lead-audit] gap upsert failed:", error.message);
    }
  }

  // --- Everything still failed and not yet alerted. ---
  // `created_time` may be null if Meta ever omits it. A bare .gte() would make
  // such a row invisible FOREVER -- the same silent-loss shape this whole change
  // exists to remove, just moved one layer up. Include nulls explicitly.
  // The .not(...) value is hand-built, which is only safe because
  // HEALTHY_OUTCOMES is a compile-time constant. Do not source it from config.
  const { data: open } = await db
    .from("meta_lead_ingest")
    .select("lead_id, outcome, created_time")
    .or(`created_time.is.null,created_time.gte.${new Date(now - LOOKBACK_MS).toISOString()}`)
    .not("outcome", "in", `(${HEALTHY_OUTCOMES.join(",")})`)
    .is("alerted_at", null);

  const gaps = (open ?? []) as GapRow[];
  let alertOk = false;

  if (gaps.length > 0) {
    const shown = gaps.slice(0, MAX_IDS_IN_EMAIL);
    const systemic = gaps.length > 50;
    alertOk = await sendAgentEmail({
      to: alertTo,
      subject: systemic
        ? `[CRM] ${gaps.length} leads de Meta NO entraron al CRM`
        : `[CRM] ${gaps.length} lead(s) de Meta sin ingresar`,
      text:
        `La reconciliacion horaria encontro ${gaps.length} lead(s) de Meta que no ` +
        `llegaron al CRM en las ultimas 48 horas.\n\n` +
        shown.map((g) => `  ${g.lead_id}  ${g.outcome}  ${g.created_time ?? "sin fecha"}`).join("\n") +
        (gaps.length > shown.length ? `\n  ... y ${gaps.length - shown.length} mas` : "") +
        `\n\nSe recuperan exportando el CSV del formulario en Ads Manager y cruzando ` +
        `por lead_id contra la tabla meta_lead_ingest.`,
    });

    // alerted_at is set ONLY when the send actually succeeded, so an
    // undeliverable alert is retried next hour instead of being marked done.
    // This is the exact failure the previous notifier had: it reported success
    // for 100 consecutive executions while sending nothing.
    if (alertOk) {
      const { error } = await db
        .from("meta_lead_ingest")
        .update({ alerted_at: new Date().toISOString() })
        .in("lead_id", gaps.map((g) => g.lead_id));
      if (error) console.error("[lead-audit] alerted_at update failed:", error.message);
    } else {
      console.error(`[lead-audit] alert send FAILED for ${gaps.length} gap(s); will retry next run`);
    }
  }

  // --- Is the poller's watermark pinned? ---
  const { data: wmRow } = await db
    .from("agency_config").select("value").eq("key", "lead_poll_last_ts").maybeSingle();
  const wmMs = wmRow?.value ? new Date(wmRow.value as string).getTime() : NaN;
  const watermarkAgeMin = Number.isFinite(wmMs) ? Math.round((now - wmMs) / 60000) : null;
  let watermarkAlert = false;
  if (watermarkAgeMin === null || watermarkAgeMin > WATERMARK_STALE_MIN) {
    watermarkAlert = await structuralAlert(
      db, alertTo, "watermark",
      `el watermark del poller lleva ${watermarkAgeMin ?? "un valor ilegible"} minutos sin avanzar`,
    );
  }

  await db.from("agency_config").upsert(
    { key: "lead_audit_last_ok", value: new Date().toISOString() }, { onConflict: "key" },
  );

  console.log(
    `[lead-audit] forms=${forms.length} metaLeads=${metaLeads.length} settled=${settled.length} ` +
    `newGaps=${newGaps} openGaps=${gaps.length} alertOk=${alertOk} wmAgeMin=${watermarkAgeMin}`,
  );

  return NextResponse.json({
    ok: true,
    tokenOk: true,
    formsOk: true,
    forms: forms.length,
    metaLeads: metaLeads.length,
    settled: settled.length,
    newGaps,
    gaps: gaps.length,
    alerted: gaps.length,
    alertOk,
    watermarkAgeMin,
    watermarkAlert,
  });
}
