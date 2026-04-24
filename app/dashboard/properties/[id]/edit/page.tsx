import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { PropertyForm } from "@/components/property-form";
import type { Property } from "@/lib/types";

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

  return <PropertyForm mode="edit" initialData={property} />;
}
