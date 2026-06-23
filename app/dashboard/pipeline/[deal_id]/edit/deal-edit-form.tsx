"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PIPELINE_STAGE_ORDER, STAGE_LABELS } from "@/lib/types";
import type { Deal, DealStage } from "@/lib/types";
import {
  Field,
  TextInput,
  NumberInput,
  TextArea,
  NativeSelect,
  type SelectOption,
} from "@/components/form/fields";
import { FormShell, FormSection } from "@/components/form/form-shell";

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
}: {
  deal?: Deal | null;
  contacts: ContactOption[];
  properties: PropertyOption[];
  currentAgentId?: string;
}) {
  const router = useRouter();
  const isCreate = !deal;
  const backHref = deal ? `/dashboard/pipeline/${deal.id}` : "/dashboard/pipeline";
  const [saving, setSaving] = useState(false);

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

      <FormSection title="Notas">
        <Field label="Notas de la oportunidad" htmlFor="notes">
          <TextArea id="notes" value={form.notes} onChange={(v) => set("notes", v)} rows={4} placeholder="Notas sobre esta oportunidad…" />
        </Field>
      </FormSection>
    </FormShell>
  );
}
