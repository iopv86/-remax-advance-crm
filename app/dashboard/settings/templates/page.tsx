import { createClient } from "@/lib/supabase/server";
import { getSessionAgent } from "@/lib/supabase/get-session-agent";
import { redirect } from "next/navigation";
import { TemplatesClient } from "./templates-client";

export default async function TemplatesPage() {
  const session = await getSessionAgent();
  if (session.role !== "admin") redirect("/dashboard/settings");

  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("whatsapp_templates")
    .select("id, name, category, language, content, variables, wa_template_id, is_approved, created_at")
    .order("created_at", { ascending: false });

  return <TemplatesClient initialTemplates={templates ?? []} />;
}
