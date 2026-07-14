import { redirect } from "next/navigation";

// Leads Entrantes se consolidó dentro de Publicidad (/dashboard/ads?tab=leads).
// Redirect para cualquier enlace/bookmark antiguo.
export default function LeadsEntrantesPage() {
  redirect("/dashboard/ads?tab=leads");
}
