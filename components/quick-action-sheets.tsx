"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, TrendingUp } from "lucide-react";
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
import type { LeadClassification, DealStage } from "@/lib/types";

type SheetType = "contact" | "deal" | "task" | null;

const QUICK_ACTIONS: { key: Exclude<SheetType, null>; label: string }[] = [
  { key: "contact", label: "Nuevo cliente" },
  { key: "deal", label: "Nueva oportunidad" },
  { key: "task", label: "Agendar seguimiento" },
];

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

// ── Shared label style ───────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-medium text-slate-500 mb-1">
      {children}
    </p>
  );
}

// ── Contact form ─────────────────────────────────────────────────────────────

function NewContactForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    lead_classification: "warm" as LeadClassification,
  });
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form, value: string) {
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
    const { error } = await supabase.from("contacts").insert({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim() || null,
      lead_classification: form.lead_classification,
      lead_status: "new",
    });
    setLoading(false);
    if (error) {
      toast.error("Error al crear contacto: " + error.message);
      return;
    }
    toast.success("Contacto creado");
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
      <div>
        <Label>Teléfono</Label>
        <Input
          placeholder="+1 809 000 0000"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </div>
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
      <SheetFooter>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Guardando…" : "Crear contacto"}
        </Button>
      </SheetFooter>
    </form>
  );
}

// ── Deal form ─────────────────────────────────────────────────────────────────

function NewDealForm({
  contacts,
  onClose,
}: {
  contacts: ContactOption[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    contact_id: "",
    deal_value: "",
    stage: "lead_captured" as DealStage,
  });
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form, value: string) {
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

    const { error } = await supabase.from("deals").insert({
      contact_id: form.contact_id,
      deal_value: form.deal_value ? Number(form.deal_value) : null,
      stage: form.stage,
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
        <Label>Contacto *</Label>
        <Select value={form.contact_id} onValueChange={(v) => v && set("contact_id", v)}>
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
        <Label>Valor estimado (USD)</Label>
        <Input
          type="number"
          placeholder="150000"
          value={form.deal_value}
          onChange={(e) => set("deal_value", e.target.value)}
        />
      </div>
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
      <SheetFooter>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Guardando…" : "Crear oportunidad"}
        </Button>
      </SheetFooter>
    </form>
  );
}

// ── Task form ─────────────────────────────────────────────────────────────────

function NewTaskForm({
  contacts,
  onClose,
}: {
  contacts: ContactOption[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    contact_id: "",
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
      contact_id: form.contact_id || null,
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
          placeholder="Llamar para hacer seguimiento"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>
      <div>
        <Label>Contacto</Label>
        <Select value={form.contact_id} onValueChange={(v) => v && set("contact_id", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Opcional…" />
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

// ── Page-level button: Nuevo cliente ─────────────────────────────────────────

export function NewContactButton() {
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
        className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
        style={{ background: "var(--red)" }}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Nuevo cliente
      </button>

      <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <SheetTitle
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 20,
                color: "var(--foreground)",
              }}
            >
              Nuevo cliente
            </SheetTitle>
          </SheetHeader>
          <div className="p-6">
            <NewContactForm onClose={handleClose} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Page-level button: Nueva oportunidad ─────────────────────────────────────

export function NewDealButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  // Load contacts when sheet opens
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setContacts(data as ContactOption[]);
      });
  }, [open]);

  function handleClose() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
        style={{ background: "var(--red)" }}
      >
        <TrendingUp className="h-3.5 w-3.5" />
        Nueva oportunidad
      </button>

      <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <SheetTitle
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 20,
                color: "var(--foreground)",
              }}
            >
              Nueva oportunidad
            </SheetTitle>
          </SheetHeader>
          <div className="p-6">
            <NewDealForm contacts={contacts} onClose={handleClose} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function QuickActionSheets() {
  const [openSheet, setOpenSheet] = useState<SheetType>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  // Load contacts once for deal + task pickers
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setContacts(data as ContactOption[]);
      });
  }, []);

  function closeSheet() {
    setOpenSheet(null);
  }

  const titles: Record<Exclude<SheetType, null>, string> = {
    contact: "Nuevo cliente",
    deal: "Nueva oportunidad",
    task: "Agendar seguimiento",
  };

  return (
    <>
      {/* Buttons rendered inside the dark sidebar block */}
      <div className="space-y-2">
        {QUICK_ACTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setOpenSheet(key)}
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm text-white/90 transition-all hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            {label}
            <Plus className="h-4 w-4 text-white/50" />
          </button>
        ))}
      </div>

      {/* Sheet — Nuevo cliente */}
      <Sheet
        open={openSheet === "contact"}
        onOpenChange={(open) => !open && closeSheet()}
      >
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <SheetTitle
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 20,
                color: "var(--foreground)",
              }}
            >
              {titles.contact}
            </SheetTitle>
          </SheetHeader>
          <div className="p-6">
            <NewContactForm onClose={closeSheet} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet — Nueva oportunidad */}
      <Sheet
        open={openSheet === "deal"}
        onOpenChange={(open) => !open && closeSheet()}
      >
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <SheetTitle
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 20,
                color: "var(--foreground)",
              }}
            >
              {titles.deal}
            </SheetTitle>
          </SheetHeader>
          <div className="p-6">
            <NewDealForm contacts={contacts} onClose={closeSheet} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet — Agendar seguimiento */}
      <Sheet
        open={openSheet === "task"}
        onOpenChange={(open) => !open && closeSheet()}
      >
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <SheetTitle
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 20,
                color: "var(--foreground)",
              }}
            >
              {titles.task}
            </SheetTitle>
          </SheetHeader>
          <div className="p-6">
            <NewTaskForm contacts={contacts} onClose={closeSheet} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
