import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

const DEFAULT_AVA_CONFIG = {
  ava_name: "Ava",
  agency_name: "Advance Estate",
  agency_tagline: "República Dominicana",
  ava_markets:
    "Santo Domingo: Piantini, Naco, Evaristo Morales, La Esperilla, Bella Vista\nSantiago: Jardines Metropolitanos, Los Jardines\nPunta Cana: Cap Cana, Bávaro\nCosta Norte: Las Terrenas, Samaná",
  ava_custom_instructions: "",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: agents }, { data: agent }, { data: avaRows }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, full_name, role, phone, email, avatar_url, is_active, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("agents")
      .select("*")
      .eq("email", user?.email ?? "")
      .single(),
    supabase
      .from("agency_config")
      .select("key, value")
      .in("key", [
        "ava_name",
        "agency_name",
        "agency_tagline",
        "ava_markets",
        "ava_custom_instructions",
      ]),
  ]);

  const avaMap = Object.fromEntries(
    (avaRows ?? []).map((r) => [r.key, r.value ?? ""])
  );
  const avaConfig = {
    ava_name: avaMap.ava_name || DEFAULT_AVA_CONFIG.ava_name,
    agency_name: avaMap.agency_name || DEFAULT_AVA_CONFIG.agency_name,
    agency_tagline: avaMap.agency_tagline || DEFAULT_AVA_CONFIG.agency_tagline,
    ava_markets: avaMap.ava_markets || DEFAULT_AVA_CONFIG.ava_markets,
    ava_custom_instructions: avaMap.ava_custom_instructions || "",
  };

  return (
    <Suspense fallback={<div className="p-8 text-sm" style={{ color: "var(--muted-foreground)" }}>Cargando configuración…</div>}>
      <SettingsClient
        agents={agents ?? []}
        currentAgent={agent ?? null}
        currentUser={user}
        avaConfig={avaConfig}
      />
    </Suspense>
  );
}
