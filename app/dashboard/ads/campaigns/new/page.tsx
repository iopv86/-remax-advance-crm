import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CampaignForm } from "../../_components/CampaignForm";

export default async function NewCampaignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: agent } = await supabase
    .from("agents")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  if (!agent || !["admin", "manager"].includes(agent.role)) redirect("/dashboard");

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="page-header animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
          Marketing
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: "-0.02em",
            color: "var(--foreground)",
            lineHeight: 1.1,
          }}
        >
          Nueva campaña
        </h1>
      </div>
      <div className="p-4 md:p-7 max-w-2xl">
        <div className="card-base p-6">
          <CampaignForm />
        </div>
      </div>
    </div>
  );
}
