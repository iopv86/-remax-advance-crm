import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Megaphone, TrendingUp, MousePointerClick, Users, DollarSign, Eye, Share2, Link } from "lucide-react";

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Share2",
  instagram: "Instagram",
  google: "Google Ads",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  ctwa: "CTWA",
  other: "Otro",
};

const PLATFORM_COLOR: Record<string, string> = {
  facebook: "oklch(0.45 0.15 250)",
  instagram: "oklch(0.55 0.20 340)",
  google: "var(--red)",
  tiktok: "oklch(0.5 0.18 180)",
  whatsapp: "oklch(0.5 0.16 145)",
  ctwa: "var(--teal)",
  other: "var(--muted-foreground)",
};

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

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(50);

  const { data: metaInsights } = await supabase
    .from("meta_ad_insights")
    .select("*")
    .order("date", { ascending: false })
    .limit(200);

  const active      = (campaigns ?? []).filter((c) => c.status === "active");
  const totalSpend  = (campaigns ?? []).reduce((sum, c) => sum + (c.spend ?? 0), 0);
  const totalLeads  = (campaigns ?? []).reduce((sum, c) => sum + (c.leads_generated ?? 0), 0);
  const totalClicks = (campaigns ?? []).reduce((sum, c) => sum + (c.clicks ?? 0), 0);
  const avgCPL      = totalLeads > 0 ? totalSpend / totalLeads : 0;

  const metaConnected  = !!process.env.META_ACCESS_TOKEN;
  const metaHasData    = (metaInsights ?? []).length > 0;
  const metaSpend      = (metaInsights ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const metaLeads      = (metaInsights ?? []).reduce((s, r) => s + (r.leads ?? 0), 0);
  const metaClicks     = (metaInsights ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0);
  const metaCPL        = metaLeads > 0 ? metaSpend / metaLeads : null;

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
        {/* ── TAB: Campañas ─────────────────────────────────────────────────── */}
        {tab === "campanas" && (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up-1">
              {[
                { label: "Gasto total",    value: "$" + totalSpend.toLocaleString(),  icon: DollarSign,       accent: "var(--red)",               muted: "var(--red-muted)" },
                { label: "Leads generados",value: totalLeads,                          icon: Users,            accent: "var(--teal)",              muted: "var(--teal-muted)" },
                { label: "Clics totales",  value: totalClicks.toLocaleString(),        icon: MousePointerClick,accent: "var(--amber)",             muted: "var(--amber-muted)" },
                { label: "Costo por lead", value: "$" + avgCPL.toFixed(0),             icon: TrendingUp,       accent: "oklch(0.55 0.18 280)",     muted: "oklch(0.55 0.18 280 / 10%)" },
              ].map(({ label, value, icon: Icon, accent, muted }) => (
                <div key={label} className="card-glow p-5">
                  <div className="p-2 rounded-lg w-fit mb-4" style={{ background: muted }}>
                    <Icon className="w-4 h-4" style={{ color: accent }} />
                  </div>
                  <p className="stat-number animate-count" style={{ fontSize: "34px" }}>{value}</p>
                  <p className="font-sans text-muted-foreground mt-1" style={{ fontSize: "12px" }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Campaigns table */}
            <div className="card-base overflow-hidden animate-fade-up-2">
              <div className="flex items-center gap-2 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <Megaphone className="w-4 h-4" style={{ color: "var(--amber)" }} />
                <span className="font-sans font-semibold text-sm text-foreground">Campañas</span>
              </div>

              {(campaigns ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Megaphone className="w-10 h-10 mb-3 opacity-20" />
                  <p className="font-sans text-sm">No hay campañas registradas.</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  <div className="grid px-6 py-3 overflow-x-auto" style={{ gridTemplateColumns: "1fr 100px 80px 80px 80px 80px 80px" }}>
                    {["Campaña", "Plataforma", "Estado", "Gasto", "Leads", "Clics", "CPL"].map((h) => (
                      <span key={h} className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">{h}</span>
                    ))}
                  </div>
                  {(campaigns ?? []).map((c) => {
                    const cpl = c.leads_generated > 0 ? (c.spend ?? 0) / c.leads_generated : null;
                    const platformColor = PLATFORM_COLOR[c.platform] ?? "var(--muted-foreground)";
                    return (
                      <div key={c.id} className="grid items-center px-6 py-3.5 table-row-hover transition-colors" style={{ gridTemplateColumns: "1fr 100px 80px 80px 80px 80px 80px" }}>
                        <div>
                          <p className="font-sans font-medium text-sm text-foreground truncate">{c.name}</p>
                          {(c.start_date || c.end_date) && (
                            <p className="font-mono text-xs text-muted-foreground mt-0.5">
                              {c.start_date ? new Date(c.start_date).toLocaleDateString("es-DO", { day: "2-digit", month: "short" }) : ""}
                              {c.end_date ? " → " + new Date(c.end_date).toLocaleDateString("es-DO", { day: "2-digit", month: "short" }) : ""}
                            </p>
                          )}
                        </div>
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-sans font-medium" style={{ background: platformColor + "18", color: platformColor }}>
                            {PLATFORM_LABELS[c.platform] ?? c.platform}
                          </span>
                        </div>
                        <div>
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold"
                            style={
                              c.status === "active" ? { background: "oklch(0.58 0.14 145 / 10%)", color: "oklch(0.4 0.14 145)" }
                              : c.status === "paused" ? { background: "var(--amber-muted)", color: "oklch(0.52 0.13 65)" }
                              : { background: "var(--secondary)", color: "var(--muted-foreground)" }
                            }
                          >
                            {c.status === "active" ? "Activa" : c.status === "paused" ? "Pausada" : "Finalizada"}
                          </span>
                        </div>
                        <span className="font-mono text-sm text-foreground">{c.spend != null ? "$" + Number(c.spend).toLocaleString() : "—"}</span>
                        <span className="font-mono text-sm font-semibold" style={{ color: "var(--teal)" }}>{c.leads_generated ?? "—"}</span>
                        <span className="font-mono text-sm text-muted-foreground">{c.clicks != null ? Number(c.clicks).toLocaleString() : "—"}</span>
                        <span className="font-mono text-sm text-foreground">{cpl != null ? "$" + cpl.toFixed(0) : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {(campaigns ?? []).some((c) => c.impressions) && (
              <div className="card-glow p-6 animate-fade-up-3">
                <div className="flex items-center gap-2 mb-5">
                  <Eye className="w-4 h-4" style={{ color: "var(--teal)" }} />
                  <h3 className="font-sans font-semibold text-sm text-foreground">Visibilidad total</h3>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  {[
                    { label: "Impresiones", value: (campaigns ?? []).reduce((sum, c) => sum + (c.impressions ?? 0), 0).toLocaleString(), color: "var(--teal)" },
                    { label: "CTR promedio", value: (() => {
                        const ti = (campaigns ?? []).reduce((s, c) => s + (c.impressions ?? 0), 0);
                        return ti > 0 ? ((totalClicks / ti) * 100).toFixed(2) + "%" : "—";
                      })(), color: "var(--amber)" },
                    { label: "Campañas activas", value: active.length, color: "var(--red)" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <p className="stat-number" style={{ fontSize: "28px", color }}>{value}</p>
                      <p className="font-sans text-xs text-muted-foreground mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB: Meta Ads ─────────────────────────────────────────────────── */}
        {tab === "meta" && (
          <>
            {metaHasData ? (
              <>
                {/* Meta KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up-1">
                  {[
                    { label: "Gasto Meta",   value: "$" + metaSpend.toLocaleString("es-DO", { minimumFractionDigits: 0 }), icon: DollarSign,        accent: "#1877f2", muted: "rgba(24,119,242,0.1)" },
                    { label: "Leads Meta",   value: metaLeads,                                                               icon: Users,             accent: "var(--teal)", muted: "var(--teal-muted)" },
                    { label: "Clics Meta",   value: metaClicks.toLocaleString(),                                             icon: MousePointerClick, accent: "var(--amber)", muted: "var(--amber-muted)" },
                    { label: "CPL Meta",     value: metaCPL != null ? "$" + metaCPL.toFixed(0) : "—",                       icon: TrendingUp,        accent: "oklch(0.55 0.18 280)", muted: "oklch(0.55 0.18 280 / 10%)" },
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
                    <form action="/api/meta/sync" method="POST">
                      <button type="submit" className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors" style={{ background: "rgba(24,119,242,0.1)", color: "#1877f2" }}>
                        Sincronizar
                      </button>
                    </form>
                  </div>
                  <div className="divide-y overflow-x-auto" style={{ borderColor: "var(--border)" }}>
                    <div className="grid px-6 py-3" style={{ gridTemplateColumns: "1fr 100px 80px 80px 80px 80px" }}>
                      {["Campaña", "Fecha", "Impresiones", "Clics", "Gasto", "CPL"].map((h) => (
                        <span key={h} className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">{h}</span>
                      ))}
                    </div>
                    {(metaInsights ?? []).map((r) => (
                      <div key={r.id} className="grid items-center px-6 py-3.5" style={{ gridTemplateColumns: "1fr 100px 80px 80px 80px 80px" }}>
                        <p className="font-sans text-sm text-foreground truncate">{r.campaign_name ?? r.campaign_id}</p>
                        <span className="font-mono text-xs text-muted-foreground">{r.date}</span>
                        <span className="font-mono text-sm text-muted-foreground">{(r.impressions ?? 0).toLocaleString()}</span>
                        <span className="font-mono text-sm text-muted-foreground">{(r.clicks ?? 0).toLocaleString()}</span>
                        <span className="font-mono text-sm text-foreground">${Number(r.spend ?? 0).toFixed(0)}</span>
                        <span className="font-mono text-sm text-foreground">{r.cpl != null ? "$" + Number(r.cpl).toFixed(0) : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* Empty state — no Meta data yet */
              <div className="flex flex-col items-center justify-center py-24 gap-5 animate-fade-up-1">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(24,119,242,0.1)" }}
                >
                  <Share2 className="w-7 h-7" style={{ color: "#1877f2" }} />
                </div>
                <div className="text-center max-w-sm">
                  <h3 className="font-bold text-lg mb-2" style={{ color: "var(--foreground)", fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif" }}>
                    Meta Ads no configurado
                  </h3>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {metaConnected
                      ? "Token detectado. Usa Sincronizar para importar datos de tus campañas de Share2 e Instagram."
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
