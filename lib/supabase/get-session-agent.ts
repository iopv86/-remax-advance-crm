import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AgentRole = "admin" | "manager" | "agent" | "viewer";

export interface SessionAgent {
  userId: string;
  agentId: string;
  role: AgentRole;
  email: string;
  fullName: string;
}

/**
 * Returns the authenticated user + their agent row.
 * Redirects to /login if unauthenticated.
 * Call from any server page/component that needs role-based data scoping.
 */
export async function getSessionAgent(): Promise<SessionAgent> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("agents")
    .select("id, role, email, full_name")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent) redirect("/login");

  return {
    userId: user.id,
    agentId: agent.id,
    role: agent.role as AgentRole,
    email: agent.email,
    fullName: agent.full_name,
  };
}

/**
 * Returns true if the role has admin or manager privileges.
 */
export function isPrivileged(role: AgentRole): boolean {
  return role === "admin" || role === "manager";
}
