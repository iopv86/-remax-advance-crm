import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { PropertyDetailClient } from "./property-detail-client";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSessionAgent();

  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id, agent_id, title, description, property_type, transaction_type, price, currency, city, sector, province, address, bedrooms, bathrooms, area_m2, lot_area_m2, parking_spots, floor_number, total_floors, year_built, price_per_m2, amenities, features, images, video_url, virtual_tour_url, mls_number, external_url, status, created_at, updated_at, agent:agents!properties_agent_id_fkey(id, full_name, email, phone, avatar_url)"
    )
    .eq("id", id)
    .single();

  if (error || !property) return notFound();

  // Non-privileged agents can only view their own properties
  if (!isPrivileged(session.role) && property.agent_id !== session.agentId) {
    redirect("/dashboard/properties");
  }

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
      property={property as any}
      deals={(deals as any[]) ?? []}
    />
  );
}
