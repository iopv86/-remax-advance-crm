import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { RoundRobinClient } from "./round-robin-client";

export default async function RoundRobinPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleRow } = await supabase
    .from("agents")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  if (roleRow && !["admin", "manager"].includes(roleRow.role)) redirect("/dashboard");

  // Load active agents
  const { data: agents } = await supabase
    .from("agents")
    .select("id, full_name, email, role")
    .eq("is_active", true)
    .in("role", ["agent", "manager"])
    .order("full_name");

  // Load current round-robin config
  const { data: config } = await supabase
    .from("round_robin_config")
    .select("id, agent_id, position, is_active")
    .order("position");

  return <RoundRobinClient agents={agents ?? []} config={config ?? []} />;
}
