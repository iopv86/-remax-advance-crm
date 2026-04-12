"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Contact, LeadClassification, LeadStatus, LeadSource } from "@/lib/types";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-medium text-slate-500 mb-1">{children}</p>
  );
}

interface ContactFormState {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  lead_classification: string;
  lead_status: string;
  source: string;
  budget_min: string;
  budget_max: string;
}

const EMPTY_FORM: ContactFormState = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  lead_classification: "warm",
  lead_status: "new",
  source: "",
  budget_min: "",
  budget_max: "",
};

function contactToForm(c: Contact): ContactFormState {
  return {
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    lead_classification: c.lead_classification ?? "warm",
    lead_status: c.lead_status ?? "new",
    source: c.source ?? "",
    budget_min: c.budget_min?.toString() ?? "",
    budget_max: c.budget_max?.toString() ?? "",
  };
}

interface ContactSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSaved: () => void;
}

export function ContactSheet({
  open,
  onOpenChange,
  contact,
  onSaved,
}: ContactSheetProps) {
  const isEdit = !!contact;
  const [form, setForm] = useState<ContactFormState>(
    contact ? contactToForm(contact) : EMPTY_FORM
  );
  const [loading, setLoading] = useState(false);

  function handleOpenChange(o: boolean) {
    if (o) {
      setForm(contact ? contactToForm(contact) : EMPTY_FORM);
    }
    onOpenChange(o);
  }

  function set(field: keyof ContactFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setLoading(true);
    const supabase = createClient();

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      lead_classification: form.lead_classification as LeadClassification,
      lead_status: form.lead_status as LeadStatus,
      source: (form.source || null) as LeadSource | null,
      budget_min: form.budget_min ? Number(form.budget_min) : null,
      budget_max: form.budget_max ? Number(form.budget_max) : null,
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase
        .from("contacts")
        .update(payload)
        .eq("id", contact!.id));
    } else {
      ({ error } = await supabase.from("contacts").insert(payload));
    }

    setLoading(false);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }
    toast.success(isEdit ? "Contacto actualizado" : "Contacto creado");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader
          className="p-6 pb-4 sticky top-0 bg-white z-10"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <SheetTitle
            style={{
              fontFamily: "var(--font-playfair),Georgia,serif",
              fontWeight: 700,
              fontSize: 20,
              color: "var(--foreground)",
            }}
          >
            {isEdit ? "Editar contacto" : "Nuevo contacto"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nombre *</Label>
              <Input
                placeholder="María"
                value={form.first_name}
                onChange={(e) => set("first_name", e.target.value)}
              />
            </div>
            <div>
              <Label>Apellido</Label>
              <Input
                placeholder="García"
                value={form.last_name}
                onChange={(e) => set("last_name", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Teléfono</Label>
            <Input
              placeholder="+1 809 000 0000"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>

          <div>
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="maria@example.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Clasificación</Label>
              <Select
                value={form.lead_classification}
                onValueChange={(v) => v && set("lead_classification", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot">🔥 HOT</SelectItem>
                  <SelectItem value="warm">🟠 WARM</SelectItem>
                  <SelectItem value="cold">❄️ COLD</SelectItem>
                  <SelectItem value="unqualified">Unqualified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={form.lead_status}
                onValueChange={(v) => v && set("lead_status", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Nuevo</SelectItem>
                  <SelectItem value="contacted">Contactado</SelectItem>
                  <SelectItem value="qualified">Calificado</SelectItem>
                  <SelectItem value="unqualified">No calificado</SelectItem>
                  <SelectItem value="nurturing">Nutriendo</SelectItem>
                  <SelectItem value="archived">Archivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Fuente</Label>
            <Select
              value={form.source}
              onValueChange={(v) => v && set("source", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ctwa_ad">CTWA Ad</SelectItem>
                <SelectItem value="lead_form">Formulario</SelectItem>
                <SelectItem value="referral">Referido</SelectItem>
                <SelectItem value="walk_in">Walk-in</SelectItem>
                <SelectItem value="website">Web</SelectItem>
                <SelectItem value="social_media">Redes sociales</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Presupuesto mín. (USD)</Label>
              <Input
                type="number"
                placeholder="100000"
                value={form.budget_min}
                onChange={(e) => set("budget_min", e.target.value)}
              />
            </div>
            <div>
              <Label>Presupuesto máx. (USD)</Label>
              <Input
                type="number"
                placeholder="300000"
                value={form.budget_max}
                onChange={(e) => set("budget_max", e.target.value)}
              />
            </div>
          </div>

          <SheetFooter className="pt-2">
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear contacto"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
