import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CampaignForm } from "../../../_components/CampaignForm";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) notFound();

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
          Editar campaña
        </h1>
        <p className="font-sans text-sm text-muted-foreground mt-1">{campaign.name}</p>
      </div>
      <div className="p-4 md:p-7 max-w-2xl">
        <div className="card-base p-6">
          <CampaignForm
            campaignId={id}
            defaultValues={{
              name:            campaign.name,
              platform:        campaign.platform,
              status:          campaign.status,
              start_date:      campaign.start_date,
              end_date:        campaign.end_date,
              spend:           campaign.spend,
              leads_generated: campaign.leads_generated,
              clicks:          campaign.clicks,
              impressions:     campaign.impressions,
            }}
          />
        </div>
      </div>
    </div>
  );
}
