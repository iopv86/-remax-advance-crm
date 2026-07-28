import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { redirect } from "next/navigation";
import { RoundRobinClient } from "./round-robin-client";

export default async function RoundRobinPage() {
  // Role guard — admin and manager only. Fails closed: getSessionAgent redirects
  // to /login when the authenticated user has no agents row.
  const session = await getSessionAgent();
  if (!isPrivileged(session.role)) redirect("/dashboard");

  const supabase = await createClient();

  // Load active agents
  const { data: agents } = await supabase
    .from("agents")
    .select("id, full_name, email, role")
    .eq("is_active", true)
    .in("role", ["agent", "manager", "admin"])
    .order("full_name");

  // Load current round-robin config
  const { data: config } = await supabase
    .from("round_robin_config")
    .select("id, agent_id, position, is_active")
    .order("position");

  return <RoundRobinClient agents={agents ?? []} config={config ?? []} />;
}
