import { getSessionAgent } from "@/lib/supabase/get-session-agent";
import { PropertyForm } from "@/components/property-form";

export default async function NewPropertyPage() {
  await getSessionAgent(); // auth guard — redirects to /login if unauthenticated
  return <PropertyForm mode="create" />;
}
