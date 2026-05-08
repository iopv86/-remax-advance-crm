"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_LABELS } from "../_lib/platform-config";
import { PLATFORM_VALUES, STATUS_VALUES } from "../_schemas/campaign";

interface CampaignFormProps {
  /** If provided, the form is in edit mode — PATCHes to /api/campaigns/[id] */
  campaignId?: string;
  /** Initial values for edit mode */
  defaultValues?: {
    name?: string;
    platform?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
    spend?: number | null;
    leads_generated?: number | null;
    clicks?: number | null;
    impressions?: number | null;
  };
}

const STATUS_LABELS: Record<string, string> = {
  active:  "Activa",
  paused:  "Pausada",
  ended:   "Finalizada",
};

export function CampaignForm({ campaignId, defaultValues = {} }: CampaignFormProps) {
  const router = useRouter();
  const isEdit = !!campaignId;

  const [name, setName]                     = useState(defaultValues.name ?? "");
  const [platform, setPlatform]             = useState(defaultValues.platform ?? "facebook");
  const [status, setStatus]                 = useState(defaultValues.status ?? "active");
  const [startDate, setStartDate]           = useState(defaultValues.start_date ?? "");
  const [endDate, setEndDate]               = useState(defaultValues.end_date ?? "");
  const [spend, setSpend]                   = useState(defaultValues.spend?.toString() ?? "");
  const [leadsGenerated, setLeadsGenerated] = useState(defaultValues.leads_generated?.toString() ?? "");
  const [clicks, setClicks]                 = useState(defaultValues.clicks?.toString() ?? "");
  const [impressions, setImpressions]       = useState(defaultValues.impressions?.toString() ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body = {
      name,
      platform,
      status,
      start_date:      startDate || null,
      end_date:        endDate || null,
      spend:           spend !== "" ? parseFloat(spend) : null,
      leads_generated: leadsGenerated !== "" ? parseInt(leadsGenerated, 10) : null,
      clicks:          clicks !== "" ? parseInt(clicks, 10) : null,
      impressions:     impressions !== "" ? parseInt(impressions, 10) : null,
    };

    const url    = isEdit ? `/api/campaigns/${campaignId}` : "/api/campaigns";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Error inesperado");
        return;
      }

      router.push("/dashboard/ads");
      router.refresh();
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border px-3 py-2 text-sm font-sans bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/50";
  const labelClass =
    "block font-sans text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Nombre */}
      <div>
        <label className={labelClass}>Nombre de campaña *</label>
        <input
          type="text"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Ej: Facebook Leads - COL Mayo 2026"
          style={{ borderColor: "var(--border)" }}
        />
      </div>

      {/* Plataforma + Estado */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Plataforma *</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--border)" }}
          >
            {PLATFORM_VALUES.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p] ?? p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Estado *</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--border)" }}
          >
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Fecha inicio</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        <div>
          <label className={labelClass}>Fecha fin</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      </div>

      {/* Métricas manuales */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Presupuesto gastado ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
            className={inputClass}
            placeholder="0.00"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        <div>
          <label className={labelClass}>Leads generados</label>
          <input
            type="number"
            min="0"
            step="1"
            value={leadsGenerated}
            onChange={(e) => setLeadsGenerated(e.target.value)}
            className={inputClass}
            placeholder="0"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Clics</label>
          <input
            type="number"
            min="0"
            step="1"
            value={clicks}
            onChange={(e) => setClicks(e.target.value)}
            className={inputClass}
            placeholder="0"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        <div>
          <label className={labelClass}>Impresiones</label>
          <input
            type="number"
            min="0"
            step="1"
            value={impressions}
            onChange={(e) => setImpressions(e.target.value)}
            className={inputClass}
            placeholder="0"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ background: "#C9963A", color: "#fff" }}
        >
          {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear campaña"}
        </button>
        <a
          href="/dashboard/ads"
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
