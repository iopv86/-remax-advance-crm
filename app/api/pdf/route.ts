import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ProposalDocument } from "@/lib/pdf-proposal";
import type { AgencyConfig } from "@/lib/pdf-proposal";
import type { Property } from "@/lib/types";
import { checkRateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_CONFIG: AgencyConfig = {
  agency_name: "Advance Estate",
  agency_tagline: "República Dominicana",
  agency_logo_url: "",
  agency_primary_color: "#C9963A",
};

async function getAgencyConfig(): Promise<AgencyConfig> {
  const KEYS: (keyof AgencyConfig)[] = [
    "agency_name",
    "agency_tagline",
    "agency_logo_url",
    "agency_primary_color",
  ];

  const { data } = await supabase
    .from("agency_config")
    .select("key, value")
    .in("key", KEYS);

  if (!data?.length) return DEFAULT_CONFIG;

  const map = Object.fromEntries(data.map((r) => [r.key, r.value ?? ""]));

  return {
    agency_name: map.agency_name || DEFAULT_CONFIG.agency_name,
    agency_tagline: map.agency_tagline || DEFAULT_CONFIG.agency_tagline,
    agency_logo_url: map.agency_logo_url || DEFAULT_CONFIG.agency_logo_url,
    agency_primary_color: map.agency_primary_color || DEFAULT_CONFIG.agency_primary_color,
  };
}

export async function POST(req: NextRequest) {
  // Auth check — middleware already guards, but defense-in-depth
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Rate limit: 10 PDFs per minute per user
  const rl = checkRateLimit(`pdf:${user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  let body: { propertyIds: string[] };
  try {
    body = (await req.json()) as { propertyIds: string[] };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { propertyIds } = body;

  if (!propertyIds?.length || propertyIds.length > 10) {
    return NextResponse.json(
      { error: "Selecciona entre 1 y 10 propiedades" },
      { status: 400 }
    );
  }

  if (propertyIds.some((id) => !UUID_RE.test(id))) {
    return NextResponse.json(
      { error: "propertyIds contienen IDs inválidos" },
      { status: 400 }
    );
  }

  // Fetch properties + agency config + agent info in parallel
  const [propertiesResult, configResult, agentResult] = await Promise.all([
    supabase.from("properties").select("*").in("id", propertyIds),
    getAgencyConfig(),
    user.email
      ? supabase
          .from("agents")
          .select("full_name, email, phone")
          .eq("email", user.email)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const { data: properties, error: propErr } = propertiesResult;
  if (propErr || !properties?.length) {
    return NextResponse.json({ error: "Propiedades no encontradas" }, { status: 404 });
  }

  const agentInfo = agentResult.data ?? {};

  // Render PDF — @react-pdf/renderer runs in Node.js, no browser needed
  let pdfBuffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await (renderToBuffer as any)(
      createElement(ProposalDocument, {
        properties: properties as Property[],
        agent: agentInfo,
        config: configResult,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error generando PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="propuesta-${configResult.agency_name.toLowerCase().replace(/\s+/g, "-")}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
