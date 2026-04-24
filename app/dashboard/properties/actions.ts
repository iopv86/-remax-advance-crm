"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Property } from "@/lib/types";

// Allow null for any optional field so the form can explicitly clear DB values
type Nullify<T> = { [K in keyof T]: undefined extends T[K] ? T[K] | null : T[K] };
export type PropertyFormPayload = Nullify<Omit<Property, "id" | "created_at" | "agent_id">>;

export type ActionResult =
  | { success: true; id: string }
  | { success: false; error: string };

async function getAgentId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent) redirect("/login");
  return agent.id as string;
}

export async function createProperty(payload: PropertyFormPayload): Promise<ActionResult> {
  const supabase = await createClient();
  const agentId = await getAgentId();

  const { data, error } = await supabase
    .from("properties")
    .insert({ ...payload, agent_id: agentId })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id as string };
}

export async function updateProperty(
  id: string,
  payload: Partial<PropertyFormPayload>,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getAgentId(); // auth check

  const { error } = await supabase
    .from("properties")
    .update(payload)
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  return { success: true, id };
}
