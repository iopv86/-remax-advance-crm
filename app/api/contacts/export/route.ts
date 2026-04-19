import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";

const HEADERS_ES: Record<string, string> = {
  first_name:             "Nombre",
  last_name:              "Apellido",
  phone:                  "Teléfono",
  whatsapp_number:        "WhatsApp",
  email:                  "Email",
  lead_classification:    "Clasificación",
  lead_status:            "Estado",
  source:                 "Fuente",
  lead_score:             "Score",
  budget_min:             "Presupuesto Mín",
  budget_max:             "Presupuesto Máx",
  budget_currency:        "Moneda",
  property_type_interest: "Tipo Propiedad",
  purpose:                "Propósito",
  payment_method:         "Forma de Pago",
  is_qualified:           "Calificado",
  follow_up_count:        "Seguimientos",
  agent_name:             "Agente",
  created_at:             "Fecha Entrada",
  last_activity_at:       "Última Actividad",
};

const COLUMN_ORDER = [
  "first_name", "last_name", "phone", "whatsapp_number", "email",
  "lead_classification", "lead_status", "source", "lead_score",
  "budget_min", "budget_max", "budget_currency",
  "property_type_interest", "purpose", "payment_method",
  "is_qualified", "follow_up_count", "agent_name",
  "created_at", "last_activity_at",
];

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (key === "is_qualified") return value ? "Sí" : "No";
  if (key === "created_at" || key === "last_activity_at") {
    try {
      return new Date(value as string).toLocaleDateString("es-DO");
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const session = await getSessionAgent();

  const { searchParams } = req.nextUrl;
  const q              = searchParams.get("q") ?? "";
  const classification = searchParams.get("classification") ?? "";
  const status         = searchParams.get("status") ?? "";

  let query = supabase
    .from("contacts")
    .select(
      `id, first_name, last_name, phone, whatsapp_number, email,
       lead_classification, lead_status, source, lead_score,
       budget_min, budget_max, budget_currency,
       property_type_interest, purpose, payment_method,
       is_qualified, follow_up_count,
       created_at, last_activity_at,
       agent:agents!contacts_agent_id_fkey(full_name)`
    )
    .order("created_at", { ascending: false });

  if (!isPrivileged(session.role)) {
    query = query.eq("agent_id", session.agentId);
  }
  if (q) {
    const safeQ = q.replace(/[(),]/g, "").slice(0, 100);
    query = query.or(
      `first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,email.ilike.%${safeQ}%`
    );
  }
  if (classification) query = query.eq("lead_classification", classification);
  if (status)         query = query.eq("lead_status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: Record<string, unknown>[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const agentObj = r.agent as { full_name?: string } | null;
    return { ...r, agent_name: agentObj?.full_name ?? "" };
  });

  const headerRow = COLUMN_ORDER.map((k) => escapeCell(HEADERS_ES[k] ?? k)).join(",");
  const dataRows  = rows.map((row) =>
    COLUMN_ORDER.map((k) => escapeCell(formatValue(k, row[k]))).join(",")
  );

  const csvContent = [headerRow, ...dataRows].join("\r\n");
  // UTF-8 BOM so Excel opens it correctly
  const BOM = "\uFEFF";
  const csv = BOM + csvContent;

  const date = new Date().toISOString().slice(0, 10);
  const filename = `clientes-${date}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
