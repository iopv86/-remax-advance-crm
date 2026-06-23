"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  agent_id: string | null;
}

// ── Shared label style (legible — matches components/form) ────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-sans mb-1.5"
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "var(--secondary-foreground)",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
      }}
    >
      {children}
    </p>
  );
}

// ── Task form (kept as a quick drawer — not part of B-16 full-page editors) ───

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

// ── Page-level buttons: full-page create flows ────────────────────────────────

const PILL_CLASS =
  "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95";

export function NewContactButton() {
  return (
    <Link href="/dashboard/contacts/new" className={PILL_CLASS} style={{ background: "var(--red)" }}>
      <UserPlus className="h-3.5 w-3.5" />
      Nuevo cliente
    </Link>
  );
}

export function NewDealButton() {
  return (
    <Link href="/dashboard/pipeline/new" className={PILL_CLASS} style={{ background: "var(--red)" }}>
      <TrendingUp className="h-3.5 w-3.5" />
      Nueva oportunidad
    </Link>
  );
}

// ── Sidebar quick actions ─────────────────────────────────────────────────────

const QUICK_LINKS: { label: string; href: string }[] = [
  { label: "Nuevo cliente", href: "/dashboard/contacts/new" },
  { label: "Nueva oportunidad", href: "/dashboard/pipeline/new" },
];

export function QuickActionSheets() {
  const [taskOpen, setTaskOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  useEffect(() => {
    if (!taskOpen) return;
    const supabase = createClient();
    supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setContacts(data as ContactOption[]);
      });
  }, [taskOpen]);

  return (
    <>
      <div className="space-y-2">
        {QUICK_LINKS.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm text-white/90 transition-all hover:bg-white/10"
            style={{ background: "var(--glass-bg)" }}
          >
            {label}
            <Plus className="h-4 w-4 text-white/50" />
          </Link>
        ))}
        <button
          onClick={() => setTaskOpen(true)}
          className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm text-white/90 transition-all hover:bg-white/10"
          style={{ background: "var(--glass-bg)" }}
        >
          Agendar seguimiento
          <Plus className="h-4 w-4 text-white/50" />
        </button>
      </div>

      <Sheet open={taskOpen} onOpenChange={(o) => !o && setTaskOpen(false)}>
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
              Agendar seguimiento
            </SheetTitle>
          </SheetHeader>
          <div className="p-6">
            <NewTaskForm contacts={contacts} onClose={() => setTaskOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
