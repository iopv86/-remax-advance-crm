import { Share2, TrendingUp, MousePointerClick, Users, DollarSign, Link } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface MetaInsight {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  date: string;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  spend: number | null;
  leads: number | null;
}

interface MetaAdsTabProps {
  insights: MetaInsight[];
  crmLeadsByCampaign: Record<string, number>;
  lastSyncedAt: string | null;
  metaConfigured: boolean;
}

export function MetaAdsTab({ insights, crmLeadsByCampaign, lastSyncedAt, metaConfigured }: MetaAdsTabProps) {
  const metaConnected = metaConfigured;
  const metaHasData   = insights.length > 0;

  const metaSpend  = insights.reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const metaLeads  = insights.reduce((s, r) => s + (r.leads ?? 0), 0);
  const metaClicks = insights.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const metaCPL    = metaLeads > 0 ? metaSpend / metaLeads : null;

  if (!metaHasData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5 animate-fade-up-1">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(24,119,242,0.1)" }}
        >
          <Share2 className="w-7 h-7" style={{ color: "#1877f2" }} />
        </div>
        <div className="text-center max-w-sm">
          <h3
            className="font-bold text-lg mb-2"
            style={{ color: "var(--foreground)", fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif" }}
          >
            Meta Ads no configurado
          </h3>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {metaConnected
              ? "Token detectado. Usa Sincronizar para importar datos de tus campañas de Facebook e Instagram."
              : "Para conectar Meta Ads, agrega META_ACCESS_TOKEN y META_AD_ACCOUNT_ID en las variables de entorno de Vercel."}
          </p>
        </div>
        {metaConnected ? (
          <form action="/api/meta/sync" method="POST">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: "rgba(24,119,242,0.12)", color: "#1877f2", border: "1px solid rgba(24,119,242,0.2)" }}
            >
              Sincronizar campañas
            </button>
          </form>
        ) : (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs"
            style={{ background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
          >
            <Link className="w-3.5 h-3.5" />
            Vercel → Settings → Environment Variables → <span className="font-mono font-bold">META_ACCESS_TOKEN</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Meta KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up-1">
        {[
          { label: "Gasto Meta",  value: "$" + metaSpend.toLocaleString("es-DO", { minimumFractionDigits: 0 }), icon: DollarSign,        accent: "#1877f2",              muted: "rgba(24,119,242,0.1)" },
          { label: "Leads Meta",  value: metaLeads,                                                              icon: Users,             accent: "var(--teal)",          muted: "var(--teal-muted)" },
          { label: "Clics Meta",  value: metaClicks.toLocaleString(),                                            icon: MousePointerClick, accent: "var(--amber)",         muted: "var(--amber-muted)" },
          { label: "CPL Meta",    value: metaCPL != null ? "$" + metaCPL.toFixed(0) : "—",                      icon: TrendingUp,        accent: "oklch(0.55 0.18 280)", muted: "oklch(0.55 0.18 280 / 10%)" },
        ].map(({ label, value, icon: Icon, accent, muted }) => (
          <div key={label} className="card-glow p-5">
            <div className="p-2 rounded-lg w-fit mb-4" style={{ background: muted }}>
              <Icon className="w-4 h-4" style={{ color: accent }} />
            </div>
            <p className="stat-number" style={{ fontSize: "34px" }}>{value}</p>
            <p className="font-sans text-muted-foreground mt-1" style={{ fontSize: "12px" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Meta insights table */}
      <div className="card-base overflow-hidden animate-fade-up-2">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4" style={{ color: "#1877f2" }} />
            <span className="font-sans font-semibold text-sm text-foreground">Campañas Meta Ads</span>
          </div>
          <div className="flex items-center gap-3">
            {lastSyncedAt && (
              <span className="font-mono text-xs text-muted-foreground">
                Última sync: {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true, locale: es })}
              </span>
            )}
            <form action="/api/meta/sync" method="POST">
              <button type="submit" className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors" style={{ background: "rgba(24,119,242,0.1)", color: "#1877f2" }}>
                Sincronizar
              </button>
            </form>
          </div>
        </div>
        <div className="divide-y overflow-x-auto" style={{ borderColor: "var(--border)" }}>
          <div className="grid px-6 py-3" style={{ gridTemplateColumns: "1fr 100px 90px 80px 80px 80px 70px 80px" }}>
            {["Campaña", "Fecha", "Impresiones", "Reach", "Freq.", "Clics", "Gasto", "Leads CRM"].map((h) => (
              <span key={h} className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">{h}</span>
            ))}
          </div>
          {insights.map((r) => {
            const reach     = r.reach ?? 0;
            const frequency = reach > 0 ? ((r.impressions ?? 0) / reach).toFixed(2) : "—";
            const crmLeads  = crmLeadsByCampaign[r.campaign_id] ?? 0;
            return (
              <div key={r.id} className="grid items-center px-6 py-3.5" style={{ gridTemplateColumns: "1fr 100px 90px 80px 80px 80px 70px 80px" }}>
                <p className="font-sans text-sm text-foreground truncate">{r.campaign_name ?? r.campaign_id}</p>
                <span className="font-mono text-xs text-muted-foreground">{r.date}</span>
                <span className="font-mono text-sm text-muted-foreground">{(r.impressions ?? 0).toLocaleString()}</span>
                <span className="font-mono text-sm text-muted-foreground">{reach > 0 ? reach.toLocaleString() : "—"}</span>
                <span className="font-mono text-sm text-muted-foreground">{frequency}</span>
                <span className="font-mono text-sm text-muted-foreground">{(r.clicks ?? 0).toLocaleString()}</span>
                <span className="font-mono text-sm text-foreground">${Number(r.spend ?? 0).toFixed(0)}</span>
                <span className="font-mono text-sm font-semibold" style={{ color: crmLeads > 0 ? "var(--teal)" : "var(--muted-foreground)" }}>
                  {crmLeads > 0 ? crmLeads : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
