import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { PropertyForm } from "@/components/property-form";
import type { Property, PropertyOwner } from "@/lib/types";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSessionAgent();

  const { data: property, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single<Property>();

  if (error || !property) return notFound();

  const canEdit =
    property.agent_id === session.agentId || isPrivileged(session.role);

  if (!canEdit) return notFound();

  // Owners are PII (owner-scoped RLS). Only the authorized editor reaches here.
  const { data: owners } = await supabase
    .from("property_owners")
    .select("id, property_id, full_name, phone, email, notes, is_primary, created_at, updated_at")
    .eq("property_id", id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  return (
    <PropertyForm
      mode="edit"
      initialData={property}
      initialOwners={(owners as PropertyOwner[]) ?? []}
    />
  );
}
