import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { redirect } from "next/navigation";
import { ObjectivesClient } from "./objectives-client";

export default async function ObjectivesPage() {
  // Role guard — admin and manager only. Fails closed: getSessionAgent redirects
  // to /login when the authenticated user has no agents row.
  const session = await getSessionAgent();
  if (!isPrivileged(session.role)) redirect("/dashboard");

  const supabase = await createClient();

  const { data: agents } = await supabase
    .from("agents")
    .select("id, full_name, email, role, is_active, captaciones_objetivo, facturacion_objetivo")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  return <ObjectivesClient agents={agents ?? []} />;
}
