import { Megaphone, TrendingUp, MousePointerClick, Users, DollarSign, Eye } from "lucide-react";
import { PLATFORM_LABELS, PLATFORM_COLOR } from "../_lib/platform-config";

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  spend: number | null;
  leads_generated: number | null;
  clicks: number | null;
  impressions: number | null;
  start_date: string | null;
  end_date: string | null;
}

interface CampanasTabProps {
  campaigns: Campaign[];
}

export function CampanasTab({ campaigns }: CampanasTabProps) {
  const active      = campaigns.filter((c) => c.status === "active");
  const totalSpend  = campaigns.reduce((sum, c) => sum + (c.spend ?? 0), 0);
  const totalLeads  = campaigns.reduce((sum, c) => sum + (c.leads_generated ?? 0), 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks ?? 0), 0);
  const avgCPL      = totalLeads > 0 ? totalSpend / totalLeads : 0;

  return (
    <>
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up-1">
        {[
          { label: "Gasto total",     value: "$" + totalSpend.toLocaleString(),  icon: DollarSign,        accent: "var(--red)",               muted: "var(--red-muted)" },
          { label: "Leads generados", value: totalLeads,                          icon: Users,             accent: "var(--teal)",              muted: "var(--teal-muted)" },
          { label: "Clics totales",   value: totalClicks.toLocaleString(),        icon: MousePointerClick, accent: "var(--amber)",             muted: "var(--amber-muted)" },
          { label: "Costo por lead",  value: "$" + avgCPL.toFixed(0),            icon: TrendingUp,        accent: "oklch(0.55 0.18 280)",     muted: "oklch(0.55 0.18 280 / 10%)" },
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
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" style={{ color: "var(--amber)" }} />
            <span className="font-sans font-semibold text-sm text-foreground">Campañas</span>
          </div>
          <a
            href="/dashboard/ads/campaigns/new"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(201,150,58,0.1)", color: "#C9963A" }}
          >
            + Nueva campaña
          </a>
        </div>

        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Megaphone className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-sans text-sm">No hay campañas registradas.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            <div className="grid px-6 py-3 overflow-x-auto" style={{ gridTemplateColumns: "1fr 100px 80px 80px 80px 80px 80px 60px" }}>
              {["Campaña", "Plataforma", "Estado", "Gasto", "Leads", "Clics", "CPL", ""].map((h) => (
                <span key={h} className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">{h}</span>
              ))}
            </div>
            {campaigns.map((c) => {
              const cpl = (c.leads_generated ?? 0) > 0 ? (c.spend ?? 0) / (c.leads_generated as number) : null;
              const platformColor = PLATFORM_COLOR[c.platform] ?? "var(--muted-foreground)";
              return (
                <div key={c.id} className="grid items-center px-6 py-3.5 table-row-hover transition-colors" style={{ gridTemplateColumns: "1fr 100px 80px 80px 80px 80px 80px 60px" }}>
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
                    <span
                      className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold"
                      style={
                        c.status === "active"  ? { background: "oklch(0.58 0.14 145 / 10%)", color: "oklch(0.4 0.14 145)" }
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
                  <a
                    href={`/dashboard/ads/campaigns/${c.id}/edit`}
                    className="font-sans text-xs font-semibold transition-colors"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Editar
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {campaigns.some((c) => c.impressions) && (
        <div className="card-glow p-6 animate-fade-up-3">
          <div className="flex items-center gap-2 mb-5">
            <Eye className="w-4 h-4" style={{ color: "var(--teal)" }} />
            <h3 className="font-sans font-semibold text-sm text-foreground">Visibilidad total</h3>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: "Impresiones",     value: campaigns.reduce((sum, c) => sum + (c.impressions ?? 0), 0).toLocaleString(), color: "var(--teal)" },
              { label: "CTR promedio",    value: (() => {
                  const ti = campaigns.reduce((s, c) => s + (c.impressions ?? 0), 0);
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
  );
}
