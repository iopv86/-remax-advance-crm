// Shared display formatting for the CRM: currency and name initials.
// Must stay free of "use client" — server components import from here.

// Currency: aggregate KPI/agent screens sum deals in their native currency
// (all USD today) and format with US$. Row-level views (deal detail) pass the
// deal's own currency.

export function currencySymbol(currency: string = "USD"): string {
  return currency === "DOP" ? "RD$" : "US$";
}

// Compact form for dense KPI cards: >=1M -> "US$ 1.2M", otherwise "US$ 80K".
export function formatCurrencyCompact(value: number, currency: string = "USD"): string {
  const sym = currencySymbol(currency);
  if (value >= 1_000_000) return `${sym} ${(value / 1_000_000).toFixed(1)}M`;
  return `${sym} ${(value / 1_000).toFixed(0)}K`;
}

// Full form with thousands separators: "US$ 80,000".
export function formatCurrency(value: number, currency: string = "USD"): string {
  return `${currencySymbol(currency)} ${(value ?? 0).toLocaleString("en-US")}`;
}

const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;
// Only the first code point is ever read, and one takes at most 2 UTF-16 units.
// Names arrive from WhatsApp leads, so bound the scan rather than materialize a
// whole attacker-sized string into a code-point array.
const INITIAL_SCAN_LIMIT = 8;

// Avatar initials from name parts, e.g. initialsOf("Ada", "Lovelace") -> "AL".
//
// Never emits a lone surrogate. Indexing a string (name[0], charAt(0)) returns a
// UTF-16 code unit, so a name outside the BMP -- WhatsApp leads arrive with emoji
// and math-alphanumeric names -- yields half a surrogate pair. That is invalid
// text: the server serializes it into the HTML differently than the client
// recomputes it, which fails hydration (React #418). Array.from iterates by code
// point and is spec-deterministic in Node and every browser, unlike
// Intl.Segmenter, whose grapheme rules follow the runtime's ICU version and could
// differ between server and client. Stored unpaired surrogates are dropped so the
// result is well-formed regardless of input.
//
// Returns "" when nothing is usable; callers supply their own fallback.
export function initialsOf(...parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => {
      if (!part) return undefined;
      const first = Array.from(part.trim().slice(0, INITIAL_SCAN_LIMIT))[0];
      if (!first) return undefined;
      const code = first.codePointAt(0) ?? 0;
      return code >= SURROGATE_START && code <= SURROGATE_END ? undefined : first;
    })
    .filter(Boolean)
    .join("")
    .toUpperCase();
}
