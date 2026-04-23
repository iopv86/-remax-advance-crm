import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("agents")
    .select("id, full_name, email, phone, whatsapp_number, role, avatar_url, is_active, max_leads_per_week, created_at, instagram_url, facebook_url, linkedin_url, tiktok_url")
    .eq("email", user.email!)
    .single();

  // Stats queries
  const [
    { count: totalContacts },
    { count: totalDeals },
    { count: dealsWon },
    { count: pendingTasks },
  ] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("agent_id", agent?.id ?? ""),
    supabase.from("deals").select("*", { count: "exact", head: true }).eq("agent_id", agent?.id ?? ""),
    supabase.from("deals").select("*", { count: "exact", head: true }).eq("agent_id", agent?.id ?? "").eq("stage", "cerrado_ganado"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("agent_id", agent?.id ?? "").eq("status", "pending"),
  ]);

  return (
    <ProfileClient
      agent={agent}
      stats={{
        totalContacts: totalContacts ?? 0,
        totalDeals: totalDeals ?? 0,
        dealsWon: dealsWon ?? 0,
        pendingTasks: pendingTasks ?? 0,
      }}
    />
  );
}
