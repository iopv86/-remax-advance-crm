import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("agents")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();

  const role = (agent?.role as string) ?? "agent";

  return (
    <div className="flex h-full">
      <Sidebar role={role} />
      <main className="flex-1 overflow-auto page-bg">
        {children}
      </main>
    </div>
  );
}
