import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { notFound } from "next/navigation";
import type { Contact } from "@/lib/types";
import { ContactEditForm } from "./contact-edit-form";

export default async function ContactEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const supabase = await createClient();
  const session = await getSessionAgent();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (!contact) notFound();
  const privileged = isPrivileged(session.role);
  if (!privileged && contact.agent_id !== session.agentId) notFound();

  // Agent dropdown (privileged only) + property picker options.
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
        contact={contact as Contact}
        agents={agents ?? []}
        properties={(properties ?? []) as { id: string; title: string; city: string | null; sector: string | null }[]}
        privileged={privileged}
        from={from}
      />
    </div>
  );
}
