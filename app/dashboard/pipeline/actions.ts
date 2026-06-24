"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { DealPartyInput, DealPartyType } from "@/lib/types";

async function getAgentId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent) redirect("/login");
  return agent.id as string;
}

// ─── Deal parties (Co-comprador / Referidor) — migration 0018 ─────────────────
// Replaces the party set for a deal: co-buyers + referrers. Authorization is
// enforced by RLS (deal_parties policies delegate to the parent deal's
// owning-agent/admin-manager rule). MUST use the user-scoped client below — never
// the service-role client, which bypasses RLS.
const MAX_PARTIES = 10; // UI sends ≤2; cap direct callers
const MAX_FIELD_LEN = 300;
const VALID_TYPES: readonly DealPartyType[] = ["co_buyer", "referrer"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanField(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (t.length === 0) return null;
  return t.slice(0, MAX_FIELD_LEN);
}

// Keep only URL-safe phone characters so tel:/wa.me hrefs can't be hijacked
// (e.g. "809?text=spam"). Allows digits, +, spaces, dashes, parentheses.
function cleanPhone(v: string | null | undefined): string | null {
  const t = cleanField(v);
  if (t === null) return null;
  const safe = t.replace(/[^0-9+()\-\s]/g, "").trim();
  return safe.length > 0 ? safe : null;
}

export async function saveDealParties(
  dealId: string,
  parties: DealPartyInput[],
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  await getAgentId(); // ensures an authenticated agent session (redirects otherwise)

  // Validate the id shape before any DB op so a bad value can't leak a raw
  // Postgres "invalid input syntax for type uuid" message to the client.
  if (!UUID_RE.test(dealId)) {
    return { success: false, error: "ID de oportunidad inválido" };
  }

  if (!Array.isArray(parties) || parties.length > MAX_PARTIES) {
    return { success: false, error: "Cantidad de partes inválida" };
  }

  // Reject unknown party types before they reach the DB (input is untrusted).
  for (const p of parties) {
    if (!VALID_TYPES.includes(p.party_type)) {
      return { success: false, error: "Tipo de parte inválido" };
    }
  }

  // Drop rows with no name (an opened-but-empty party becomes no row).
  const rows = parties
    .map((p) => ({
      party_type: p.party_type,
      full_name: cleanField(p.full_name),
      phone: cleanPhone(p.phone),
      relationship: cleanField(p.relationship),
      notes: cleanField(p.notes),
    }))
    .filter((p) => p.full_name !== null);

  // Replace-the-set: delete existing parties for this deal, then insert the new set.
  // RLS gates both ops to the owning agent / admin-manager of the parent deal.
  const { error: delError } = await supabase
    .from("deal_parties")
    .delete()
    .eq("deal_id", dealId);
  if (delError) return { success: false, error: delError.message };

  if (rows.length === 0) return { success: true };

  const insertRows = rows.map((p) => ({
    deal_id: dealId,
    party_type: p.party_type,
    full_name: p.full_name as string,
    phone: p.phone,
    relationship: p.relationship,
    notes: p.notes,
  }));

  const { error: insError } = await supabase
    .from("deal_parties")
    .insert(insertRows);
  if (insError) return { success: false, error: insError.message };

  return { success: true };
}
