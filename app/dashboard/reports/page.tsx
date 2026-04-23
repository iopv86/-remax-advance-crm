import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Agent role check
  const { data: agent } = await supabase
    .from("agents")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent || !["admin", "manager"].includes(agent.role)) {
    redirect("/dashboard");
  }

  // All deals with agent info
  const { data: deals } = await supabase
    .from("deals")
    .select("id, stage, deal_value, currency, commission_value, created_at, actual_close_date, agent_id")
    .order("created_at", { ascending: false });

  // Agent performance
  const { data: agents } = await supabase
    .from("agents")
    .select("id, full_name, email")
    .eq("is_active", true);

  // Contacts count (leads)
  const { count: totalLeads } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true });

  return (
    <ReportsClient
      deals={(deals ?? []) as DealRow[]}
      agents={(agents ?? []) as AgentRow[]}
      totalLeads={totalLeads ?? 0}
    />
  );
}

export interface DealRow {
  id: string;
  stage: string;
  deal_value: number | null;
  currency: string | null;
  commission_value: number | null;
  created_at: string;
  actual_close_date: string | null;
  agent_id: string | null;
}

export interface AgentRow {
  id: string;
  full_name: string | null;
  email: string;
}
