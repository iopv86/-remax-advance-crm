"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/lib/types";
import {
  Field,
  TextInput,
  NumberInput,
  TextArea,
  NativeSelect,
  TagInput,
  type SelectOption,
} from "@/components/form/fields";
import { FormShell, FormSection } from "@/components/form/form-shell";
import { LeadFormAnswers } from "@/components/contacts/lead-form-answers";

const CLASSIFICATION_OPTS: SelectOption[] = [
  { value: "hot", label: "Caliente (HOT)" },
  { value: "warm", label: "Templado (WARM)" },
  { value: "cold", label: "Frío (COLD)" },
  { value: "unqualified", label: "Sin calificar" },
];
const STATUS_OPTS: SelectOption[] = [
  { value: "new", label: "Nuevo" },
  { value: "contacted", label: "Contactado" },
  { value: "qualified", label: "Calificado" },
  { value: "unqualified", label: "No calificado" },
  { value: "nurturing", label: "Nutriendo" },
  { value: "archived", label: "Archivado" },
];
const SOURCE_OPTS: SelectOption[] = [
  { value: "ctwa_ad", label: "Anuncio CTWA" },
  { value: "lead_form", label: "Formulario Meta" },
  { value: "referral", label: "Referido" },
  { value: "walk_in", label: "Visita / Oficina" },
  { value: "website", label: "Sitio web" },
  { value: "social_media", label: "Redes sociales" },
  { value: "other", label: "Otro" },
];
const PROPERTY_TYPE_OPTS: SelectOption[] = [
  { value: "apartment", label: "Apartamento" },
  { value: "penthouse", label: "Penthouse" },
  { value: "villa", label: "Villa" },
  { value: "house", label: "Casa" },
  { value: "land", label: "Terreno / Solar" },
  { value: "commercial", label: "Comercial" },
  { value: "apart_hotel", label: "Apart-hotel" },
  { value: "farm", label: "Finca" },
];
// Values MUST match the Postgres enums (purpose_type / timeline_type /
// payment_method). Labels stay in Spanish; only the stored value is the enum.
const PURPOSE_OPTS: SelectOption[] = [
  { value: "investment", label: "Inversión" },
  { value: "personal", label: "Uso personal" },
  { value: "both", label: "Ambos" },
];
const TIMELINE_OPTS: SelectOption[] = [
  { value: "immediate", label: "Inmediato" },
  { value: "1_3_months", label: "1 – 3 meses" },
  { value: "3_6_months", label: "3 – 6 meses" },
  { value: "6_12_months", label: "6 – 12 meses" },
  { value: "exploring", label: "Solo explorando" },
];
const PAYMENT_OPTS: SelectOption[] = [
  { value: "cash", label: "Contado" },
  { value: "financing", label: "Financiamiento bancario" },
  { value: "mixed", label: "Mixto" },
  { value: "crypto", label: "Cripto" },
  { value: "unknown", label: "Otro / Sin definir" },
];
const CURRENCY_OPTS: SelectOption[] = [
  { value: "USD", label: "USD (US$)" },
  { value: "DOP", label: "DOP (RD$)" },
];

interface PropertyOption {
  id: string;
  title: string;
  city: string | null;
  sector: string | null;
}

