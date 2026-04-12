import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-auto" style={{ background: "radial-gradient(circle at top left, rgba(219,234,254,0.5), transparent 30%), linear-gradient(180deg,#f8fbff 0%,#f3f7fb 50%,#eef3f9 100%)" }}>
        {children}
      </main>
    </div>
  );
}
