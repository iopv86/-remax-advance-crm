import { platformLabel } from "@/lib/campaign-labels";

/**
 * Read-only "Campañas" block — Meta attribution surfaced on contact detail and
 * deal detail. Mirrors the Intereses chip/row pattern (1B). Pure presentational,
 * safe in both server and client trees. Renders nothing when no attribution
 * exists, so the 150 pre-S2 contacts show nothing.
 */
export interface CampaignAttributionProps {
  campaignId?: string | null;
  campaignName?: string | null;
  adsetId?: string | null;
  adsetName?: string | null;
  adId?: string | null;
  adName?: string | null;
  formName?: string | null;
  platform?: string | null;
  variant?: "contact" | "deal";
}

export function CampaignAttribution({
  campaignId,
  campaignName,
  adsetId,
  adsetName,
  adId,
  adName,
  formName,
  platform,
  variant = "contact",
}: CampaignAttributionProps) {
  const platformText = platformLabel(platform);
  const hasAny =
    !!(campaignId || campaignName || adsetId || adsetName || adId || adName || formName || platformText);
  if (!hasAny) return null;

  // value = display name; fall back to the raw id so degradation still shows something.
  const rows: { label: string; value: string; id?: string | null }[] = [];
  if (campaignName || campaignId)
    rows.push({ label: "Campaña", value: campaignName ?? campaignId!, id: campaignName ? campaignId : null });
  if (adsetName || adsetId)
    rows.push({ label: "Conjunto", value: adsetName ?? adsetId!, id: adsetName ? adsetId : null });
  if (adName || adId)
    rows.push({ label: "Anuncio", value: adName ?? adId!, id: adName ? adId : null });
  if (formName) rows.push({ label: "Formulario", value: formName });

  const chip = (text: string) => (
    <span
      key={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        background: "var(--accent)",
        color: "var(--accent-foreground)",
        border: "1px solid var(--border)",
      }}
    >
      {text}
    </span>
  );

  const body = (
    <>
      {platformText && (
        <div className="mb-3">
          <p className="text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>Plataforma</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{chip(platformText)}</div>
        </div>
      )}
      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label}>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{r.label}</p>
              <p className="text-sm font-semibold break-words" style={{ color: "var(--foreground)" }}>{r.value}</p>
              {r.id && (
                <p className="text-[10px] font-mono" style={{ color: "var(--muted-foreground)" }}>{r.id}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (variant === "deal") {
    return (
      <div className="card-secondary p-5">
        <p className="eyebrow mb-3">
          Campañas
        </p>
        {body}
      </div>
    );
  }

  return (
    <div style={{ borderBottom: "1px solid var(--glass-border)", paddingBottom: 16 }}>
      <p
        className="font-bold text-sm mb-3"
        style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "var(--foreground)" }}
      >
        Campañas
      </p>
      {body}
    </div>
  );
}
