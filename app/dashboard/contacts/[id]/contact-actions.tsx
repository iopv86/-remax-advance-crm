"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import type { DealStage } from "@/lib/types";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-medium text-slate-500 mb-1">{children}</p>
  );
}

interface Props {
  contactId: string;
  contactName: string;
  type: "deal" | "task";
}

export function ContactActions({ contactId, contactName, type }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleClose() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
        style={{ background: "var(--red)" }}
      >
        <Plus className="h-3 w-3" />
        {type === "deal" ? "Nueva oportunidad" : "Nuevo seguimiento"}
      </button>

      <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <SheetTitle
              style={{
                fontFamily: "var(--font-playfair),Georgia,serif",
                fontWeight: 700,
                fontSize: 20,
                color: "var(--foreground)",
              }}
            >
              {type === "deal" ? "Nueva oportunidad" : "Nuevo seguimiento"}
            </SheetTitle>
            <p className="font-sans text-xs text-muted-foreground mt-1">Para: {contactName}</p>
          </SheetHeader>
          <div className="p-6">
            {type === "deal" ? (
              <DealForm contactId={contactId} onClose={handleClose} />
            ) : (
              <TaskForm contactId={contactId} onClose={handleClose} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function DealForm({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const [form, setForm] = useState({
    deal_value: "",
    stage: "lead_captured" as DealStage,
    expected_close_date: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("email", user?.email ?? "")
      .single();

    const { error } = await supabase.from("deals").insert({
      contact_id: contactId,
      deal_value: form.deal_value ? Number(form.deal_value) : null,
      stage: form.stage,
      expected_close_date: form.expected_close_date || null,
      notes: form.notes.trim() || null,
      agent_id: agent?.id ?? null,
      currency: "USD",
    });
    setLoading(false);
    if (error) {
      toast.error("Error al crear oportunidad: " + error.message);
      return;
    }
    toast.success("Oportunidad creada");
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label>Etapa</Label>
        <Select value={form.stage} onValueChange={(v) => v && set("stage", v as DealStage)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lead_captured">Lead capturado</SelectItem>
            <SelectItem value="qualified">Calificado</SelectItem>
            <SelectItem value="contacted">Contactado</SelectItem>
            <SelectItem value="showing_scheduled">Visita agendada</SelectItem>
            <SelectItem value="offer_made">Oferta presentada</SelectItem>
            <SelectItem value="negotiation">En negociación</SelectItem>
            <SelectItem value="contract">Contrato firmado</SelectItem>
            <SelectItem value="closed_won">Cerrado/Ganado</SelectItem>
            <SelectItem value="closed_lost">Cerrado/Perdido</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Valor estimado (USD)</Label>
        <Input
          type="number"
          placeholder="150000"
          value={form.deal_value}
          onChange={(e) => set("deal_value", e.target.value)}
        />
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
          rows={2}
          placeholder="Notas opcionales…"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
        />
      </div>
      <SheetFooter>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Guardando…" : "Crear oportunidad"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function TaskForm({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const [form, setForm] = useState({
    title: "",
    due_date: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
  });
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("El título es obligatorio");
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

    const { error } = await supabase.from("tasks").insert({
      title: form.title.trim(),
      contact_id: contactId,
      due_date: form.due_date || null,
      priority: form.priority,
      status: "pending",
      agent_id: agent?.id ?? null,
    });
    setLoading(false);
    if (error) {
      toast.error("Error al crear tarea: " + error.message);
      return;
    }
    toast.success("Seguimiento agendado");
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label>Título *</Label>
        <Input
          placeholder="Llamar para confirmar visita"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>
      <div>
        <Label>Fecha de vencimiento</Label>
        <Input
          type="date"
          value={form.due_date}
          onChange={(e) => set("due_date", e.target.value)}
        />
      </div>
      <div>
        <Label>Prioridad</Label>
        <Select
          value={form.priority}
          onValueChange={(v) => v && set("priority", v as typeof form.priority)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Baja</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SheetFooter>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Guardando…" : "Agendar seguimiento"}
        </Button>
      </SheetFooter>
    </form>
  );
}
