"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, User, CalendarDays, DollarSign,
  ChevronRight, Pencil, Check, X, Clock, TrendingUp,
  MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STAGE_LABELS, INSTALLMENT_KIND_LABELS, type Deal, type DealStage, type Task, type DealParty, type DealInstallment, type DealInstallmentDerivedStatus } from "@/lib/types";
import { deriveInstallmentStatus } from "@/lib/installments";
import { DealActivityPanel, type DealActivity } from "./deal-activity";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  PROPERTY_TYPE_LABELS,
  OPERATION_TYPE_LABELS,
  CONDITION_LABELS,
  TIMELINE_LABELS,
  PURPOSE_LABELS,
  PAYMENT_LABELS,
  AMENITY_LABELS,
} from "@/lib/intereses-labels";
import { CampaignAttribution } from "@/components/contacts/campaign-attribution";
import { computeCommission } from "@/lib/commission";

const ALL_STAGES: DealStage[] = [
  "nuevo_sin_contactar", "lead_captured", "qualified", "contacted", "showing_scheduled",
  "showing_done", "offer_made", "negotiation", "promesa_de_venta",
  "financiamiento", "contract", "due_diligence", "closed_won", "closed_lost",
];

const STAGE_COLORS: Record<string, string> = {
  nuevo_sin_contactar: "#94a3b8",
  lead_captured: "#3b82f6",
  qualified: "#8b5cf6",
  contacted: "#6366f1",
  showing_scheduled: "#f59e0b",
  showing_done: "#f59e0b",
  offer_made: "#f97316",
  negotiation: "#ef4444",
  promesa_de_venta: "#C9963A",
  financiamiento: "#C9963A",
  contract: "#10b981",
  due_diligence: "#10b981",
  closed_won: "#22c55e",
  closed_lost: "#64748b",
};

interface StageHistoryEntry {
  id: string;
  from_stage: DealStage | null;
  to_stage: DealStage;
  changed_by: string | null;
  changed_by_system: boolean;
  notes: string | null;
  created_at: string;
  agent?: { full_name: string | null } | null;
}

interface DealWithProperty extends Deal {
  property?: {
    id: string;
    title: string;
    city?: string;
    sector?: string;
  } | null;
}

interface Props {
  deal: DealWithProperty;
  history: StageHistoryEntry[];
  initialTasks: Task[];
  initialActivities: DealActivity[];
  parties: DealParty[];
  installments: DealInstallment[];
  today: string;
  agentId: string;
}

const PARTY_TYPE_LABELS: Record<string, string> = {
  co_buyer: "Co-comprador",
  referrer: "Referidor",
};

// Derived-status badge styling (vencida is computed, not stored).
const DERIVED_STATUS_STYLE: Record<DealInstallmentDerivedStatus, { bg: string; fg: string; label: string }> = {
  pagada: { bg: "rgba(34,197,94,0.12)", fg: "#22c55e", label: "Pagada" },
  vencida: { bg: "rgba(239,68,68,0.12)", fg: "#ef4444", label: "Vencida" },
  pendiente: { bg: "var(--accent)", fg: "var(--accent-foreground)", label: "Pendiente" },
};

