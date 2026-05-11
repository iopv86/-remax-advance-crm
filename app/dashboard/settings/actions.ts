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

  // Invite via email — redirectTo sends agent to /auth/confirm which routes them to /auth/set-password
  const { data: inviteData, error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName.trim() },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://remax-advance-crm.vercel.app"}/auth/confirm`,
  });

  if (inviteError) return { ok: false, error: inviteError.message };

  // Insert agent record immediately so role/phone are set before acceptance
  const { error: insertErr } = await serviceSupabase.from("agents").insert({
    id: inviteData.user.id,
    email: email.toLowerCase(),
    full_name: fullName.trim(),
    role,
    phone: phone?.trim() || null,
    whatsapp_number: whatsappNumber?.trim() || null,
    max_leads_per_week: maxLeadsPerWeek ?? null,
    is_active: false,
  });

  if (insertErr) {
    // Rollback: delete the auth user to avoid orphaned account
    await serviceSupabase.auth.admin.deleteUser(inviteData.user.id);
    return { ok: false, error: insertErr.message };
  }

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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://remax-advance-crm.vercel.app";

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm`,
  });

  if (!inviteError) return { ok: true };

  // If the user already exists in auth (re-invite scenario), send a password
  // reset email instead — same UX: user clicks link → /auth/set-password
  const alreadyExists =
    inviteError.message.toLowerCase().includes("already been registered") ||
    inviteError.message.toLowerCase().includes("already registered");

  if (alreadyExists) {
    const { error: resetError } = await serviceSupabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/confirm`,
    });
    if (resetError) return { ok: false, error: resetError.message };
    return { ok: true };
  }

  return { ok: false, error: inviteError.message };
}

const ALLOWED_SITE_ORIGINS = ["https://remax-advance-crm.vercel.app"];

export async function generateInviteLink(
  email: string
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
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

  const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://remax-advance-crm.vercel.app";
  let origin: string;
  try {
    origin = new URL(rawSiteUrl).origin;
  } catch {
    return { ok: false, error: "Configuración de URL del sitio inválida" };
  }
  if (!ALLOWED_SITE_ORIGINS.includes(origin)) {
    return { ok: false, error: "Configuración de URL del sitio inválida" };
  }
  const siteUrl = origin;

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Try invite link first (pending agents); fall back to recovery link (already confirmed).
  // WARNING: the returned action_link is a single-use auth token — treat it as a credential.
  const { data, error } = await serviceSupabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${siteUrl}/auth/confirm` },
  });

  if (!error) return { ok: true, link: data.properties.action_link };

  const { data: recData, error: recError } = await serviceSupabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${siteUrl}/auth/confirm` },
  });

  if (recError) return { ok: false, error: recError.message };
  return { ok: true, link: recData.properties.action_link };
}