export function ContactEditForm({
  contact,
  agents,
  properties,
  privileged,
  currentAgentId,
}: {
  contact?: Contact | null;
  agents: { id: string; full_name: string }[];
  properties: PropertyOption[];
  privileged: boolean;
  currentAgentId?: string;
}) {
  const router = useRouter();
  const isCreate = !contact;
  const backHref = contact ? `/dashboard/contacts/${contact.id}` : "/dashboard/contacts";
  const [saving, setSaving] = useState(false);
  const [locDraft, setLocDraft] = useState("");

  const [form, setForm] = useState({
    first_name: contact?.first_name ?? "",
    last_name: contact?.last_name ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    whatsapp_number: contact?.whatsapp_number ?? "",
    // New contacts default to "Sin calificar" (unqualified) so the editor stamps
    // qualification_source='auto' and the gate manages the badge. The agent can
    // still pick a temperature (hot/warm/cold), which freezes the row as manual.
    lead_classification: contact?.lead_classification ?? "unqualified",
    lead_status: contact?.lead_status ?? "new",
    source: contact?.source ?? (isCreate ? "referral" : "other"),
    source_detail: contact?.source_detail ?? "",
    agent_id: contact?.agent_id ?? "",
    property_type_interest: contact?.property_type_interest ?? "",
    preferred_locations: (contact?.preferred_locations ?? []) as string[],
    purpose: contact?.purpose ?? "",
    timeline: contact?.timeline ?? "",
    payment_method: contact?.payment_method ?? "",
    decision_maker: contact?.decision_maker ?? "",
    linked_property_id: contact?.linked_property_id ?? "",
    budget_currency: contact?.budget_currency ?? "USD",
    budget_min: contact?.budget_min?.toString() ?? "",
    budget_max: contact?.budget_max?.toString() ?? "",
    ai_summary: contact?.ai_summary ?? "",
    agent_notes: contact?.agent_notes ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const showSourceDetail = form.source === "referral" || form.source === "other";

  async function handleSave() {
    if (!form.first_name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (isCreate && !form.phone.trim() && !form.email.trim()) {
      toast.error("Ingresa al menos un teléfono o email");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      whatsapp_number: form.whatsapp_number.trim() || form.phone.trim() || null,
      lead_classification: form.lead_classification,
      lead_status: form.lead_status,
      // Setting a real temperature (hot/warm/cold) is a manual decision: freeze the
      // row so the auto-qualification trigger never overrides it. Leaving it
      // "Sin calificar" (unqualified) hands the row to the auto engine, so filling
      // budget/type/timeline can promote it to cold/qualified via the gate.
      qualification_source: form.lead_classification === "unqualified" ? "auto" : "manual",
      source: form.source,
      // Only touch source_detail when the field is actually shown — never null
      // a previously-recorded value just because the source type hides it.
      ...(showSourceDetail ? { source_detail: form.source_detail.trim() || null } : {}),
      property_type_interest: form.property_type_interest || null,
      preferred_locations: form.preferred_locations.length ? form.preferred_locations : null,
      purpose: form.purpose || null,
      timeline: form.timeline || null,
      payment_method: form.payment_method || null,
      decision_maker: form.decision_maker.trim() || null,
      linked_property_id: form.linked_property_id || null,
      budget_currency: form.budget_currency,
      budget_min: form.budget_min ? parseFloat(form.budget_min) : null,
      budget_max: form.budget_max ? parseFloat(form.budget_max) : null,
      ai_summary: form.ai_summary.trim() || null,
      agent_notes: form.agent_notes.trim() || null,
    };

    if (isCreate) {
      // agent_id must satisfy RLS: own id for non-privileged, chosen/own for privileged.
      payload.agent_id = (privileged && form.agent_id) || currentAgentId || null;
      const { data: inserted, error } = await supabase
        .from("contacts")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserted) {
        toast.error("Error al crear: " + (error?.message ?? "desconocido"));
        setSaving(false);
        return;
      }
      // No post-insert workaround needed: qualification_source='manual' in the
      // payload freezes the row, so the agent's classification sticks on insert.
      toast.success("Contacto creado");
      router.push(`/dashboard/contacts/${inserted.id}`);
      router.refresh();
      return;
    }

    payload.updated_at = new Date().toISOString();
    if (privileged && form.agent_id) payload.agent_id = form.agent_id;
    const { error } = await supabase.from("contacts").update(payload).eq("id", contact!.id);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      setSaving(false);
      return;
    }
    toast.success("Contacto actualizado");
    router.push(backHref);
    router.refresh();
  }

  const fullName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Contacto";
  const propertyOpts: SelectOption[] = properties.map((p) => ({
    value: p.id,
    label: [p.title, p.sector || p.city].filter(Boolean).join(" · "),
  }));

  return (
    <FormShell
      title={isCreate ? "Nuevo contacto" : "Editar contacto"}
      subtitle={isCreate ? undefined : fullName}
      backHref={backHref}
      onSubmit={handleSave}
      saving={saving}
      saveLabel={isCreate ? "Crear contacto" : "Guardar cambios"}
    >
      <FormSection title="Identidad">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Nombre" htmlFor="first_name" required>
            <TextInput id="first_name" value={form.first_name} onChange={(v) => set("first_name", v)} placeholder="Nombre" />
          </Field>
          <Field label="Apellido" htmlFor="last_name">
            <TextInput id="last_name" value={form.last_name} onChange={(v) => set("last_name", v)} placeholder="Apellido" />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Teléfono / WhatsApp" htmlFor="phone">
            <TextInput id="phone" type="tel" value={form.phone} onChange={(v) => set("phone", v)} placeholder="+1 829 000 0000" />
          </Field>
          <Field label="Email" htmlFor="email">
            <TextInput id="email" type="email" value={form.email} onChange={(v) => set("email", v)} placeholder="correo@ejemplo.com" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Clasificación y estado">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Clasificación" htmlFor="classification">
            <NativeSelect id="classification" value={form.lead_classification} onChange={(v) => set("lead_classification", v as Contact["lead_classification"] & string)} options={CLASSIFICATION_OPTS} />
          </Field>
          <Field label="Estado" htmlFor="status">
            <NativeSelect id="status" value={form.lead_status} onChange={(v) => set("lead_status", v as Contact["lead_status"] & string)} options={STATUS_OPTS} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: showSourceDetail ? "1fr 1fr" : "1fr", gap: 14 }}>
          <Field label="Origen" htmlFor="source">
            <NativeSelect id="source" value={form.source} onChange={(v) => set("source", v as Contact["source"] & string)} options={SOURCE_OPTS} />
          </Field>
          {showSourceDetail && (
            <Field label={form.source === "referral" ? "¿Quién refirió?" : "Detalle del origen"} htmlFor="source_detail">
              <TextInput id="source_detail" value={form.source_detail} onChange={(v) => set("source_detail", v)} />
            </Field>
          )}
        </div>
        {privileged && (
          <Field label="Agente asignado" htmlFor="agent">
            <NativeSelect
              id="agent"
              value={form.agent_id}
              onChange={(v) => set("agent_id", v)}
              options={agents.map((a) => ({ value: a.id, label: a.full_name }))}
              placeholder="— Sin asignar —"
            />
          </Field>
        )}
      </FormSection>

      <FormSection title="Búsqueda inmobiliaria" description="Qué busca el cliente y cómo lo busca.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Intereses / Propósito" htmlFor="purpose">
            <NativeSelect id="purpose" value={form.purpose} onChange={(v) => set("purpose", v)} options={PURPOSE_OPTS} placeholder="— Seleccionar —" />
          </Field>
          <Field label="Tipo de propiedad" htmlFor="ptype">
            <NativeSelect id="ptype" value={form.property_type_interest} onChange={(v) => set("property_type_interest", v as Contact["property_type_interest"] & string)} options={PROPERTY_TYPE_OPTS} placeholder="— Seleccionar —" />
          </Field>
        </div>

        <Field label="Zonas de interés" htmlFor="zonas" hint="Escribe una zona y presiona Enter o coma.">
          <TagInput
            id="zonas"
            value={form.preferred_locations}
            onChange={(v) => set("preferred_locations", v)}
            draft={locDraft}
            onDraftChange={setLocDraft}
            placeholder="Ej: Piantini, Naco, Punta Cana…"
          />
        </Field>

        <Field label="Presupuesto">
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10 }}>
            <NativeSelect value={form.budget_currency} onChange={(v) => set("budget_currency", v as "USD" | "DOP")} options={CURRENCY_OPTS} />
            <NumberInput value={form.budget_min} onChange={(v) => set("budget_min", v)} placeholder="Mínimo" />
            <NumberInput value={form.budget_max} onChange={(v) => set("budget_max", v)} placeholder="Máximo" />
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Timeline de compra" htmlFor="timeline">
            <NativeSelect id="timeline" value={form.timeline} onChange={(v) => set("timeline", v)} options={TIMELINE_OPTS} placeholder="— Seleccionar —" />
          </Field>
          <Field label="Método de pago" htmlFor="payment">
            <NativeSelect id="payment" value={form.payment_method} onChange={(v) => set("payment_method", v)} options={PAYMENT_OPTS} placeholder="— Seleccionar —" />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Decisor" htmlFor="decision" hint="Quién toma la decisión de compra.">
            <TextInput id="decision" value={form.decision_maker} onChange={(v) => set("decision_maker", v)} placeholder="Ej: él mismo, pareja, empresa…" />
          </Field>
          <Field label="Propiedad vinculada" htmlFor="linked_property">
            <NativeSelect id="linked_property" value={form.linked_property_id} onChange={(v) => set("linked_property_id", v)} options={propertyOpts} placeholder="— Ninguna —" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Notas">
        <Field label='Lo que busca (resumen)' htmlFor="ai_summary">
          <TextArea id="ai_summary" value={form.ai_summary} onChange={(v) => set("ai_summary", v)} rows={3} placeholder="Resumen de lo que busca el cliente…" />
        </Field>
        <Field label="Notas del agente" htmlFor="agent_notes">
          <TextArea id="agent_notes" value={form.agent_notes} onChange={(v) => set("agent_notes", v)} rows={4} placeholder="Notas privadas sobre este contacto…" />
        </Field>
      </FormSection>

      <LeadFormAnswers answers={contact?.lead_form_answers} />
    </FormShell>
  );
}
