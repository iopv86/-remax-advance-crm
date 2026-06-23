import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { ContactEditForm } from "../[id]/edit/contact-edit-form";

export default async function ContactCreatePage() {
  const supabase = await createClient();
  const session = await getSessionAgent();
  const privileged = isPrivileged(session.role);

  const [{ data: agents }, { data: properties }] = await Promise.all([
    privileged
      ? supabase.from("agents").select("id, full_name").eq("is_active", true).order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase
      .from("properties")
      .select("id, title, city, sector")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 20px" }}>
      <ContactEditForm
        contact={null}
        agents={agents ?? []}
        properties={(properties ?? []) as { id: string; title: string; city: string | null; sector: string | null }[]}
        privileged={privileged}
        currentAgentId={session.agentId}
      />
    </div>
  );
}