export async function sendAgentPasswordReset(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: callerRole } = await supabase.from("agents").select("role").eq("email", user.email!).single();
  if (!callerRole || callerRole.role !== "admin") {
    return { ok: false, error: "No autorizado" };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?type=recovery`,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateAgent(params: {
  agentId: string;
  fullName: string;
  role: AgentRole;
  phone?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { agentId, fullName, role, phone } = params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: callerRole } = await supabase.from("agents").select("role").eq("email", user.email!).single();
  if (!callerRole || callerRole.role !== "admin") {
    return { ok: false, error: "No autorizado" };
  }

  if (!fullName || fullName.trim().length < 2) return { ok: false, error: "Nombre requerido" };
  if (fullName.length > 100) return { ok: false, error: "Nombre muy largo" };

  const validRoles: AgentRole[] = ["admin", "manager", "agent", "viewer"];
  if (!validRoles.includes(role)) return { ok: false, error: "Rol inválido" };

  const { error } = await supabase
    .from("agents")
    .update({ full_name: fullName.trim(), role, phone: phone?.trim() || null })
    .eq("id", agentId);

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
  await serviceSupabase.from("agents").delete().eq("id", agentId); // ignore error — cascade may have already removed it

  return { ok: true };
}

// ── Meta Ads config ──────────────────────────────────
// Secrets (ACCESS_TOKEN, APP_SECRET, WEBHOOK_VERIFY_TOKEN) are stored in Vercel env vars only.
// Non-secret identifiers are stored in agency_config and editable via the UI.

const META_DB_KEYS = [
  "meta_pixel_id",
  "meta_ad_account_id",
  "meta_phone_number_id",
  "meta_lead_template_name",
] as const;

export type MetaDbKey = (typeof META_DB_KEYS)[number];

export interface MetaDbConfig {
  meta_pixel_id: string;
  meta_ad_account_id: string;
  meta_phone_number_id: string;
  meta_lead_template_name: string;
}

export interface MetaEnvStatus {
  has_access_token: boolean;
  has_app_secret: boolean;
  has_webhook_verify_token: boolean;
}

export interface MetaFullConfig {
  db: MetaDbConfig;
  env: MetaEnvStatus;
}

async function assertAdminOrManager(supabase: Awaited<ReturnType<typeof createClient>>, email: string) {
  const { data } = await supabase.from("agents").select("role").eq("email", email).single();
  if (!data || !["admin", "manager"].includes(data.role)) throw new Error("No autorizado");
}

export async function getMetaConfig(): Promise<MetaFullConfig> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return {
      db: { meta_pixel_id: "", meta_ad_account_id: "", meta_phone_number_id: "", meta_lead_template_name: "" },
      env: { has_access_token: false, has_app_secret: false, has_webhook_verify_token: false },
    };
  }

  try {
    await assertAdminOrManager(supabase, user.email);
  } catch {
    return {
      db: { meta_pixel_id: "", meta_ad_account_id: "", meta_phone_number_id: "", meta_lead_template_name: "" },
      env: { has_access_token: false, has_app_secret: false, has_webhook_verify_token: false },
    };
  }

  const { data } = await supabase
    .from("agency_config")
    .select("key, value")
    .in("key", [...META_DB_KEYS]);

  const map = Object.fromEntries(
    (data ?? []).map(({ key, value }: { key: string; value: string }) => [key, value ?? ""])
  );

  return {
    db: {
      meta_pixel_id: map.meta_pixel_id ?? "",
      meta_ad_account_id: map.meta_ad_account_id ?? "",
      meta_phone_number_id: map.meta_phone_number_id ?? "",
      meta_lead_template_name: map.meta_lead_template_name ?? "",
    },
    env: {
      has_access_token: Boolean(process.env.META_ACCESS_TOKEN),
      has_app_secret: Boolean(process.env.META_APP_SECRET),
      has_webhook_verify_token: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
    },
  };
}

export async function saveMetaConfig(
  config: Partial<MetaDbConfig>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "No autorizado" };

  try {
    await assertAdminOrManager(supabase, user.email);
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  const FIELD_LIMITS: Record<MetaDbKey, { max: number; pattern?: RegExp; hint: string }> = {
    meta_pixel_id:          { max: 20,  pattern: /^\d{1,20}$/,          hint: "solo dígitos, máx 20" },
    meta_ad_account_id:     { max: 25,  pattern: /^(act_)?\d{1,20}$/,   hint: "formato act_XXXXXXXX o solo dígitos" },
    meta_phone_number_id:   { max: 20,  pattern: /^\d{1,20}$/,          hint: "solo dígitos, máx 20" },
    meta_lead_template_name:{ max: 100, pattern: /^[a-z0-9_]{1,100}$/,  hint: "letras minúsculas, números y guion bajo" },
  };

  const validKeys = new Set<string>(META_DB_KEYS);
  const rows: { key: string; value: string }[] = [];

  for (const [key, val] of Object.entries(config)) {
    if (!validKeys.has(key) || val === undefined) continue;
    const trimmed = (val as string).trim();
    if (!trimmed) { rows.push({ key, value: "" }); continue; } // allow clearing
    const rule = FIELD_LIMITS[key as MetaDbKey];
    if (trimmed.length > rule.max) return { ok: false, error: `${key}: excede ${rule.max} caracteres` };
    if (rule.pattern && !rule.pattern.test(trimmed)) return { ok: false, error: `${key}: formato inválido (${rule.hint})` };
    rows.push({ key, value: trimmed });
  }

  if (rows.length === 0) return { ok: true };

  const { error } = await supabase.from("agency_config").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

async function validateMetaToken(
  token: string
): Promise<{ ok: boolean; name?: string; error?: string }> {
  if (!token || token.trim().length < 10) return { ok: false, error: "Token inválido" };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me`,
      {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: "no-store",
      }
    );
    const json = (await res.json()) as {
      name?: string;
      id?: string;
      error?: { message: string };
    };
    if (json.error) return { ok: false, error: json.error.message };
    return { ok: true, name: json.name };
  } catch {
    return { ok: false, error: "Error de conexión con Meta" };
  }
}

// Validates the META_ACCESS_TOKEN stored in Vercel env vars (no client input needed)
export async function testMetaConnection(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "No autorizado" };

  try {
    await assertAdminOrManager(supabase, user.email);
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "META_ACCESS_TOKEN no está configurado en Vercel" };
  return validateMetaToken(token);
}
