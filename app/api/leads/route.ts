import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { toE164, keyFromE164 } from "@/lib/phone";

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
  const sourceDetail = safeSource ?? "external_api";

  // A valid phone goes through resolve_contact (D01, migration 0035): the same
  // locked find-or-create the poller and Ava use, matching every stored format
  // and country variant instead of the exact `.eq("phone", ...)` it replaces.
  // No round-robin here, as before; an existing contact keeps its agent.
  const e164 = safePhone ? toE164(safePhone) : null;
  if (e164) {
    const { data: rows, error } = await db.rpc("resolve_contact", {
      p_phone: e164,
      p_key: keyFromE164(e164),
      p_meta_lead_id: null,
      p_first_name: firstName || null,
      p_last_name: lastName,
      p_source: "social_media",
      p_assign_rr: false,
      p_create_without_agent: true,
    });
    const r = (rows as { outcome: string; contact_id: string | null }[] | null)?.[0];
    // 22023 = the RPC rejected the arguments: a client error, so the caller must not retry it as a 500.
    if (error?.code === "22023") {
      return NextResponse.json({ error: "invalid phone" }, { status: 422 });
    }
    if (error || !r) {
      console.error("[POST /api/leads] resolve_contact error:", error?.code ?? "no row");
      return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
    }
    // Two or more candidates by country variant: nothing is created or chosen; the
    // grouped alert asks a human (contact_match_events).
    if (r.outcome === "ambiguous") {
      return NextResponse.json({ ok: false, error: "ambiguous" }, { status: 409 });
    }
    if (r.outcome === "found" && r.contact_id) {
      return NextResponse.json({ ok: true, id: r.contact_id }, { status: 200 });
    }
    if (r.outcome === "created" && r.contact_id) {
      // The RPC writes the minimal row; the rest goes by id.
      const { error: updErr } = await db
        .from("contacts")
        .update({ source_detail: sourceDetail, agent_notes: safeNotes ?? null })
        .eq("id", r.contact_id);
      if (updErr) console.error("[POST /api/leads] detail update error:", updErr.message);
      return NextResponse.json({ ok: true, id: r.contact_id }, { status: 201 });
    }
    console.error("[POST /api/leads] unexpected resolve_contact outcome:", r.outcome);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }

  // No valid phone: create the contact without one (R8), as before minus the
  // unvalidated phone text.
  const { data, error } = await db
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      phone: null,
      source: "social_media",
      source_detail: sourceDetail,
      agent_notes: safeNotes ?? null,
      lead_status: "new",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[POST /api/leads] Supabase insert error:", error.message);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }

  // A phone was sent but did not validate: the caller learns it was not stored.
  return NextResponse.json(
    { ok: true, id: data.id, ...(safePhone ? { phone_invalid: true } : {}) },
    { status: 201 },
  );
}
