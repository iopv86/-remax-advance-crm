/**
 * scripts/test-pdf.mjs
 * Prueba directa del PDF — sin TypeScript, sin next dev
 *
 * Cómo correr:
 *   node scripts/test-pdf.mjs
 *
 * Si genera scripts/test-output.pdf → PDF OK ✓
 */

import { renderToBuffer, Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { createElement } from "react";
import { writeFileSync } from "fs";

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockProperties = [
  {
    id: "mock-001",
    agent_id: "mock-agent",
    title: "Penthouse en Piantini con Vista Panorámica",
    description: "Exclusivo penthouse de 3 niveles con terraza privada y jacuzzi exterior. Acabados de lujo.",
    property_type: "penthouse",
    transaction_type: "sale",
    price: 850000,
    currency: "USD",
    location_city: "Santo Domingo",
    location_sector: "Piantini",
    bedrooms: 4,
    bathrooms: 5,
    area_m2: 520,
    images: [],
    status: "active",
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-002",
    agent_id: "mock-agent",
    title: "Apartamento Moderno en Naco",
    description: "Apartamento completamente remodelado. A 5 minutos del Blue Mall.",
    property_type: "apartment",
    transaction_type: "sale",
    price: 185000,
    currency: "USD",
    location_city: "Santo Domingo",
    location_sector: "Naco",
    bedrooms: 2,
    bathrooms: 2,
    area_m2: 110,
    images: [],
    status: "active",
    created_at: new Date().toISOString(),
  },
];

const mockAgent = {
  full_name: "Juan Pérez",
  email: "juan@advanceestate.com",
  phone: "+1 (809) 555-0100",
};

const mockConfig = {
  agency_name: "Advance Estate",
  agency_tagline: "República Dominicana",
  agency_logo_url: "",
  agency_primary_color: "#e11d48",
};

// ── Inline minimal ProposalDocument (no imports needed) ───────────────────────
// Para verificar que react-pdf funciona sin necesitar resolver el TSX

const S = StyleSheet.create({
  cover: { flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center", padding: 60 },
  coverTitle: { fontSize: 44, fontWeight: "bold", color: "#ffffff", marginBottom: 8, textAlign: "center" },
  coverSub: { fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 40 },
  coverDivider: { width: 48, height: 3, backgroundColor: "#e11d48", borderRadius: 99, marginBottom: 40 },
  coverCount: { fontSize: 32, fontWeight: "bold", color: "#ffffff", textAlign: "center", marginBottom: 40 },
  agentCard: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 16, padding: 24, alignItems: "center" },
  agentName: { fontSize: 16, fontWeight: "bold", color: "#ffffff", marginBottom: 4 },
  agentDetail: { fontSize: 11, color: "rgba(255,255,255,0.5)" },
  propsPage: { backgroundColor: "#f8fafc", padding: 40 },
  header: { marginBottom: 24, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: "#e2e8f0" },
  headerLabel: { fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2, marginBottom: 3 },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#0f172a" },
  card: { backgroundColor: "#ffffff", borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "#e2e8f0" },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#0f172a", marginBottom: 6 },
  cardMeta: { fontSize: 11, color: "#64748b", marginBottom: 4 },
  cardPrice: { fontSize: 20, fontWeight: "bold", color: "#059669", marginBottom: 6 },
  cardDesc: { fontSize: 11, color: "#64748b", lineHeight: 1.6 },
  footer: { backgroundColor: "#0f172a", padding: 28, alignItems: "center" },
  footerText: { fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", lineHeight: 1.8 },
});

const TYPE_LABELS = {
  apartment: "Apartamento", penthouse: "Penthouse", villa: "Villa",
  house: "Casa", land: "Solar", commercial: "Local Comercial",
};

function buildDoc(properties, agent, config) {
  return createElement(Document, { title: `Propuesta — ${config.agency_name}` },
    // Portada
    createElement(Page, { size: "A4", style: S.cover },
      createElement(Text, { style: S.coverTitle }, config.agency_name),
      createElement(Text, { style: S.coverSub }, "Propuesta Inmobiliaria"),
      createElement(View, { style: S.coverDivider }),
      createElement(Text, { style: S.coverCount }, `${properties.length} propiedad${properties.length !== 1 ? "es" : ""}`),
      createElement(View, { style: S.agentCard },
        createElement(Text, { style: S.agentName }, agent.full_name ?? "Asesor"),
        agent.phone ? createElement(Text, { style: S.agentDetail }, agent.phone) : null,
        agent.email ? createElement(Text, { style: S.agentDetail }, agent.email) : null,
      )
    ),
    // Propiedades
    createElement(Page, { size: "A4", style: S.propsPage },
      createElement(View, { style: S.header },
        createElement(Text, { style: S.headerLabel }, "Propiedades seleccionadas"),
        createElement(Text, { style: S.headerTitle }, "Fichas de propiedades"),
      ),
      ...properties.map(p =>
        createElement(View, { key: p.id, style: S.card },
          createElement(Text, { style: S.cardTitle }, p.title),
          createElement(Text, { style: S.cardMeta },
            `${TYPE_LABELS[p.property_type] ?? p.property_type}  ·  ${p.transaction_type === "sale" ? "Venta" : "Alquiler"}`
            + (p.location_sector ? `  ·  ${p.location_sector}, ${p.location_city}` : "")
          ),
          p.price != null ? createElement(Text, { style: S.cardPrice }, `$${p.price.toLocaleString()} ${p.currency ?? "USD"}`) : null,
          p.description ? createElement(Text, { style: S.cardDesc }, p.description) : null,
        )
      )
    ),
    // Footer
    createElement(Page, { size: "A4", style: S.footer },
      createElement(Text, { style: S.footerText },
        `${config.agency_name} · ${config.agency_tagline}\n`
        + "Esta propuesta es válida por 30 días y está sujeta a disponibilidad."
      )
    )
  );
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log("\n🔄 Generando PDF de prueba...");
console.log(`   Propiedades: ${mockProperties.length}`);
console.log(`   Agencia: ${mockConfig.agency_name}`);
console.log(`   Agente: ${mockAgent.full_name}`);

const start = Date.now();

renderToBuffer(buildDoc(mockProperties, mockAgent, mockConfig))
  .then(buffer => {
    const elapsed = Date.now() - start;
    writeFileSync("scripts/test-output.pdf", buffer);
    console.log(`\n✅  PDF generado en ${elapsed}ms`);
    console.log(`   Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`   Archivo: scripts/test-output.pdf`);
    console.log("\n→ Abre el archivo para verificar visualmente.\n");
  })
  .catch(err => {
    console.error("\n❌  Error generando PDF:\n", err);
    process.exit(1);
  });
