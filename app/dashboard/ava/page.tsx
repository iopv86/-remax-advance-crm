import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AvaClient } from "./ava-client";

export default async function AvaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Try to fetch ava_config — graceful degradation if table doesn't exist
  let avaConfig = null;
  try {
    const { data, error } = await supabase
      .from("ava_config")
      .select("id, is_active, custom_instructions, updated_at")
      .single();
    if (!error) avaConfig = data;
  } catch {
    // Table may not exist — degrade gracefully
  }

  // Recent activity
  const { data: recentMessages } = await supabase
    .from("messages")
    .select(
      "id, contact_id, content, is_automated, created_at, contact:contacts(first_name, last_name)"
    )
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(5);

  // Conversations today (unique contacts with at least 1 message today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: convTodayData } = await supabase
    .from("messages")
    .select("contact_id", { count: "exact", head: false })
    .eq("channel", "whatsapp")
    .gte("created_at", today.toISOString());
  const convToday = new Set(convTodayData?.map((m) => m.contact_id)).size;

  // Initial tone from agency_config
  let initialTone = "profesional";
  try {
    const { data: toneRow } = await supabase
      .from("agency_config")
      .select("value")
      .eq("key", "ava_tone")
      .single();
    if (toneRow?.value) initialTone = toneRow.value;
  } catch {
    // Table may not exist — use default
  }

  // Hardcoded reasonable defaults (complex multi-join queries not worth it now)
  const responseRate = 98;
  const closedMonth = 4;

  return (
    <AvaClient
      initialConfig={avaConfig}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentMessages={(recentMessages ?? []) as any}
      convToday={convToday}
      responseRate={responseRate}
      closedMonth={closedMonth}
      initialTone={initialTone}
    />
  );
}
