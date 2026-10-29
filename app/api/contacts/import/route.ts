import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { prepareRow } from "@/lib/contacts-import";
import { isUniqueViolation } from "@/lib/contact-errors";

// POST /api/contacts/import
// Admin/manager only. Accepts multipart form with a "file" CSV field.
// Deduplicates by phone key (contacts_phone_key_uidx: the same number in any format, whatsapp first). Rows whose
// phone is not a valid number are not imported and come back in invalidPhoneRows. Returns the counts.
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

  if ((file as File).size > 5_000_000) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
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
  const invalidPhoneRows: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const prepared = prepareRow(rows[i]);
    if (prepared.kind === "invalid_phone") {
      invalidPhoneRows.push(i + 2); // 1-indexed + header row
      continue;
    }
    if (prepared.kind === "empty") {
      skipped++;
      continue;
    }
    const norm = prepared.data;

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
      if (isUniqueViolation(error)) {
        skipped++;
      } else {
        // SQLSTATE only: the message can carry the phone or the email.
        console.error("[contacts-import] insert failed", { code: error.code });
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
    invalidPhone: invalidPhoneRows.length,
    invalidPhoneRows: invalidPhoneRows.slice(0, 20),
    total: rows.length,
  });
}
