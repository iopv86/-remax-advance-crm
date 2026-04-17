import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AvaIAClient } from "./ava-ia-client";

const DEFAULT_AGENCY_CONFIG = {
  ava_name: "Ava",
  agency_name: "Advance Estate",
  agency_tagline: "República Dominicana",
  ava_markets:
    "Santo Domingo: Piantini, Naco, Evaristo Morales, La Esperilla, Bella Vista\nSantiago: Jardines Metropolitanos, Los Jardines\nPunta Cana: Cap Cana, Bávaro\nCosta Norte: Las Terrenas, Samaná",
  ava_custom_instructions: "",
};

export default async function AvaIAPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Parallel fetches ────────────────────────────────────────────────────
  const [avaConfigRes, recentMessagesRes, convTodayRes, toneRes, agencyRowsRes] =
    await Promise.allSettled([
      supabase
        .from("ava_config")
        .select("id, is_active, custom_instructions, updated_at")
        .single(),
      supabase
        .from("messages")
        .select("id, contact_id, content, is_automated, created_at, contact:contacts(first_name, last_name)")
        .eq("channel", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("messages")
        .select("contact_id", { count: "exact", head: false })
        .eq("channel", "whatsapp")
        .gte("created_at", (() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); })()),
      supabase
        .from("agency_config")
        .select("value")
        .eq("key", "ava_tone")
        .single(),
      supabase
        .from("agency_config")
        .select("key, value")
        .in("key", ["ava_name", "agency_name", "agency_tagline", "ava_markets", "ava_custom_instructions"]),
    ]);

  const avaConfig =
    avaConfigRes.status === "fulfilled" && !avaConfigRes.value.error
      ? avaConfigRes.value.data
      : null;

  const recentMessages =
    recentMessagesRes.status === "fulfilled"
      ? (recentMessagesRes.value.data ?? [])
      : [];

  const convTodayData =
    convTodayRes.status === "fulfilled"
      ? (convTodayRes.value.data ?? [])
      : [];
  const convToday = new Set(convTodayData.map((m) => m.contact_id)).size;

  const initialTone =
    toneRes.status === "fulfilled" && toneRes.value.data?.value
      ? toneRes.value.data.value
      : "profesional";

  const agencyRows =
    agencyRowsRes.status === "fulfilled"
      ? (agencyRowsRes.value.data ?? [])
      : [];
  const agencyMap = Object.fromEntries(agencyRows.map((r) => [r.key, r.value ?? ""]));
  const agencyConfig = {
    ava_name: agencyMap.ava_name || DEFAULT_AGENCY_CONFIG.ava_name,
    agency_name: agencyMap.agency_name || DEFAULT_AGENCY_CONFIG.agency_name,
    agency_tagline: agencyMap.agency_tagline || DEFAULT_AGENCY_CONFIG.agency_tagline,
    ava_markets: agencyMap.ava_markets || DEFAULT_AGENCY_CONFIG.ava_markets,
    ava_custom_instructions: agencyMap.ava_custom_instructions || "",
  };

  return (
    <AvaIAClient
      initialConfig={avaConfig}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentMessages={recentMessages as any}
      convToday={convToday}
      responseRate={98}
      closedMonth={4}
      initialTone={initialTone}
      agencyConfig={agencyConfig}
    />
  );
}
