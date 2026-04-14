"use server";

import { createClient } from "@/lib/supabase/server";

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
