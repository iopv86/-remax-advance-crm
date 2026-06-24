"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Property, PropertyOwnerInput } from "@/lib/types";

// Allow null for any optional field so the form can explicitly clear DB values
type Nullify<T> = { [K in keyof T]: undefined extends T[K] ? T[K] | null : T[K] };
export type PropertyFormPayload = Nullify<Omit<Property, "id" | "created_at" | "agent_id">>;

export type ActionResult =
  | { success: true; id: string }
  | { success: false; error: string };

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

export async function createProperty(payload: PropertyFormPayload): Promise<ActionResult> {
  const supabase = await createClient();
  const agentId = await getAgentId();

  const { data, error } = await supabase
    .from("properties")
    .insert({ ...payload, agent_id: agentId })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id as string };
}

export async function updateProperty(
  id: string,
  payload: Partial<PropertyFormPayload>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const agentId = await getAgentId();

  const { error } = await supabase
    .from("properties")
    .update(payload)
    .eq("id", id)
    .eq("agent_id", agentId);

  if (error) return { success: false, error: error.message };
  return { success: true, id };
}

// ─── Property owners (Propietarios) — migration 0017 ──────────────────────────
// Replaces the owner set for a property: primary owner (first) + optional co-owner.
// Authorization is enforced by RLS (property_owners policies delegate to the parent
// property's listing-agent/admin rule). MUST use the user-scoped client below — never
// the service-role client, which bypasses RLS.
const MAX_OWNERS = 5; // UI sends ≤2; cap direct callers
const MAX_FIELD_LEN = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export async function savePropertyOwners(
  propertyId: string,
  owners: PropertyOwnerInput[],
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  await getAgentId(); // ensures an authenticated agent session (redirects otherwise)

  if (!Array.isArray(owners) || owners.length > MAX_OWNERS) {
    return { success: false, error: "Cantidad de propietarios inválida" };
  }

  // Drop rows with no name (an opened-but-empty co-owner becomes no row).
  const rows = owners
    .map((o) => ({
      full_name: cleanField(o.full_name),
      phone: cleanPhone(o.phone),
      email: cleanField(o.email),
      notes: cleanField(o.notes),
    }))
    .filter((o) => o.full_name !== null);

  // Reject malformed emails so the stored value stays a real address.
  for (const o of rows) {
    if (o.email !== null && !EMAIL_RE.test(o.email)) {
      return { success: false, error: "Email del propietario inválido" };
    }
  }

  // Replace-the-set: delete existing owners for this property, then insert the new set.
  // RLS gates both ops to the listing agent / admin-manager of the parent property.
  const { error: delError } = await supabase
    .from("property_owners")
    .delete()
    .eq("property_id", propertyId);
  if (delError) return { success: false, error: delError.message };

  if (rows.length === 0) return { success: true };

  const insertRows = rows.map((o, i) => ({
    property_id: propertyId,
    full_name: o.full_name as string,
    phone: o.phone,
    email: o.email,
    notes: o.notes,
    is_primary: i === 0, // first row is the primary owner
  }));

  const { error: insError } = await supabase
    .from("property_owners")
    .insert(insertRows);
  if (insError) return { success: false, error: insError.message };

  return { success: true };
}
