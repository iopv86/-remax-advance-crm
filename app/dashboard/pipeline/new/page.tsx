import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { DealEditForm } from "../[deal_id]/edit/deal-edit-form";

export default async function DealCreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const session = await getSessionAgent();
  const privileged = isPrivileged(session.role);

  let contactsQuery = supabase
    .from("contacts")
    .select("id, first_name, last_name, agent_id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!privileged) contactsQuery = contactsQuery.eq("agent_id", session.agentId);

  const [{ data: contacts }, { data: properties }] = await Promise.all([
    contactsQuery,
    supabase
      .from("properties")
      .select("id, title, city, sector")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 20px" }}>
      <DealEditForm
        deal={null}
        contacts={(contacts ?? []) as { id: string; first_name: string | null; last_name: string | null; agent_id: string | null }[]}
        properties={(properties ?? []) as { id: string; title: string; city: string | null; sector: string | null }[]}
        currentAgentId={session.agentId}
      />
    </div>
  );
}
