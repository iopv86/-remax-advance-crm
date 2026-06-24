"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PIPELINE_STAGE_ORDER, STAGE_LABELS, INSTALLMENT_KIND_LABELS } from "@/lib/types";
import type {
  Deal, DealStage, DealParty, DealPartyInput, DealPartyType,
  DealInstallment, DealInstallmentInput, DealInstallmentKind, DealInstallmentStatus,
  CurrencyType,
} from "@/lib/types";
import {
  Field,
  TextInput,
  NumberInput,
  TextArea,
  NativeSelect,
  type SelectOption,
} from "@/components/form/fields";
import { FormShell, FormSection } from "@/components/form/form-shell";
import { saveDealParties, saveDealInstallments } from "../../actions";

// One editable party row (co-buyer or referrer). UI scope: 1 of each (S4 decision).
interface PartyRow {
  full_name: string;
  phone: string;
  relationship: string;
}
const EMPTY_PARTY: PartyRow = { full_name: "", phone: "", relationship: "" };

function pickParty(parties: DealParty[], type: DealPartyType): PartyRow {
  const p = parties.find((x) => x.party_type === type);
  return p
    ? { full_name: p.full_name ?? "", phone: p.phone ?? "", relationship: p.relationship ?? "" }
    : { ...EMPTY_PARTY };
}

// One editable installment row of the payment plan (Plan de pagos — S5).
// `_key` is a stable React key so removing a row doesn't reindex focus/state.
interface InstRow {
  _key: string;
  kind: DealInstallmentKind;
  label: string;
  amount: string; // raw input; parsed at build time
  due_date: string; // YYYY-MM-DD or ""
  status: DealInstallmentStatus;
  paid_date: string;
}
const EMPTY_INST: Omit<InstRow, "_key"> = {
  kind: "reserva",
  label: "",
  amount: "",
  due_date: "",
  status: "pendiente",
  paid_date: "",
};
const KIND_OPTS: SelectOption[] = (
  ["reserva", "inicial", "saldo", "otro"] as DealInstallmentKind[]
).map((k) => ({ value: k, label: INSTALLMENT_KIND_LABELS[k] }));
const INST_STATUS_OPTS: SelectOption[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "pagada", label: "Pagada" },
];

const STAGE_OPTS: SelectOption[] = PIPELINE_STAGE_ORDER.map((s) => ({
  value: s,
  label: STAGE_LABELS[s],
}));
const CURRENCY_OPTS: SelectOption[] = [
  { value: "USD", label: "USD (US$)" },
  { value: "DOP", label: "DOP (RD$)" },
];
const PRIORITY_OPTS: SelectOption[] = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  agent_id: string | null;
}
interface PropertyOption {
  id: string;
  title: string;
  city: string | null;
  sector: string | null;
}

