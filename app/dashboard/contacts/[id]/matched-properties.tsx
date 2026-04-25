import type { PropertyMatch } from "@/lib/properties/matching";

const TYPE_LABELS: Record<string, string> = {
  apartment: "Apartamento",
  penthouse: "Penthouse",
  villa: "Villa",
  house: "Casa",
  land: "Terreno",
  commercial: "Comercial",
  apart_hotel: "Apart-Hotel",
  farm: "Finca",
};

interface Props {
  matches: PropertyMatch[];
  hasBudget: boolean;
}

export function MatchedProperties({ matches, hasBudget }: Props) {
  if (!hasBudget) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3
          className="text-sm font-bold uppercase tracking-widest"
          style={{ color: "var(--muted-foreground)" }}
        >
          Propiedades Recomendadas
        </h3>
        {matches.length > 0 && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(201,150,58,0.12)", color: "var(--primary)" }}
          >
            {matches.length}
          </span>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="flex flex-col items-center py-10" style={{ color: "var(--muted-foreground)" }}>
          <svg
            className="w-8 h-8 mb-2 opacity-30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <p className="text-sm">Sin propiedades activas en ese rango</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {matches.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-xl border"
              style={{ background: "var(--background)", borderColor: "var(--border)" }}
            >
              {p.match_score === 2 && (
                <span
                  className="inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2"
                  style={{ background: "rgba(201,150,58,0.15)", color: "var(--primary)" }}
                >
                  Mejor match
                </span>
              )}

              <p
                className="text-xs font-bold leading-snug mb-1 line-clamp-2"
                style={{ color: "var(--foreground)" }}
              >
                {p.title}
              </p>

              <p
                className="text-sm font-extrabold mb-2"
                style={{
                  color: "var(--foreground)",
                  fontFamily: "var(--font-manrope), Manrope, sans-serif",
                }}
              >
                {p.currency ?? "USD"} {p.price.toLocaleString()}
              </p>

              <div className="flex flex-wrap gap-1.5">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "var(--glass-bg-md)", color: "var(--muted-foreground)" }}
                >
                  {TYPE_LABELS[p.property_type] ?? p.property_type}
                </span>
                {p.city && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "var(--glass-bg-md)", color: "var(--muted-foreground)" }}
                  >
                    {p.city}
                  </span>
                )}
                {(p.bedrooms != null || p.bathrooms != null) && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "var(--glass-bg-md)", color: "var(--muted-foreground)" }}
                  >
                    {[
                      p.bedrooms != null ? `${p.bedrooms} hab` : null,
                      p.bathrooms != null ? `${p.bathrooms} baños` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
