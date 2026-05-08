import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { CampanasTab } from "./_components/CampanasTab";
import { MetaAdsTab } from "./_components/MetaAdsTab";

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "meta" ? "meta" : "campanas";

  const supabase = await createClient();

  // Role guard — only admin and manager
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email) {
    const { data: agent } = await supabase.from("agents").select("role").eq("email", user.email).maybeSingle();
    if (agent && !["admin", "manager"].includes(agent.role)) redirect("/dashboard");
  }

  // Parallel data fetching
  const [
    campaignsResult,
    metaInsightsResult,
    attributedContactsResult,
    syncConfigResult,
  ] = await Promise.all([
    supabase.from("campaigns").select("*").order("start_date", { ascending: false }).limit(50),
    supabase.from("meta_ad_insights").select("*").order("date", { ascending: false }).limit(200),
    supabase.from("contacts").select("meta_campaign_id").not("meta_campaign_id", "is", null),
    supabase.from("agency_config").select("value").eq("key", "meta_last_synced").maybeSingle(),
  ]);

  const campaigns         = campaignsResult.data ?? [];
  const metaInsights      = metaInsightsResult.data ?? [];
  const attributedContacts = attributedContactsResult.data ?? [];
  const lastSyncedAt      = syncConfigResult.data?.value ?? null;

  // Build attribution map: meta_campaign_id → CRM lead count
  const crmLeadsByCampaign: Record<string, number> = {};
  for (const contact of attributedContacts) {
    const cid = contact.meta_campaign_id as string;
    if (cid) crmLeadsByCampaign[cid] = (crmLeadsByCampaign[cid] ?? 0) + 1;
  }

  const active = campaigns.filter((c) => c.status === "active");

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">Marketing</p>
            <h1
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700, fontSize: 30, letterSpacing: "-0.02em",
                color: "var(--foreground)", lineHeight: 1.1,
              }}
            >
              Publicidad
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-amber-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm backdrop-blur">
            <Megaphone className="h-3.5 w-3.5" />
            {active.length} activas
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 border-b" style={{ borderColor: "var(--border)" }}>
          {[
            { id: "campanas", label: "Campañas" },
            { id: "meta",     label: "Meta Ads" },
          ].map((t) => (
            <a
              key={t.id}
              href={t.id === "campanas" ? "/dashboard/ads" : `/dashboard/ads?tab=${t.id}`}
              className="px-4 py-2 text-sm font-semibold transition-colors relative"
              style={
                tab === t.id
                  ? { color: "#C9963A", borderBottom: "2px solid #C9963A", marginBottom: -1 }
                  : { color: "var(--muted-foreground)" }
              }
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-7 space-y-6">
        {tab === "campanas" && (
          <CampanasTab campaigns={campaigns} />
        )}

        {tab === "meta" && (
          <MetaAdsTab
            insights={metaInsights}
            crmLeadsByCampaign={crmLeadsByCampaign}
            lastSyncedAt={lastSyncedAt}
          />
        )}
      </div>
    </div>
  );
}
