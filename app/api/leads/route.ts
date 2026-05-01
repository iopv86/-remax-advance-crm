import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

function verifyApiKey(req: NextRequest): boolean {
  const apiKey = process.env.ADVANCE_CRM_API_KEY;
  if (!apiKey) return false;
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided) return false;
  try {
    const a = Buffer.from(provided), b = Buffer.from(apiKey);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sanitize(value: string, maxLen: number): string {
  return value.replace(/[\r\n\t\x00-\x1f\x7f]/g, " ").trim().slice(0, maxLen);
}

// POST /api/leads
// Server-to-server endpoint for external services (e.g. Advance Marketing HUB)
// to create a new contact lead in the CRM.
// Auth: Authorization: Bearer {ADVANCE_CRM_API_KEY}
export async function POST(req: NextRequest) {
  if (!verifyApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { name, source, notes, phone } = body as Record<string, unknown>;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 422 });
  }

  const safeName = sanitize(String(name), 200);
  const safeNotes = notes && typeof notes === "string" ? sanitize(String(notes), 1000) : null;
  const safePhone = phone && typeof phone === "string" ? sanitize(String(phone), 30) : null;
  const safeSource = source && typeof source === "string" ? sanitize(String(source), 100) : null;

  // Split name into first/last
  const parts = safeName.split(" ");
  const firstName = parts[0] ?? safeName;
  const lastName = parts.slice(1).join(" ") || null;

  const db = adminClient();

  const { data, error } = await db
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      phone: safePhone ?? null,
      source: "social_media",
      source_detail: safeSource ?? "external_api",
      agent_notes: safeNotes ?? null,
      lead_status: "new",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[POST /api/leads] Supabase insert error:", error.message);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
