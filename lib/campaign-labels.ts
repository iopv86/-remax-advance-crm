/**
 * Meta campaign attribution labels. Campaign/adset/ad/form names are dynamic
 * strings (not enums) so they need no map — only `platform` is enum-ish.
 * Used by the read surfaces (contact detail, deal detail) via
 * components/contacts/campaign-attribution.tsx.
 */

export const PLATFORM_LABELS: Record<string, string> = {
  fb: "Facebook",
  facebook: "Facebook",
  ig: "Instagram",
  instagram: "Instagram",
  an: "Audience Network",
  msg: "Messenger",
  messenger: "Messenger",
};

/** Normalize a raw platform value (fb/ig/…) to a display label. */
export function platformLabel(p?: string | null): string | null {
  if (!p) return null;
  return PLATFORM_LABELS[p.toLowerCase()] ?? p;
}
