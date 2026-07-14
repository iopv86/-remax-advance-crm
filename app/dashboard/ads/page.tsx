import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { redirect } from "next/navigation";
import { MetaAdsTab } from "./_components/MetaAdsTab";
import { LeadsEntrantesTab } from "./_components/LeadsEntrantesTab";
import { getIncomingLeads, type IncomingLead, type AgentSummary } from "./_lib/incoming-leads";
import { resolveMetaConfig } from "@/lib/meta-config";

type MetaInsight = {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  date: string;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  spend: number | null;
  leads: number | null;
};

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "meta" ? "meta" : "leads";

  // Role guard — Publicidad (incl. Leads Entrantes) is admin/manager only.
  const session = await getSessionAgent();
  if (!isPrivileged(session.role)) redirect("/dashboard");

  const supabase = await createClient();

  // Fetch only what the active tab needs.
  let leads: IncomingLead[] = [];
  let summaries: AgentSummary[] = [];
  let metaInsights: MetaInsight[] = [];
  const crmLeadsByCampaign: Record<string, number> = {};
  let lastSyncedAt: string | null = null;
  let metaConfigured = false;

  if (tab === "leads") {
    ({ leads, summaries } = await getIncomingLeads(supabase, session));
  } else {
    const [metaInsightsResult, attributedContactsResult, syncConfigResult, metaCfg] = await Promise.all([
      supabase.from("meta_ad_insights").select("*").order("date", { ascending: false }).limit(200),
      supabase.from("contacts").select("meta_campaign_id").not("meta_campaign_id", "is", null),
      supabase.from("agency_config").select("value").eq("key", "meta_last_synced").maybeSingle(),
      resolveMetaConfig(),
    ]);

    metaInsights = (metaInsightsResult.data as MetaInsight[]) ?? [];
    lastSyncedAt = syncConfigResult.data?.value ?? null;
    metaConfigured = !!metaCfg;

    const attributedContacts = attributedContactsResult.data ?? [];
    for (const contact of attributedContacts) {
      const cid = contact.meta_campaign_id as string;
      if (cid) crmLeadsByCampaign[cid] = (crmLeadsByCampaign[cid] ?? 0) + 1;
    }
  }

  const tabs = [
    { id: "leads", label: "Leads Entrantes", href: "/dashboard/ads" },
    { id: "meta", label: "Meta Ads", href: "/dashboard/ads?tab=meta" },
  ];

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
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 border-b" style={{ borderColor: "var(--border)" }}>
          {tabs.map((t) => (
            <a
              key={t.id}
              href={t.href}
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
        {tab === "leads" && (
          <LeadsEntrantesTab leads={leads} summaries={summaries} privileged={isPrivileged(session.role)} />
        )}

        {tab === "meta" && (
          <MetaAdsTab
            insights={metaInsights}
            crmLeadsByCampaign={crmLeadsByCampaign}
            lastSyncedAt={lastSyncedAt}
            metaConfigured={metaConfigured}
          />
        )}
      </div>
    </div>
  );
}
