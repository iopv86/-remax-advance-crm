// Single source of truth for currency display across the CRM.
// Aggregate KPI/agent screens sum deals in their native currency (all USD today)
// and format with US$. Row-level views (deal detail) pass the deal's own currency.

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
