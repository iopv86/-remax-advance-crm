import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import type { Property } from "@/lib/types";
import { PropertiesClient } from "./properties-client";

export default async function PropertiesPage() {
  const supabase = await createClient();
  const session = await getSessionAgent();

  let query = supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!isPrivileged(session.role)) {
    query = query.eq("agent_id", session.agentId);
  }

  const { data: properties } = await query;

  const list = (properties as unknown as Property[]) ?? [];

  return <PropertiesClient initialProperties={list} />;
}
