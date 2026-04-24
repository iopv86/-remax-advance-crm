import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { PropertyDetailClient, type PropertyDetail } from "./property-detail-client";

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const session = await getSessionAgent();

  // All agents can view any property; RLS enforces select=true
  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id, agent_id, title, description, property_type, transaction_type, price, price_max, currency, city, sector, province, address, bedrooms, bathrooms, area_m2, lot_area_m2, parking_spots, floor_number, total_floors, year_built, price_per_m2, amenities, features, images, video_url, virtual_tour_url, mls_number, external_url, status, is_project, is_exclusive, is_featured, created_at, updated_at, agent:agents!properties_agent_id_fkey(id, full_name, email, phone, avatar_url)"
    )
    .eq("id", id)
    .single<PropertyDetail>();

  if (error || !property) return notFound();

  const canEdit =
    property.agent_id === session.agentId || isPrivileged(session.role);

  // Fetch linked deals for this property
  const { data: deals } = await supabase
    .from("deals")
    .select(
      "id, stage, deal_value, currency, priority, created_at, contact:contacts!deals_contact_id_fkey(id, first_name, last_name, phone)"
    )
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <PropertyDetailClient
      property={property}
      deals={(deals as any[]) ?? []}
      canEdit={canEdit}
      initialTab={tab === "unidades" ? "unidades" : "info"}
    />
  );
}
