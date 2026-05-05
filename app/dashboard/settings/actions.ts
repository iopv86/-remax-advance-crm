"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

interface AvaConfig {
  ava_name: string;
  agency_name: string;
  agency_tagline: string;
  ava_markets: string;
  ava_custom_instructions: string;
}

export async function saveAvaConfig(
  config: AvaConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  // Role guard — only admin/manager can modify agency config
  const { data: callerRole } = await supabase.from("agents").select("role").eq("email", user.email!).single();
  if (!callerRole || !["admin", "manager"].includes(callerRole.role)) {
    return { ok: false, error: "No autorizado" };
  }

  if (config.ava_custom_instructions && config.ava_custom_instructions.length > 5000) {
    return { ok: false, error: "Las instrucciones no pueden superar 5000 caracteres" };
  }

  const rows = (Object.entries(config) as [keyof AvaConfig, string][]).map(
    ([key, value]) => ({ key, value })
  );

  const { error } = await supabase
    .from("agency_config")
    .upsert(rows, { onConflict: "key" });

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

type AgentRole = "admin" | "manager" | "agent" | "viewer";

interface InviteAgentParams {
  email: string;
  fullName: string;
  role: AgentRole;
  phone?: string;
  whatsappNumber?: string;
  maxLeadsPerWeek?: number;
}

export async function inviteAgent(
  params: InviteAgentParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { email, fullName, role, phone, whatsappNumber, maxLeadsPerWeek } = params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  // Role guard — only admin can invite agents
  const { data: callerRole } = await supabase.from("agents").select("role").eq("email", user.email!).single();
  if (!callerRole || callerRole.role !== "admin") {
    return { ok: false, error: "No autorizado" };
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) return { ok: false, error: "Correo inválido" };
  if (!fullName || fullName.trim().length < 2) return { ok: false, error: "Nombre requerido" };
  if (fullName.length > 100) return { ok: false, error: "Nombre muy largo" };

  const validRoles: AgentRole[] = ["admin", "manager", "agent", "viewer"];
  if (!validRoles.includes(role)) return { ok: false, error: "Rol inválido" };

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if email already exists in agents table
  const { data: existing } = await serviceSupabase
    .from("agents")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) return { ok: false, error: "Este agente ya existe en el sistema" };

  const { data: inviteData, error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName.trim() },
  });

  if (inviteError) return { ok: false, error: inviteError.message };

  // Insert agent record immediately so role/phone are set before acceptance
  await serviceSupabase.from("agents").insert({
    id: inviteData.user.id,
    email: email.toLowerCase(),
    full_name: fullName.trim(),
    role,
    phone: phone?.trim() || null,
    whatsapp_number: whatsappNumber?.trim() || null,
    max_leads_per_week: maxLeadsPerWeek ?? null,
    is_active: false, // activated on first login
  });

  return { ok: true };
}

export async function resendInvitation(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: callerRole } = await supabase
    .from("agents")
    .select("role")
    .eq("email", user.email!)
    .single();
  if (!callerRole || callerRole.role !== "admin") {
    return { ok: false, error: "No autorizado" };
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await serviceSupabase.auth.admin.inviteUserByEmail(email);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function deleteAgent(
  agentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: callerRole } = await supabase
    .from("agents")
    .select("role")
    .eq("email", user.email!)
    .single();
  if (!callerRole || callerRole.role !== "admin") {
    return { ok: false, error: "No autorizado" };
  }

  // Prevent self-deletion
  if (agentId === user.id) return { ok: false, error: "No puedes eliminarte a ti mismo" };

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: authError } = await serviceSupabase.auth.admin.deleteUser(agentId);
  if (authError) return { ok: false, error: authError.message };

  // agents row cascades on auth delete, but delete explicitly as fallback
  await serviceSupabase.from("agents").delete().eq("id", agentId);

  return { ok: true };
}
