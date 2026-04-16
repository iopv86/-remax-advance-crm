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
      .select("is_active, custom_instructions, updated_at")
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

  return (
    <AvaClient
      initialConfig={avaConfig}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentMessages={(recentMessages ?? []) as any}
    />
  );
}
