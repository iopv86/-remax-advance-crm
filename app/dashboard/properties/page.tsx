import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import type { Property } from "@/lib/types";
import { PropertiesClient } from "./properties-client";

export default async function PropertiesPage() {
  const supabase = await createClient();
  const session = await getSessionAgent();

  const [{ data: properties }, { data: projects }] = await Promise.all([
    supabase
      .from("properties")
      .select("*")
      .eq("is_project", false)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("properties")
      .select("*")
      .eq("is_project", true)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <PropertiesClient
      initialProperties={(properties as unknown as Property[]) ?? []}
      projects={(projects as unknown as Property[]) ?? []}
      currentAgentId={session.agentId}
      currentRole={session.role}
    />
  );
}
