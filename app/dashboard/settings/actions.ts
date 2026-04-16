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

  if (config.ava_custom_instructions && config.ava_custom_instructions.length > 5000) {
    return { ok: false, error: "Las instrucciones no pueden superar 5000 caracteres" };
  }

  const entries = Object.entries(config) as [keyof AvaConfig, string][];

  for (const [key, value] of entries) {
    const { error } = await supabase
      .from("agency_config")
      .upsert({ key, value }, { onConflict: "key" });

    if (error) {
      return { ok: false, error: error.message };
    }
  }

  return { ok: true };
}

export async function inviteAgent(
  email: string,
  fullName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) return { ok: false, error: "Correo inválido" };
  if (!fullName || fullName.trim().length < 2) return { ok: false, error: "Nombre requerido" };
  if (fullName.length > 100) return { ok: false, error: "Nombre muy largo" };

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName.trim() },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
