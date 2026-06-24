// USD/DOP exchange-rate domain logic (Session 6 — Tasas Bancarias).
// Pure module: no I/O, no env access, no Supabase. Safe to import from
// client components and to unit-test in isolation. The TasaReal API call,
// caching, and secrets live in app/api/cron/tasas-sync/route.ts.

export type FxInstitutionType = "bank" | "official" | "exchange";

export interface FxInstitution {
  id: string;                 // TasaReal "institution" (e.g. "popular", "bcrd")
  name: string;               // "institution_name" (e.g. "Banco Popular")
  type: FxInstitutionType;
  buy: number | null;         // compra
  sell: number | null;        // venta
  verified: boolean;          // verification === "verified"
}

// Stored as JSON in agency_config.value under key FX_RATES_KEY.
export interface RatesSnapshot {
  apiDate: string;            // TasaReal top-level "date" (DR business date, YYYY-MM-DD)
  fetchedAt: string;          // ISO timestamp when the cron wrote it
  count: number;
  institutions: FxInstitution[];
}

export interface PillRate {
  value: number | null;       // the venta to show, or null when unavailable
  sourceId: string | null;    // institution id behind the number (e.g. "popular")
  sourceLabel: string | null; // institution name behind the number (e.g. "Banco Popular")
  isStale: boolean;
}

// Snapshot is considered stale if it hasn't been refreshed within this window.
// The cron runs 6x/day (max gap ~8h), so 28h tolerates a missed run / API
// outage while NOT firing on weekends — TasaReal is a business-day source, so
// comparing apiDate to "today" would falsely flag fresh weekend data as stale.
const STALE_AFTER_MS = 28 * 60 * 60 * 1000;

// agency_config key holding the cached snapshot.
export const FX_RATES_KEY = "fx_rates_usd";

// Headline institution chosen by the owner (Session 6). Fallback chain below.
export const PILL_PRIMARY_INSTITUTION = "popular";
const PILL_OFFICIAL_FALLBACK = "bcrd";

const DR_TIME_ZONE = "America/Santo_Domingo";

// ─── Raw TasaReal shape (only the fields we consume) ──────────────────────────
interface RawRate {
  institution?: unknown;
  institution_name?: unknown;
  institution_type?: unknown;
  buy?: unknown;
  sell?: unknown;
  verification?: unknown;
}
interface RawResponse {
  date?: unknown;
  count?: unknown;
  rates?: unknown;
}

function toNum(v: unknown): number | null {
  // v > 0: TasaReal returns 0 for an unlisted/unavailable rate → treat as null.
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return null;
}

function toType(v: unknown): FxInstitutionType {
  return v === "bank" || v === "official" || v === "exchange" ? v : "exchange";
}

const TYPE_ORDER: Record<FxInstitutionType, number> = { bank: 0, official: 1, exchange: 2 };

/**
 * Validate + normalize a TasaReal /rates response into a RatesSnapshot.
 * Throws on a structurally invalid payload (no rates array / empty) so the
 * cron can return 502 and keep the last good cache. Never trusts shapes.
 */
export function normalizeTasaRealResponse(raw: unknown, fetchedAt: string): RatesSnapshot {
  const r = (raw ?? {}) as RawResponse;
  if (!Array.isArray(r.rates) || r.rates.length === 0) {
    throw new Error("TasaReal response missing or empty 'rates' array");
  }

  const institutions: FxInstitution[] = (r.rates as RawRate[])
    .filter((row) => typeof row?.institution === "string" && (row.institution as string).length > 0)
    .map((row) => ({
      id: String(row.institution),
      name: typeof row.institution_name === "string" && row.institution_name
        ? String(row.institution_name)
        : String(row.institution),
      type: toType(row.institution_type),
      buy: toNum(row.buy),
      sell: toNum(row.sell),
      verified: row.verification === "verified",
    }))
    .sort((a, b) => {
      const t = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
      return t !== 0 ? t : a.name.localeCompare(b.name, "es");
    });

  if (institutions.length === 0) {
    throw new Error("TasaReal response had no usable institutions");
  }

  const apiDate = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
    ? r.date
    : formatDateInDR(Date.parse(fetchedAt));

  return { apiDate, fetchedAt, count: institutions.length, institutions };
}

/**
 * The pill's headline number. Owner choice: Banco Popular venta.
 * Fallback chain: popular → BCRD official (verified) → first bank → null.
 */
export function computePillRate(snapshot: RatesSnapshot | null, now: number = Date.now()): PillRate {
  if (!snapshot || snapshot.institutions.length === 0) {
    return { value: null, sourceId: null, sourceLabel: null, isStale: true };
  }

  const byId = (id: string) =>
    snapshot.institutions.find((i) => i.id === id && i.sell != null);

  const pick =
    byId(PILL_PRIMARY_INSTITUTION) ??
    snapshot.institutions.find(
      (i) => i.id === PILL_OFFICIAL_FALLBACK && i.type === "official" && i.verified && i.sell != null
    ) ??
    snapshot.institutions.find((i) => i.type === "bank" && i.sell != null) ??
    null;

  return {
    value: pick?.sell ?? null,
    sourceId: pick?.id ?? null,
    sourceLabel: pick?.name ?? null,
    isStale: isStaleSnapshot(snapshot, now),
  };
}

/**
 * Stale when the snapshot hasn't been refreshed within STALE_AFTER_MS.
 * Uses fetchedAt (cron write time), NOT apiDate — TasaReal doesn't publish on
 * weekends/holidays, so an apiDate-vs-today compare would wrongly flag fresh
 * weekend data. fetchedAt reflects cron/API health, which is the real signal.
 */
export function isStaleSnapshot(snapshot: RatesSnapshot | null, now: number = Date.now()): boolean {
  if (!snapshot) return true;
  const fetchedMs = Date.parse(snapshot.fetchedAt);
  if (Number.isNaN(fetchedMs)) return true;
  return now - fetchedMs > STALE_AFTER_MS;
}

/** Today's date as YYYY-MM-DD in Dominican Republic time (UTC-4, no DST). */
export function formatDateInDR(now: number = Date.now()): string {
  // en-CA yields YYYY-MM-DD; IANA zone keeps this correct regardless of server tz.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** Format a DOP rate for display, es-DO, up to 2 decimals (e.g. "60.25"). */
export function formatDopRate(n: number | null): string {
  if (n == null) return "--";
  return new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
