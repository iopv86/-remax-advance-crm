import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import type { Property } from "@/lib/types";
import { PropertiesClient } from "./properties-client";

export default async function PropertiesPage() {
  const supabase = await createClient();
  const session = await getSessionAgent();

  // All agents see all properties; write access is enforced per-row in the UI and by RLS
  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (properties as unknown as Property[]) ?? [];

  return (
    <PropertiesClient
      initialProperties={list}
      currentAgentId={session.agentId}
      currentRole={session.role}
    />
  );
}
