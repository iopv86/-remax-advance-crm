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
import type { Deal, DealStage } from "@/lib/types";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-medium text-slate-500 mb-1">{children}</p>
  );
}

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface DealFormState {
  contact_id: string;
  stage: DealStage;
  deal_value: string;
  currency: "USD" | "DOP";
  expected_close_date: string;
  notes: string;
}

const EMPTY_FORM: DealFormState = {
  contact_id: "",
  stage: "lead_captured",
  deal_value: "",
  currency: "USD",
  expected_close_date: "",
  notes: "",
};

function dealToForm(d: Deal): DealFormState {
  return {
    contact_id: d.contact_id,
    stage: d.stage,
    deal_value: d.deal_value?.toString() ?? "",
    currency: d.currency ?? "USD",
    expected_close_date: d.expected_close_date ?? "",
    notes: d.notes ?? "",
  };
}

interface DealSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  contacts: ContactOption[];
  onSaved: () => void;
}

export function DealSheet({
  open,
  onOpenChange,
  deal,
  contacts,
  onSaved,
}: DealSheetProps) {
  const isEdit = !!deal;
  const [form, setForm] = useState<DealFormState>(
    deal ? dealToForm(deal) : EMPTY_FORM
  );
  const [loading, setLoading] = useState(false);

  function handleOpenChange(o: boolean) {
    if (o) {
      setForm(deal ? dealToForm(deal) : EMPTY_FORM);
    }
    onOpenChange(o);
  }

  function set(field: keyof DealFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contact_id) {
      toast.error("Selecciona un contacto");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("email", user?.email ?? "")
      .single();

    const payload = {
      contact_id: form.contact_id,
      stage: form.stage,
      deal_value: form.deal_value ? Number(form.deal_value) : null,
      currency: form.currency,
      expected_close_date: form.expected_close_date || null,
      notes: form.notes.trim() || null,
      agent_id: agent?.id ?? null,
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", deal!.id));
    } else {
      ({ error } = await supabase.from("deals").insert(payload));
    }

    setLoading(false);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }
    toast.success(isEdit ? "Oportunidad actualizada" : "Oportunidad creada");
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
              fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
              fontWeight: 700,
              fontSize: 20,
              color: "var(--foreground)",
            }}
          >
            {isEdit ? "Editar oportunidad" : "Nueva oportunidad"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <Label>Contacto *</Label>
            <Select
              value={form.contact_id}
              onValueChange={(v) => v && set("contact_id", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar contacto…" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name ?? ""} {c.last_name ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Etapa</Label>
            <Select
              value={form.stage}
              onValueChange={(v) => v && set("stage", v as DealStage)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead_captured">Lead capturado</SelectItem>
                <SelectItem value="qualified">Calificado</SelectItem>
                <SelectItem value="contacted">Contactado</SelectItem>
                <SelectItem value="showing_scheduled">Visita agendada</SelectItem>
                <SelectItem value="showing_done">Visita realizada</SelectItem>
                <SelectItem value="offer_made">Oferta presentada</SelectItem>
                <SelectItem value="negotiation">En negociación</SelectItem>
                <SelectItem value="promesa_de_venta">Promesa de venta</SelectItem>
                <SelectItem value="financiamiento">Financiamiento</SelectItem>
                <SelectItem value="contract">Contrato firmado</SelectItem>
                <SelectItem value="due_diligence">Due diligence</SelectItem>
                <SelectItem value="closed_won">Cerrado/Ganado</SelectItem>
                <SelectItem value="closed_lost">Cerrado/Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor estimado</Label>
              <Input
                type="number"
                placeholder="150000"
                value={form.deal_value}
                onChange={(e) => set("deal_value", e.target.value)}
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => v && set("currency", v as "USD" | "DOP")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="DOP">DOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Cierre esperado</Label>
            <Input
              type="date"
              value={form.expected_close_date}
              onChange={(e) => set("expected_close_date", e.target.value)}
            />
          </div>

          <div>
            <Label>Notas</Label>
            <textarea
              rows={3}
              placeholder="Notas opcionales…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
            />
          </div>

          <SheetFooter className="pt-2">
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear oportunidad"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
