"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Task } from "@/lib/types";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-sans text-xs font-medium text-slate-500 mb-1">{children}</p>;
}

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface TaskFormState {
  title: string;
  description: string;
  contact_id: string;
  due_date: string;
  priority: string;
  status: string;
}

const EMPTY_FORM: TaskFormState = {
  title: "",
  description: "",
  contact_id: "",
  due_date: "",
  priority: "medium",
  status: "pending",
};

function taskToForm(t: Task): TaskFormState {
  return {
    title: t.title,
    description: t.description ?? "",
    contact_id: t.contact_id ?? "",
    due_date: t.due_date ?? "",
    priority: t.priority,
    status: t.status,
  };
}

interface TaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  contacts: ContactOption[];
  onSaved: () => void;
}

export function TaskSheet({ open, onOpenChange, task, contacts, onSaved }: TaskSheetProps) {
  const isEdit = !!task;
  const [form, setForm] = useState<TaskFormState>(task ? taskToForm(task) : EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(o: boolean) {
    if (o) setForm(task ? taskToForm(task) : EMPTY_FORM);
    onOpenChange(o);
  }

  function set(field: keyof TaskFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("El título es obligatorio"); return; }
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: agent } = await supabase
      .from("agents").select("id").eq("email", user?.email ?? "").maybeSingle();

    const agentId = agent?.id ?? null;
    const now = new Date().toISOString();

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      contact_id: form.contact_id || null,
      due_date: form.due_date || null,
      priority: form.priority,
      status: form.status,
      agent_id: agentId,
    };

    // Handle completed_at transitions
    if (form.status === "completed" && (!isEdit || task?.status !== "completed")) {
      payload.completed_at = now;
      payload.completed_by = agentId;
    } else if (form.status !== "completed" && isEdit && task?.status === "completed") {
      payload.completed_at = null;
      payload.completed_by = null;
    }

    let error;
    if (isEdit) {
      ({ error } = await supabase.from("tasks").update(payload).eq("id", task!.id));
    } else {
      ({ error } = await supabase.from("tasks").insert(payload));
    }

    setLoading(false);
    if (error) { toast.error("Error al guardar: " + error.message); return; }
    toast.success(isEdit ? "Tarea actualizada" : "Tarea creada");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader
          className="p-6 pb-4 sticky top-0 bg-white dark:bg-card z-10"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <SheetTitle style={{
            fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
            fontWeight: 700, fontSize: 20, color: "var(--foreground)",
          }}>
            {isEdit ? "Editar tarea" : "Nueva tarea"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <Label>Título *</Label>
            <Input
              placeholder="Ej. Llamar al cliente para seguimiento"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Descripción</Label>
            <textarea
              rows={3}
              placeholder="Detalles opcionales…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
            />
          </div>

          <div>
            <Label>Contacto</Label>
            <Select value={form.contact_id || "__none__"} onValueChange={(v) => v && set("contact_id", v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Ninguno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ninguno</SelectItem>
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
            <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridad</Label>
              <Select value={form.priority} onValueChange={(v) => v && set("priority", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={(v) => v && set("status", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="in_progress">En progreso</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <SheetFooter className="pt-2">
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarea"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
