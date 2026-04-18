import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ObjectivesClient } from "./objectives-client";

export default async function ObjectivesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: role } = await supabase.from("agents").select("role").eq("email", user.email!).maybeSingle();
  if (role && !["admin", "manager"].includes(role.role)) redirect("/dashboard");

  const { data: agents } = await supabase
    .from("agents")
    .select("id, full_name, email, role, is_active, captaciones_objetivo, facturacion_objetivo")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  return <ObjectivesClient agents={agents ?? []} />;
}
