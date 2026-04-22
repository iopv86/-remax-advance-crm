import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// Expected CSV columns (case-insensitive, flexible header names)
const COL_MAP: Record<string, string> = {
  nombre:        "first_name",
  name:          "first_name",
  "first name":  "first_name",
  "nombre completo": "full_name",
  "full name":   "full_name",
  apellido:      "last_name",
  "last name":   "last_name",
  telefono:      "phone",
  phone:         "phone",
  "phone number": "phone",
  celular:       "phone",
  whatsapp:      "whatsapp_number",
  email:         "email",
  correo:        "email",
  fuente:        "source_detail",
  source:        "source_detail",
  notas:         "agent_notes",
  notes:         "agent_notes",
};

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Add +1 prefix for 10-digit Dominican / US numbers without country code
  if (digits.length === 10) return `+1${digits}`;
  if (!digits.startsWith("+")) return `+${digits}`;
  return digits;
}

function normalizeRow(row: Record<string, string>): {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
  source_detail?: string;
  agent_notes?: string;
} {
  const mapped: Record<string, string> = {};
  for (const [raw, value] of Object.entries(row)) {
    const key = COL_MAP[raw.toLowerCase().trim()];
    if (key && value?.trim()) mapped[key] = value.trim();
  }

  // Split full_name into first/last if present
  if (mapped.full_name && !mapped.first_name) {
    const [first, ...rest] = mapped.full_name.split(" ");
    mapped.first_name = first;
    if (rest.length) mapped.last_name = rest.join(" ");
    delete mapped.full_name;
  }

  const phone = normalizePhone(mapped.phone);

  return {
    first_name:      mapped.first_name,
    last_name:       mapped.last_name,
    phone:           phone,
    whatsapp_number: normalizePhone(mapped.whatsapp_number) ?? phone,
    email:           mapped.email?.toLowerCase() || null,
    source_detail:   mapped.source_detail,
    agent_notes:     mapped.agent_notes,
  };
}

// POST /api/contacts/import
// Admin/manager only. Accepts multipart form with a "file" CSV field.
// Deduplicates by phone (normalized). Returns imported/skipped counts.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`csv-import:${user.id}`, 5, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { data: agent } = await supabase
    .from("agents")
    .select("id, role")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent || (agent.role !== "admin" && agent.role !== "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing CSV file in 'file' field" }, { status: 400 });
  }

  const csvText = await (file as File).text();

  const { data: rows, errors } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.toLowerCase().trim(),
  });

  if (errors.length && rows.length === 0) {
    return NextResponse.json({ error: "CSV parse failed", details: errors[0].message }, { status: 422 });
  }

  const db = adminClient();
  let imported = 0;
  let skipped  = 0;
  const failedRows: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const norm = normalizeRow(rows[i]);

    if (!norm.first_name && !norm.phone && !norm.email) {
      skipped++;
      continue;
    }

    const { error } = await db.from("contacts").insert({
      first_name:      norm.first_name ?? "Importado",
      last_name:       norm.last_name   ?? null,
      phone:           norm.phone       ?? null,
      whatsapp_number: norm.whatsapp_number ?? null,
      email:           norm.email       ?? null,
      source:          "other",
      source_detail:   norm.source_detail ?? "CSV AlterEstate",
      agent_notes:     norm.agent_notes  ?? null,
      agent_id:        agent.id,
    });

    if (error) {
      const isDupe =
        error.code === "23505" ||
        error.message.includes("unique") ||
        error.message.includes("duplicate");
      if (isDupe) {
        skipped++;
      } else {
        failedRows.push(i + 2); // 1-indexed + header row
      }
    } else {
      imported++;
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    failed: failedRows.length,
    failedRows: failedRows.slice(0, 20),
    total: rows.length,
  });
}