function fmtMoney(amount: number, currency: string): string {
  const sym = currency === "DOP" ? "RD$" : "US$";
  return sym + new Intl.NumberFormat("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[\s\-\+\(\)]/g, "");
}

export function DealDetailClient({ deal: initialDeal, history, initialTasks, initialActivities, parties, installments, today, agentId }: Props) {
  const router = useRouter();
  const [deal, setDeal] = useState(initialDeal);

  // Editing state
  const [editingStage, setEditingStage] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingCloseDate, setEditingCloseDate] = useState(false);

  const [stageValue, setStageValue] = useState<DealStage>(deal.stage);
  const [dealValue, setDealValue] = useState(String(deal.deal_value ?? ""));
  const [notesValue, setNotesValue] = useState(deal.notes ?? "");
  const [closeDateValue, setCloseDateValue] = useState(deal.expected_close_date ?? "");
  const [saving, setSaving] = useState(false);

  const contact = deal.contact as {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    property_types?: string[] | null;
    operation_type?: string | null;
    condition?: string | null;
    desired_amenities?: string[] | null;
    bedrooms?: number | null;
    timeline?: string | null;
    purpose?: string | null;
    payment_method?: string | null;
    preferred_locations?: string[] | null;
    meta_campaign_id?: string | null;
    meta_campaign_name?: string | null;
    meta_adset_id?: string | null;
    meta_adset_name?: string | null;
    meta_ad_id?: string | null;
    meta_ad_name?: string | null;
    meta_form_name?: string | null;
    meta_platform?: string | null;
  } | null;
  const property = deal.property;
  const agent = deal.agent as { full_name?: string | null; email?: string | null } | null;

  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Sin nombre"
    : "—";

  const formatCurrency = (val?: number | null, cur?: string | null) => {
    if (!val) return "—";
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: cur === "USD" ? "USD" : "DOP",
      minimumFractionDigits: 0,
    }).format(val);
  };

  async function saveStage() {
    if (stageValue === deal.stage) { setEditingStage(false); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ stage: stageValue, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) { toast.error("Error guardando stage"); setSaving(false); return; }
    await supabase.from("deal_stage_history").insert({
      deal_id: deal.id,
      from_stage: deal.stage,
      to_stage: stageValue,
      changed_by_system: false,
    });
    setDeal((d) => ({ ...d, stage: stageValue }));
    toast.success("Stage actualizado");
    setEditingStage(false);
    setSaving(false);
    // Enqueue Meta CAPI event — fire-and-forget, never blocks UI.
    // Server resolves PII/value from the deal; client only names deal + stage.
    fetch("/api/meta/capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_id: deal.id, stage: stageValue }),
    }).catch(() => {});
    router.refresh();
  }

  async function saveValue() {
    const parsed = parseFloat(dealValue.replace(/,/g, ""));
    if (isNaN(parsed)) { toast.error("Valor inválido"); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ deal_value: parsed, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) { toast.error("Error guardando valor"); setSaving(false); return; }
    setDeal((d) => ({ ...d, deal_value: parsed }));
    toast.success("Valor actualizado");
    setEditingValue(false);
    setSaving(false);
  }

  async function saveNotes() {
    if (notesValue.length > 5000) { toast.error("Notas demasiado largas (máx 5000 caracteres)"); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ notes: notesValue, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) { toast.error("Error guardando notas"); setSaving(false); return; }
    setDeal((d) => ({ ...d, notes: notesValue }));
    toast.success("Notas guardadas");
    setEditingNotes(false);
    setSaving(false);
  }

  async function saveCloseDate() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ expected_close_date: closeDateValue || null, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) { toast.error("Error guardando fecha"); setSaving(false); return; }
    setDeal((d) => ({ ...d, expected_close_date: closeDateValue || undefined }));
    toast.success("Fecha actualizada");
    setEditingCloseDate(false);
    setSaving(false);
  }

  const stageColor = STAGE_COLORS[deal.stage] ?? "#C9963A";
  const stageIdx = ALL_STAGES.indexOf(deal.stage);
  const isLost = deal.stage === "closed_lost";
  const isWon = deal.stage === "closed_won";

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/pipeline"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="surface-title">
              {contactName}
            </h1>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}>
              <span>Pipeline</span>
              <ChevronRight className="w-3 h-3" />
              <span>Deal</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1 rounded-lg text-xs font-bold"
            style={{ background: `${stageColor}18`, color: stageColor, border: `1px solid ${stageColor}30` }}
          >
            {STAGE_LABELS[deal.stage]}
          </span>
          <span
            className="text-lg font-bold num"
            style={{
              fontFamily: "var(--font-display),var(--font-manrope),system-ui",
              color: "var(--primary)",
            }}
          >
            {formatCurrency(deal.deal_value, deal.currency)}
          </span>
        </div>
      </div>

      <div className="flex-1 p-6 animate-fade-up-1 space-y-5 max-w-5xl">
        {/* ── Stage progress bar ────────────────────────────────────────── */}
        {!isLost && (
          <div className="card-secondary p-4">
            <p className="eyebrow mb-3">
              Progreso del Pipeline
            </p>
            <div className="flex items-center gap-0.5 flex-wrap">
              {ALL_STAGES.filter((s) => s !== "closed_lost").map((s, i) => {
                const idx = ALL_STAGES.filter((x) => x !== "closed_lost").indexOf(s);
                const isDone = idx <= (isWon ? ALL_STAGES.length : stageIdx);
                const isCurrent = s === deal.stage;
                return (
                  <div
                    key={s}
                    className="h-2 flex-1 rounded-full transition-all"
                    style={{
                      background: isCurrent
                        ? stageColor
                        : isDone && !isWon
                        ? `${stageColor}40`
                        : isWon
                        ? "#22c55e"
                        : "var(--border)",
                      minWidth: 12,
                    }}
                    title={STAGE_LABELS[s]}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Left: Deal info + Notes + Tasks ─────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Info card */}
            <div className="card-primary p-5">
              <p className="eyebrow mb-4">
                Información del deal
              </p>
              <div className="grid grid-cols-2 gap-4">
                {/* Stage */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Stage</p>
                  {editingStage ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={stageValue}
                        onChange={(e) => setStageValue(e.target.value as DealStage)}
                        className="flex-1 text-sm px-2 py-1.5 rounded-lg focus-ring"
                        style={{
                          background: "var(--muted)", color: "var(--foreground)",
                          border: "1px solid var(--border)", outline: "none",
                        }}
                      >
                        {ALL_STAGES.map((s) => (
                          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                        ))}
                      </select>
                      <button onClick={saveStage} disabled={saving} className="p-1 rounded hover:bg-muted" style={{ color: "#10b981" }}>
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setStageValue(deal.stage); setEditingStage(false); }} className="p-1 rounded hover:bg-muted" style={{ color: "var(--muted-foreground)" }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingStage(true)} className="flex items-center gap-2 group">
                      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {STAGE_LABELS[deal.stage]}
                      </span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--muted-foreground)" }} />
                    </button>
                  )}
                </div>

                {/* Deal value */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Valor del deal</p>
                  {editingValue ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={dealValue}
                        onChange={(e) => setDealValue(e.target.value)}
                        className="flex-1 text-sm px-2 py-1.5 rounded-lg focus-ring"
                        style={{
                          background: "var(--muted)", color: "var(--foreground)",
                          border: "1px solid var(--border)", outline: "none",
                        }}
                        placeholder="0"
                      />
                      <button onClick={saveValue} disabled={saving} className="p-1 rounded hover:bg-muted" style={{ color: "#10b981" }}>
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingValue(false)} className="p-1 rounded hover:bg-muted" style={{ color: "var(--muted-foreground)" }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingValue(true)} className="flex items-center gap-2 group">
                      <span className="text-sm font-bold num" style={{ color: "var(--primary)" }}>
                        {formatCurrency(deal.deal_value, deal.currency)}
                      </span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--muted-foreground)" }} />
                    </button>
                  )}
                </div>

                {/* Contact */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <User className="w-3 h-3" /> Contacto
                  </p>
                  {contact ? (
                    <Link
                      href={`/dashboard/contacts/${contact.id}`}
                      className="text-sm font-semibold hover:underline transition-colors"
                      style={{ color: "var(--foreground)" }}
                    >
                      {contactName}
                    </Link>
                  ) : (
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                  {contact?.phone && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{contact.phone}</p>
                      <a
                        href={`https://wa.me/${sanitizePhone(contact.phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir WhatsApp"
                        className="flex items-center justify-center w-5 h-5 rounded-full transition-opacity hover:opacity-80"
                        style={{ background: "rgba(37,211,102,0.15)", color: "#25D366" }}
                      >
                        <MessageSquare className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Property */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <Building2 className="w-3 h-3" /> Propiedad
                  </p>
                  {property ? (
                    <Link
                      href={`/dashboard/properties/${property.id}`}
                      className="text-sm font-semibold hover:underline"
                      style={{ color: "var(--foreground)" }}
                    >
                      {property.title}
                    </Link>
                  ) : (
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Sin propiedad asignada</span>
                  )}
                  {property?.sector && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {property.sector}{property.city ? `, ${property.city}` : ""}
                    </p>
                  )}
                </div>

                {/* Expected close date */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <CalendarDays className="w-3 h-3" /> Cierre estimado
                  </p>
                  {editingCloseDate ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={closeDateValue}
                        onChange={(e) => setCloseDateValue(e.target.value)}
                        className="flex-1 text-sm px-2 py-1.5 rounded-lg focus-ring"
                        style={{
                          background: "var(--muted)", color: "var(--foreground)",
                          border: "1px solid var(--border)", outline: "none",
                        }}
                      />
                      <button onClick={saveCloseDate} disabled={saving} className="p-1 rounded hover:bg-muted" style={{ color: "#10b981" }}>
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingCloseDate(false)} className="p-1 rounded hover:bg-muted" style={{ color: "var(--muted-foreground)" }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingCloseDate(true)} className="flex items-center gap-2 group">
                      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {deal.expected_close_date
                          ? format(parseISO(deal.expected_close_date), "d MMM yyyy", { locale: es })
                          : "—"}
                      </span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--muted-foreground)" }} />
                    </button>
                  )}
                </div>

                {/* Commission */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <TrendingUp className="w-3 h-3" /> Comisión estimada
                  </p>
                  <span className="text-sm font-semibold num" style={{ color: "var(--foreground)" }}>
                    {(() => {
                      const amt = computeCommission(deal);
                      if (amt <= 0 && deal.commission_value == null && deal.commission_percentage == null) return "—";
                      return (
                        <>
                          {formatCurrency(amt, deal.currency)}
                          {deal.commission_percentage != null && (
                            <span className="text-xs font-normal ml-1 num" style={{ color: "var(--muted-foreground)" }}>
                              ({deal.commission_percentage}%)
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </span>
                </div>

                {/* Agent */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Agente</p>
                  <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    {agent?.full_name ?? "—"}
                  </span>
                </div>

                {/* Created */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <Clock className="w-3 h-3" /> Creado
                  </p>
                  <span className="text-sm" style={{ color: "var(--foreground)" }}>
                    {format(parseISO(deal.created_at), "d MMM yyyy", { locale: es })}
                  </span>
                </div>
              </div>
            </div>

            {/* Intereses del cliente — surfaced read-only from the linked contact */}
            {contact && (() => {
              const types = contact.property_types ?? [];
              const amenities = contact.desired_amenities ?? [];
              // Dedupe — legacy rows may hold repeated zones; chip keys must be unique.
              const zones = [...new Set(contact.preferred_locations ?? [])];
              const rows: { label: string; value: string }[] = [];
              if (contact.operation_type) rows.push({ label: "Operación", value: OPERATION_TYPE_LABELS[contact.operation_type] ?? contact.operation_type });
              if (contact.condition) rows.push({ label: "Condición", value: CONDITION_LABELS[contact.condition] ?? contact.condition });
              if (contact.bedrooms != null) rows.push({ label: "Habitaciones", value: `${contact.bedrooms}` });
              if (contact.timeline) rows.push({ label: "Timeline", value: TIMELINE_LABELS[contact.timeline] ?? contact.timeline });
              if (contact.purpose) rows.push({ label: "Propósito", value: PURPOSE_LABELS[contact.purpose] ?? contact.purpose });
              if (contact.payment_method) rows.push({ label: "Pago", value: PAYMENT_LABELS[contact.payment_method] ?? contact.payment_method });
              const hasAny = types.length > 0 || amenities.length > 0 || zones.length > 0 || rows.length > 0;
              if (!hasAny) return null;
              const chip = (text: string) => (
                <span key={text} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, fontSize: 12, background: "var(--accent)", color: "var(--accent-foreground)", border: "1px solid var(--border)" }}>
                  {text}
                </span>
              );
              return (
                <div className="card-secondary p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="eyebrow">
                      Intereses del cliente
                    </p>
                    <Link href={`/dashboard/contacts/${contact.id}/edit?from=deal:${deal.id}`} className="text-xs flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: "var(--primary)" }}>
                      Editar <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {types.length > 0 && (
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>Tipo de propiedad</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{types.map((t) => chip(PROPERTY_TYPE_LABELS[t] ?? t))}</div>
                      </div>
                    )}
                    {rows.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {rows.map((r) => (
                          <div key={r.label}>
                            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{r.label}</p>
                            <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{r.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {zones.length > 0 && (
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>Zonas de interés</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{zones.map((z) => chip(z))}</div>
                      </div>
                    )}
                    {amenities.length > 0 && (
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>Amenidades deseadas</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{amenities.map((a) => chip(AMENITY_LABELS[a] ?? a))}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Campañas — Meta attribution surfaced from the linked contact */}
            {contact && (
              <CampaignAttribution
                variant="deal"
                campaignId={contact.meta_campaign_id}
                campaignName={contact.meta_campaign_name}
                adsetId={contact.meta_adset_id}
                adsetName={contact.meta_adset_name}
                adId={contact.meta_ad_id}
                adName={contact.meta_ad_name}
                formName={contact.meta_form_name}
                platform={contact.meta_platform}
              />
            )}

            {/* Co-comprador / Referidor — PII gated by RLS + page-level owner check */}
            {parties.length > 0 && (
              <div className="card-secondary p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="eyebrow">
                    Co-comprador / Referidor
                  </p>
                  <Link href={`/dashboard/pipeline/${deal.id}/edit`} className="text-xs flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: "var(--primary)" }}>
                    Editar <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {parties.map((p) => (
                    <div key={p.id} style={{ paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{p.full_name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-foreground)", border: "1px solid var(--border)" }}>
                          {PARTY_TYPE_LABELS[p.party_type] ?? p.party_type}
                        </span>
                      </div>
                      {p.relationship && (
                        <p className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>{p.relationship}</p>
                      )}
                      {p.phone && (
                        <div className="flex items-center gap-3">
                          <a href={`tel:${sanitizePhone(p.phone)}`} className="text-sm transition-colors hover:opacity-80" style={{ color: "var(--primary)" }}>{p.phone}</a>
                          <a href={`https://wa.me/${sanitizePhone(p.phone)}`} target="_blank" rel="noopener noreferrer" className="text-xs transition-colors hover:opacity-80" style={{ color: "var(--muted-foreground)" }}>WhatsApp</a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Plan de pagos — installments gated by RLS + page-level owner check */}
            {installments.length > 0 && (() => {
              const planCurrency = installments[0].currency;
              const total = installments.reduce((s, i) => s + (i.amount ?? 0), 0);
              const paid = installments
                .filter((i) => i.status === "pagada")
                .reduce((s, i) => s + (i.amount ?? 0), 0);
              const pending = total - paid;
              return (
                <div className="card-secondary p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="eyebrow">
                      Plan de pagos
                    </p>
                    <Link href={`/dashboard/pipeline/${deal.id}/edit`} className="text-xs flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: "var(--primary)" }}>
                      Editar <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {installments.map((i) => {
                      const derived = deriveInstallmentStatus(i, today);
                      const st = DERIVED_STATUS_STYLE[derived];
                      return (
                        <div key={i.id} style={{ paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                          <div className="flex items-center justify-between mb-1">
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-foreground)", border: "1px solid var(--border)" }}>
                              {INSTALLMENT_KIND_LABELS[i.kind] ?? i.kind}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 8, background: st.bg, color: st.fg }}>
                              {st.label}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold num" style={{ color: "var(--foreground)" }}>
                              {fmtMoney(i.amount, i.currency)}
                            </span>
                            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                              {i.due_date ? `Vence ${format(parseISO(i.due_date), "dd MMM yyyy", { locale: es })}` : "Sin fecha"}
                            </span>
                          </div>
                          {i.label && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{i.label}</p>
                          )}
                          {derived === "pagada" && i.paid_date && (
                            <p className="text-xs mt-0.5" style={{ color: "#22c55e" }}>
                              Pagada el {format(parseISO(i.paid_date), "dd MMM yyyy", { locale: es })}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-2 text-xs space-y-1" style={{ color: "var(--muted-foreground)" }}>
                    <div className="flex justify-between">
                      <span>Total del plan</span>
                      <span className="num" style={{ color: "var(--foreground)", fontWeight: 600 }}>{fmtMoney(total, planCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pagado</span>
                      <span className="num" style={{ color: "#22c55e" }}>{fmtMoney(paid, planCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pendiente</span>
                      <span className="num" style={{ color: "var(--foreground)" }}>{fmtMoney(pending, planCurrency)}</span>
                    </div>
                    {deal.deal_value != null && deal.currency === planCurrency && Math.abs(total - deal.deal_value) >= 0.01 && (
                      <div className="flex justify-between" style={{ fontStyle: "italic" }}>
                        <span>Valor de la oportunidad</span>
                        <span className="num">{fmtMoney(deal.deal_value, planCurrency)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Notes */}
            <div className="card-secondary p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="eyebrow">
                  Notas internas
                </p>
                {!editingNotes && (
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-muted"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-3">
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    rows={5}
                    placeholder="Agrega notas internas sobre este deal…"
                    className="w-full text-sm px-3 py-2.5 rounded-lg resize-none focus-ring"
                    style={{
                      background: "var(--muted)", color: "var(--foreground)",
                      border: "1px solid var(--border)", outline: "none",
                      fontFamily: "var(--font-body), system-ui",
                    }}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setNotesValue(deal.notes ?? ""); setEditingNotes(false); }}
                      className="px-3 py-1.5 text-xs rounded-lg"
                      style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveNotes}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg"
                      style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                    >
                      {saving ? "Guardando…" : "Guardar notas"}
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: deal.notes ? "var(--foreground)" : "var(--muted-foreground)" }}
                >
                  {deal.notes ?? "Sin notas. Haz clic en Editar para agregar."}
                </p>
              )}
            </div>

            {/* Unified Actividad block: registrar actividad + agendar seguimiento */}
            <DealActivityPanel
              dealId={deal.id}
              contactId={deal.contact_id}
              agentId={agentId}
              initialActivities={initialActivities}
              initialTasks={initialTasks}
            />
          </div>

          {/* ── Right: Stage history timeline ─────────────────────────── */}
          <div className="card-secondary p-5">
            <p className="eyebrow mb-4">
              Historial de stages
            </p>

            {history.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: "var(--muted-foreground)" }}>
                Sin movimientos registrados
              </p>
            ) : (
              <div className="space-y-0">
                {history.map((entry, i) => {
                  const color = STAGE_COLORS[entry.to_stage] ?? "#C9963A";
                  return (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                          style={{ background: color }}
                        />
                        {i < history.length - 1 && (
                          <div className="w-px flex-1 my-1" style={{ background: "var(--border)", minHeight: 20 }} />
                        )}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                          {STAGE_LABELS[entry.to_stage]}
                        </p>
                        {entry.from_stage && (
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                            desde {STAGE_LABELS[entry.from_stage]}
                          </p>
                        )}
                        <p className="text-[10px] mt-1" style={{ color: "var(--muted-foreground)" }} suppressHydrationWarning>
                          {entry.agent?.full_name ?? (entry.changed_by_system ? "Sistema" : "—")}
                          {" · "}
                          {formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true, locale: es })}
                        </p>
                        {entry.notes && (
                          <p className="text-[10px] mt-1 italic" style={{ color: "var(--muted-foreground)" }}>
                            {entry.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
