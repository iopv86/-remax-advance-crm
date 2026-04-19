import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { VisitasClient } from "./visitas-client";

export default async function VisitasPage() {
  const supabase = await createClient();
  const session = await getSessionAgent();

  let showingsQuery = supabase
    .from("showings")
    .select(
      "id, deal_id, property_id, contact_id, agent_id, scheduled_at, duration_minutes, status, client_feedback, client_interest_level, agent_notes, meeting_point, confirmed_at, completed_at, cancelled_at, cancel_reason, created_at, property:properties!showings_property_id_fkey(id, title, city, sector, images, price, currency, property_type), contact:contacts!showings_contact_id_fkey(id, first_name, last_name, phone)"
    )
    .order("scheduled_at", { ascending: true });

  // Agents only see their own showings
  if (!isPrivileged(session.role)) {
    showingsQuery = showingsQuery.eq("agent_id", session.agentId);
  }

  const { data: showings } = await showingsQuery;

  // Contacts for the schedule modal picker
  let contactsQuery = supabase
    .from("contacts")
    .select("id, first_name, last_name, phone")
    .order("first_name", { ascending: true })
    .limit(200);

  if (!isPrivileged(session.role)) {
    contactsQuery = contactsQuery.eq("agent_id", session.agentId);
  }

  const { data: contacts } = await contactsQuery;

  // Properties for the schedule modal picker (all — agents can show any property)
  const { data: properties } = await supabase
    .from("properties")
    .select("id, title, city, sector, property_type, price, currency, images")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <VisitasClient
      initialShowings={(showings as any[]) ?? []}
      contacts={(contacts as any[]) ?? []}
      properties={(properties as any[]) ?? []}
      currentAgentId={session.agentId}
      isPrivileged={isPrivileged(session.role)}
    />
  );
}
