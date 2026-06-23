import type { LeadFormAnswers } from "@/lib/types";

/**
 * Read-only display of the answered Meta Lead Form questions captured at intake
 * (contacts.lead_form_answers). Renders nothing when there are no custom answers.
 * Filters out the core name/email/phone fields already shown elsewhere.
 */
const CORE = new Set([
  "full_name", "full name", "name", "nombre", "nombre_completo",
  "email", "correo", "correo_electronico",
  "phone_number", "phone", "telefono", "teléfono", "numero", "número",
]);

function prettyLabel(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export function LeadFormAnswers({ answers }: { answers?: LeadFormAnswers | null }) {
  const custom = (answers?.fields ?? []).filter(
    (f) => !CORE.has(f.name) && (f.values?.some((v) => v?.trim()))
  );
  if (custom.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--card)",
        border: "1px solid var(--glass-border)",
        borderRadius: 14,
        padding: "20px 22px",
      }}
    >
      <h2
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--foreground)",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Respuestas del formulario
      </h2>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 0" }}>
        Lo que el lead respondió en el anuncio de Meta.
      </p>
      <dl style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        {custom.map((f, i) => (
          <div key={`${f.name}-${i}`}>
            <dt
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--secondary-foreground)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 4,
              }}
            >
              {prettyLabel(f.label || f.name)}
            </dt>
            <dd style={{ margin: 0, fontSize: 14, color: "var(--foreground)", lineHeight: 1.5 }}>
              {f.values.filter((v) => v?.trim()).join(", ") || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
