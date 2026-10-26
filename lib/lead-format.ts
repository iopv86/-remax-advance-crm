import type { FieldData } from "@/lib/meta-leads";

// Pure display helpers for lead notifications. They live apart from
// lib/meta-leads.ts so that lib/agent-notifications.ts can use them without an
// import cycle (meta-leads imports the notification drain). meta-leads.ts
// re-exports both, so existing importers are unchanged.

/** Compact budget display, e.g. "US$72.5k-80k" / "RD$3.5M" / "No especificado". */
export function formatBudgetShort(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
): string {
  const sym = currency === "DOP" ? "RD$" : "US$";
  const short = (n: number): string => {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  };
  const lo = typeof min === "number" && min > 0 ? min : null;
  const hi = typeof max === "number" && max > 0 ? max : null;
  if (lo && hi) return `${sym}${short(lo)}-${short(hi)}`;
  if (lo) return `${sym}${short(lo)}`;
  if (hi) return `${sym}${short(hi)}`;
  return "No especificado";
}

/** First field value whose name contains any keyword (case-insensitive). */
export function findAnswer(fields: FieldData[], keywords: string[]): string | null {
  for (const f of fields ?? []) {
    const name = (f.name ?? "").toLowerCase();
    if (keywords.some((k) => name.includes(k))) {
      const v = f.values?.[0]?.trim();
      if (v) return v;
    }
  }
  return null;
}
