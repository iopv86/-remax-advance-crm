import type { Property } from "@/lib/types";

interface AgentInfo {
  full_name?: string;
  email?: string;
  phone?: string;
}

const TYPE_LABELS: Record<string, string> = {
  apartment: "Apartamento",
  penthouse: "Penthouse",
  villa: "Villa",
  house: "Casa",
  land: "Solar",
  commercial: "Local Comercial",
  apart_hotel: "Apart-Hotel",
  farm: "Finca",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Disponible",
  reserved: "Reservado",
  sold: "Vendido",
  rented: "Rentado",
  inactive: "Inactivo",
};

export function buildProposalHtml(
  properties: Property[],
  agent: AgentInfo,
  baseUrl: string
): string {
  const propCards = properties
    .map((p) => {
      const imageHtml =
        p.images && p.images.length > 0
          ? `<img src="${p.images[0]}" alt="${p.title}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;margin-bottom:16px;" />`
          : `<div style="width:100%;height:200px;background:#f1f5f9;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px;">Sin foto</div>`;

      const specs = [
        p.bedrooms != null ? `${p.bedrooms} hab.` : null,
        p.bathrooms != null ? `${p.bathrooms} baños` : null,
        p.area_m2 != null ? `${p.area_m2} m²` : null,
      ]
        .filter(Boolean)
        .join(" &nbsp;·&nbsp; ");

      const location = [p.sector, p.city].filter(Boolean).join(", ");

      return `
      <div style="page-break-inside:avoid;background:#ffffff;border-radius:16px;padding:28px;margin-bottom:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
        ${imageHtml}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <h3 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#0f172a;margin:0;line-height:1.3;">${p.title}</h3>
          <span style="background:${p.status === "active" ? "#dcfce7" : "#f1f5f9"};color:${p.status === "active" ? "#16a34a" : "#64748b"};padding:4px 10px;border-radius:99px;font-size:11px;font-weight:600;white-space:nowrap;margin-left:12px;">
            ${STATUS_LABELS[p.status] ?? p.status}
          </span>
        </div>
        <p style="color:#64748b;font-size:13px;margin:0 0 8px;">
          ${TYPE_LABELS[p.property_type] ?? p.property_type} &nbsp;·&nbsp;
          ${p.transaction_type === "sale" ? "Venta" : "Alquiler"}
          ${location ? " &nbsp;·&nbsp; " + location : ""}
        </p>
        ${specs ? `<p style="color:#475569;font-size:13px;margin:0 0 12px;">${specs}</p>` : ""}
        ${p.price != null ? `
        <p style="font-family:monospace;font-size:22px;font-weight:700;color:#059669;margin:0 0 12px;">
          $${p.price.toLocaleString()} ${p.currency ?? "USD"}
        </p>` : ""}
        ${p.description ? `<p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">${p.description}</p>` : ""}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Propuesta Inmobiliaria — Advance Estate</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: #f8fafc;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { margin: 0; size: A4; }
</style>
</head>
<body>

<!-- Cover page -->
<div style="min-height:100vh;background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px 48px;page-break-after:always;">

  <!-- RE/MAX badge -->
  <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:99px;padding:6px 20px;margin-bottom:40px;">
    <span style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;letter-spacing:0.25em;text-transform:uppercase;">RE/MAX Advance &nbsp;·&nbsp; República Dominicana</span>
  </div>

  <!-- Logo wordmark -->
  <h1 style="font-family:Georgia,serif;font-size:52px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;margin-bottom:8px;text-align:center;">Advance Estate</h1>
  <p style="color:rgba(255,255,255,0.4);font-size:16px;margin-bottom:60px;">Propuesta Inmobiliaria</p>

  <!-- Divider -->
  <div style="width:60px;height:3px;background:linear-gradient(90deg,#C9963A,#E8B84B);border-radius:99px;margin-bottom:60px;"></div>

  <!-- Properties summary -->
  <div style="text-align:center;margin-bottom:60px;">
    <p style="color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.25em;margin-bottom:8px;">Selección de propiedades</p>
    <p style="color:#ffffff;font-size:36px;font-weight:700;font-family:Georgia,serif;">${properties.length} propiedad${properties.length !== 1 ? "es" : ""}</p>
  </div>

  <!-- Agent info -->
  <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:24px 36px;text-align:center;max-width:340px;">
    <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.2em;margin-bottom:12px;">Su asesor</p>
    <p style="color:#ffffff;font-size:18px;font-weight:600;margin-bottom:4px;">${agent.full_name ?? "Asesor Advance"}</p>
    ${agent.phone ? `<p style="color:rgba(255,255,255,0.5);font-size:13px;">${agent.phone}</p>` : ""}
    ${agent.email ? `<p style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:2px;">${agent.email}</p>` : ""}
  </div>
</div>

<!-- Properties pages -->
<div style="background:#f8fafc;padding:48px;">
  <div style="max-width:720px;margin:0 auto;">
    <div style="margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #e2e8f0;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.25em;color:#94a3b8;margin-bottom:4px;">Propiedades seleccionadas</p>
      <h2 style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#0f172a;">Fichas de propiedades</h2>
    </div>
    ${propCards}
  </div>
</div>

<!-- Footer -->
<div style="background:#0f172a;padding:36px 48px;text-align:center;">
  <p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.8;">
    Advance Estate · RE/MAX Advance · República Dominicana<br/>
    Esta propuesta es válida por 30 días y está sujeta a disponibilidad.<br/>
    Los precios pueden variar sin previo aviso.
  </p>
</div>

</body>
</html>`;
}
