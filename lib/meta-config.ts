import { createClient } from "@/lib/supabase/server";

export interface MetaRuntimeConfig {
  accessToken: string;
  accountId: string; // without act_ prefix
}

const META_CONFIG_KEYS = ["meta_ad_account_id"] as const;

/**
 * Resolves META_ACCESS_TOKEN (env only) and META_AD_ACCOUNT_ID (env → agency_config fallback).
 * Returns null fields when a value cannot be resolved.
 */
export async function resolveMetaConfig(): Promise<MetaRuntimeConfig | null> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;

  // Env var takes precedence
  const envAccountId = process.env.META_AD_ACCOUNT_ID;
  if (envAccountId) {
    return { accessToken: token, accountId: envAccountId.replace(/^act_/, "") };
  }

  // DB fallback — agency_config
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("agency_config")
      .select("key, value")
      .in("key", [...META_CONFIG_KEYS]);

    const map = Object.fromEntries(
      (data ?? []).map(({ key, value }: { key: string; value: string }) => [key, value ?? ""])
    );

    const dbAccountId = map.meta_ad_account_id ?? "";
    if (!dbAccountId) return null;

    return { accessToken: token, accountId: dbAccountId.replace(/^act_/, "") };
  } catch {
    return null;
  }
}
