/**
 * scripts/test-pdf.ts
 * Prueba local del PDF con @react-pdf/renderer
 *
 * Cómo correr:
 *   npx tsx scripts/test-pdf.ts
 *
 * Genera: scripts/test-output.pdf
 * Si el archivo se genera y se puede abrir → PDF OK ✓
 */

import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { writeFileSync } from "fs";
import { join } from "path";
import { ProposalDocument } from "../lib/pdf-proposal";
import type { AgencyConfig, AgentInfo } from "../lib/pdf-proposal";
import type { Property } from "../lib/types";

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockConfig: AgencyConfig = {
  agency_name: "Advance Estate",
  agency_tagline: "República Dominicana",
  agency_logo_url: "",
  agency_primary_color: "#C9963A",
};

const mockAgent: AgentInfo = {
  full_name: "Juan Pérez",
  email: "juan@advanceestate.com",
  phone: "+1 (809) 555-0100",
};

const mockProperties: Property[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    agent_id: "00000000-0000-0000-0000-000000000000",
    title: "Penthouse en Piantini con Vista Panorámica",
    description:
      "Exclusivo penthouse de 3 niveles con terraza privada y jacuzzi exterior. Acabados de lujo, cocina italiana y piso de mármol importado. Vista 360° a la ciudad.",
    property_type: "penthouse",
    transaction_type: "sale",
    price: 850000,
    currency: "USD",
    city: "Santo Domingo",
    sector: "Piantini",
    bedrooms: 4,
    bathrooms: 5,
    area_m2: 520,
    images: [],
    status: "active",
    created_at: new Date().toISOString(),
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    agent_id: "00000000-0000-0000-0000-000000000000",
    title: "Villa Frente al Mar en Cap Cana",
    description:
      "Villa de 6 habitaciones con acceso privado a la playa Juanillo. Piscina infinita, cancha de tenis y servicio de mayordomo incluido.",
    property_type: "villa",
    transaction_type: "sale",
    price: 2400000,
    currency: "USD",
    city: "Punta Cana",
    sector: "Cap Cana",
    bedrooms: 6,
    bathrooms: 7,
    area_m2: 950,
    images: [],
    status: "active",
    created_at: new Date().toISOString(),
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    agent_id: "00000000-0000-0000-0000-000000000000",
    title: "Apartamento Moderno en Naco",
    description:
      "Apartamento de 2 habitaciones completamente remodelado. A 5 minutos del Blue Mall. Ideal para inversión — rentabilidad del 8% anual proyectada.",
    property_type: "apartment",
    transaction_type: "sale",
    price: 185000,
    currency: "USD",
    city: "Santo Domingo",
    sector: "Naco",
    bedrooms: 2,
    bathrooms: 2,
    area_m2: 110,
    images: [],
    status: "active",
    created_at: new Date().toISOString(),
  },
];

// ── Render ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Generando PDF de prueba...");
  console.log(`   Propiedades: ${mockProperties.length}`);
  console.log(`   Agencia: ${mockConfig.agency_name}`);
  console.log(`   Agente: ${mockAgent.full_name}`);

  const start = Date.now();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await (renderToBuffer as any)(
      createElement(ProposalDocument, {
        properties: mockProperties,
        agent: mockAgent,
        config: mockConfig,
      })
    );

    const elapsed = Date.now() - start;
    const outputPath = join(process.cwd(), "scripts", "test-output.pdf");
    writeFileSync(outputPath, buffer);

    console.log(`\n✅ PDF generado en ${elapsed}ms`);
    console.log(`   Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`   Archivo: scripts/test-output.pdf`);
    console.log(`\n→ Abre el archivo para verificar visualmente.\n`);
  } catch (err) {
    console.error("\n❌ Error generando PDF:");
    console.error(err);
    process.exit(1);
  }
}

main();