export function DealEditForm({
  deal,
  contacts,
  properties,
  currentAgentId,
  initialParties = [],
  initialInstallments = [],
}: {
  deal?: Deal | null;
  contacts: ContactOption[];
  properties: PropertyOption[];
  currentAgentId?: string;
  initialParties?: DealParty[];
  initialInstallments?: DealInstallment[];
}) {
  const router = useRouter();
  const isCreate = !deal;
  const backHref = deal ? `/dashboard/pipeline/${deal.id}` : "/dashboard/pipeline";
  const [saving, setSaving] = useState(false);

  const [coBuyer, setCoBuyer] = useState<PartyRow>(() => pickParty(initialParties, "co_buyer"));
  const [referrer, setReferrer] = useState<PartyRow>(() => pickParty(initialParties, "referrer"));

  const [installments, setInstallments] = useState<InstRow[]>(() =>
    initialInstallments
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        _key: i.id,
        kind: i.kind,
        label: i.label ?? "",
        amount: i.amount != null ? i.amount.toString() : "",
        due_date: i.due_date ?? "",
        status: i.status,
        paid_date: i.paid_date ?? "",
      })),
  );

  function addInstallment() {
    setInstallments((rows) => [...rows, { ...EMPTY_INST, _key: crypto.randomUUID() }]);
  }
  function updateInstallment(idx: number, patch: Partial<InstRow>) {
    setInstallments((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeInstallment(idx: number) {
    setInstallments((rows) => rows.filter((_, i) => i !== idx));
  }

  function buildInstallments(): DealInstallmentInput[] {
    return installments
      .filter((r) => r.amount.trim() !== "")
      .map((r) => ({
        kind: r.kind,
        label: r.label.trim() || null,
        amount: Number(r.amount),
        currency: form.currency as CurrencyType,
        due_date: r.due_date || null,
        status: r.status,
        paid_date: r.status === "pagada" ? r.paid_date || null : null,
        notes: null, // reservado para notas por cuota (no expuesto en la UI de S5)
      }));
  }

  function buildParties(): DealPartyInput[] {
    const out: DealPartyInput[] = [];
    if (coBuyer.full_name.trim()) {
      out.push({ party_type: "co_buyer", full_name: coBuyer.full_name, phone: coBuyer.phone || null, relationship: coBuyer.relationship || null, notes: null });
    }
    if (referrer.full_name.trim()) {
      out.push({ party_type: "referrer", full_name: referrer.full_name, phone: referrer.phone || null, relationship: referrer.relationship || null, notes: null });
    }
    return out;
  }

  const [form, setForm] = useState({
    contact_id: deal?.contact_id ?? "",
    stage: deal?.stage ?? ("lead_captured" as DealStage),
    deal_value: deal?.deal_value?.toString() ?? "",
    currency: deal?.currency ?? "USD",
    commission_percentage: deal?.commission_percentage?.toString() ?? "",
    expected_close_date: deal?.expected_close_date ?? "",
    priority: deal?.priority ?? "medium",
    property_id: deal?.property_id ?? "",
    notes: deal?.notes ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.contact_id) {
      toast.error("Selecciona un contacto");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    // Keep the deal's agent in sync with the contact's owner (matches existing convention).
    const contactAgent = contacts.find((c) => c.id === form.contact_id)?.agent_id ?? null;

    const payload: Record<string, unknown> = {
      contact_id: form.contact_id,
      stage: form.stage,
      deal_value: form.deal_value ? Number(form.deal_value) : null,
      currency: form.currency,
      commission_percentage: form.commission_percentage ? Number(form.commission_percentage) : null,
      expected_close_date: form.expected_close_date || null,
      priority: form.priority,
      property_id: form.property_id || null,
      notes: form.notes.trim() || null,
    };

    if (isCreate) {
      // agent_id is NOT NULL — inherit contact's owner, else the current agent.
      payload.agent_id = contactAgent || currentAgentId || null;
      if (!payload.agent_id) {
        toast.error("No se pudo resolver el agente. Recarga la página.");
        setSaving(false);
        return;
      }
      const { data: inserted, error } = await supabase
        .from("deals")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserted) {
        toast.error("Error al crear: " + (error?.message ?? "desconocido"));
        setSaving(false);
        return;
      }
      const partyResult = await saveDealParties(inserted.id as string, buildParties());
      if (!partyResult.success) {
        setSaving(false);
        toast.error("Oportunidad creada, pero las partes fallaron: " + partyResult.error);
        router.push(`/dashboard/pipeline/${inserted.id}`);
        return;
      }
      const instResult = await saveDealInstallments(
        inserted.id as string,
        form.currency as CurrencyType,
        buildInstallments(),
      );
      if (!instResult.success) {
        setSaving(false);
        toast.error("Oportunidad creada, pero el plan de pagos falló: " + instResult.error);
        router.push(`/dashboard/pipeline/${inserted.id}`);
        return;
      }
      setSaving(false);
      toast.success("Oportunidad creada");
      router.push(`/dashboard/pipeline/${inserted.id}`);
      router.refresh();
      return;
    }

    payload.updated_at = new Date().toISOString();
    if (contactAgent) payload.agent_id = contactAgent;
    const { error } = await supabase.from("deals").update(payload).eq("id", deal!.id);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      setSaving(false);
      return;
    }
    const partyResult = await saveDealParties(deal!.id, buildParties());
    if (!partyResult.success) {
      setSaving(false);
      toast.error("Oportunidad guardada, pero las partes fallaron: " + partyResult.error);
      router.push(backHref);
      return;
    }
    const instResult = await saveDealInstallments(deal!.id, form.currency as CurrencyType, buildInstallments());
    if (!instResult.success) {
      setSaving(false);
      toast.error("Oportunidad guardada, pero el plan de pagos falló: " + instResult.error);
      router.push(backHref);
      return;
    }
    setSaving(false);
    toast.success("Oportunidad actualizada");
    router.push(backHref);
    router.refresh();
  }

  const contactOpts: SelectOption[] = contacts.map((c) => ({
    value: c.id,
    label: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Sin nombre",
  }));
  const propertyOpts: SelectOption[] = properties.map((p) => ({
    value: p.id,
    label: [p.title, p.sector || p.city].filter(Boolean).join(" · "),
  }));

  return (
    <FormShell
      title={isCreate ? "Nueva oportunidad" : "Editar oportunidad"}
      backHref={backHref}
      onSubmit={handleSave}
      saving={saving}
      saveLabel={isCreate ? "Crear oportunidad" : "Guardar cambios"}
    >
      <FormSection title="Oportunidad">
        <Field label="Contacto" htmlFor="contact" required>
          <NativeSelect id="contact" value={form.contact_id} onChange={(v) => set("contact_id", v)} options={contactOpts} placeholder="Seleccionar contacto…" />
        </Field>
        <Field label="Etapa del pipeline" htmlFor="stage">
          <NativeSelect id="stage" value={form.stage} onChange={(v) => set("stage", v as DealStage)} options={STAGE_OPTS} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10 }}>
          <Field label="Moneda" htmlFor="currency">
            <NativeSelect id="currency" value={form.currency} onChange={(v) => set("currency", v as "USD" | "DOP")} options={CURRENCY_OPTS} />
          </Field>
          <Field label="Valor estimado" htmlFor="deal_value">
            <NumberInput id="deal_value" value={form.deal_value} onChange={(v) => set("deal_value", v)} placeholder="150000" />
          </Field>
          <Field label="Comisión %" htmlFor="commission">
            <NumberInput id="commission" value={form.commission_percentage} onChange={(v) => set("commission_percentage", v)} placeholder="5" />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Cierre esperado" htmlFor="close">
            <TextInput id="close" type="date" value={form.expected_close_date} onChange={(v) => set("expected_close_date", v)} />
          </Field>
          <Field label="Prioridad" htmlFor="priority">
            <NativeSelect id="priority" value={form.priority} onChange={(v) => set("priority", v as typeof form.priority)} options={PRIORITY_OPTS} />
          </Field>
        </div>
        <Field label="Propiedad vinculada" htmlFor="property">
          <NativeSelect id="property" value={form.property_id} onChange={(v) => set("property_id", v)} options={propertyOpts} placeholder="— Ninguna —" />
        </Field>
      </FormSection>

      <FormSection title="Co-comprador">
        <p className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
          Persona que compra junto al cliente principal. Opcional.
        </p>
        <Field label="Nombre completo" htmlFor="cb_name">
          <TextInput id="cb_name" value={coBuyer.full_name} onChange={(v) => setCoBuyer((p) => ({ ...p, full_name: v }))} placeholder="Nombre del co-comprador" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Teléfono" htmlFor="cb_phone">
            <TextInput id="cb_phone" value={coBuyer.phone} onChange={(v) => setCoBuyer((p) => ({ ...p, phone: v }))} placeholder="809-000-0000" />
          </Field>
          <Field label="Relación" htmlFor="cb_rel">
            <TextInput id="cb_rel" value={coBuyer.relationship} onChange={(v) => setCoBuyer((p) => ({ ...p, relationship: v }))} placeholder="Cónyuge, socio…" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Referidor">
        <p className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
          Quien refirió este negocio. Opcional.
        </p>
        <Field label="Nombre completo" htmlFor="rf_name">
          <TextInput id="rf_name" value={referrer.full_name} onChange={(v) => setReferrer((p) => ({ ...p, full_name: v }))} placeholder="Nombre del referidor" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Teléfono" htmlFor="rf_phone">
            <TextInput id="rf_phone" value={referrer.phone} onChange={(v) => setReferrer((p) => ({ ...p, phone: v }))} placeholder="809-000-0000" />
          </Field>
          <Field label="Relación" htmlFor="rf_rel">
            <TextInput id="rf_rel" value={referrer.relationship} onChange={(v) => setReferrer((p) => ({ ...p, relationship: v }))} placeholder="Amigo, cliente previo…" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Plan de pagos">
        {(() => {
          const sym = form.currency === "DOP" ? "RD$" : "US$";
          const total = installments.reduce((s, r) => {
            const n = Number(r.amount);
            return s + (Number.isFinite(n) && n > 0 ? n : 0);
          }, 0);
          const dealVal = form.deal_value ? Number(form.deal_value) : null;
          const nf = new Intl.NumberFormat("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
          return (
            <>
              <p className="text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>
                Cuotas del plan (reserva, inicial, saldo…). Todas usan la moneda de la
                oportunidad (<strong>{form.currency}</strong>) — cámbiala en el campo Moneda de arriba. Opcional.
              </p>

              {installments.length === 0 && (
                <p className="text-xs mb-2" style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>
                  Sin cuotas. Agrega la primera con el botón de abajo.
                </p>
              )}

              {installments.map((row, idx) => (
                <div
                  key={row._key}
                  style={{ padding: "12px", marginBottom: 10, borderRadius: 8, border: "1px solid var(--glass-border)", background: "var(--glass-bg)" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--secondary-foreground)" }}>
                      Cuota {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeInstallment(idx)}
                      aria-label={`Quitar cuota ${idx + 1}`}
                      className="text-xs transition-colors hover:opacity-80"
                      style={{ color: "var(--red)", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Quitar
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label="Tipo" htmlFor={`inst_kind_${idx}`}>
                      <NativeSelect id={`inst_kind_${idx}`} value={row.kind} onChange={(v) => updateInstallment(idx, { kind: v as DealInstallmentKind })} options={KIND_OPTS} />
                    </Field>
                    <Field label={`Monto (${sym})`} htmlFor={`inst_amount_${idx}`}>
                      <NumberInput id={`inst_amount_${idx}`} value={row.amount} onChange={(v) => updateInstallment(idx, { amount: v })} placeholder="10000" />
                    </Field>
                    <Field label="Vencimiento" htmlFor={`inst_due_${idx}`}>
                      <TextInput id={`inst_due_${idx}`} type="date" value={row.due_date} onChange={(v) => updateInstallment(idx, { due_date: v })} />
                    </Field>
                    <Field label="Estado" htmlFor={`inst_status_${idx}`}>
                      <NativeSelect
                        id={`inst_status_${idx}`}
                        value={row.status}
                        onChange={(v) => updateInstallment(idx, { status: v as DealInstallmentStatus, paid_date: v === "pagada" ? row.paid_date : "" })}
                        options={INST_STATUS_OPTS}
                      />
                    </Field>
                    {row.status === "pagada" && (
                      <Field label="Fecha de pago" htmlFor={`inst_paid_${idx}`}>
                        <TextInput id={`inst_paid_${idx}`} type="date" value={row.paid_date} onChange={(v) => updateInstallment(idx, { paid_date: v })} />
                      </Field>
                    )}
                    <Field label="Etiqueta (opcional)" htmlFor={`inst_label_${idx}`} style={{ gridColumn: row.status === "pagada" ? "auto" : "1 / -1" }}>
                      <TextInput id={`inst_label_${idx}`} value={row.label} onChange={(v) => updateInstallment(idx, { label: v })} placeholder="Cuota 3 de 12" />
                    </Field>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addInstallment}
                className="text-xs font-semibold transition-colors hover:opacity-80"
                style={{ color: "var(--primary)", background: "none", border: "1px dashed var(--glass-border)", borderRadius: 8, padding: "8px 12px", cursor: "pointer", width: "100%" }}
              >
                + Agregar cuota
              </button>

              {installments.length > 0 && (
                <div className="mt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  <div>Total cuotas: <strong style={{ color: "var(--foreground)" }}>{sym}{nf.format(total)}</strong></div>
                  {dealVal != null && (
                    <div>
                      Valor de la oportunidad: {sym}{nf.format(dealVal)}{" "}
                      {Math.abs(total - dealVal) < 0.01
                        ? "· coincide"
                        : `· difiere por ${sym}${nf.format(Math.abs(total - dealVal))}`}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </FormSection>

      <FormSection title="Notas">
        <Field label="Notas de la oportunidad" htmlFor="notes">
          <TextArea id="notes" value={form.notes} onChange={(v) => set("notes", v)} rows={4} placeholder="Notas sobre esta oportunidad…" />
        </Field>
      </FormSection>
    </FormShell>
  );
}
