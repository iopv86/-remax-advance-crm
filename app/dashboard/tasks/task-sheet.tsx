"use client";

import { useState, useEffect } from "react";
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
import type { Task } from "@/lib/types";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-medium text-slate-500 mb-1">{children}</p>
  );
}

interface TaskForm {
  title: string;
  description: string;
  due_date: string;
  priority: string;
  status: string;
}

function taskToForm(task: Task): TaskForm {
  return {
    title: task.title ?? "",
    description: task.description ?? "",
    due_date: task.due_date ? task.due_date.slice(0, 10) : "",
    priority: task.priority ?? "medium",
    status: task.status ?? "pending",
  };
}

const EMPTY: TaskForm = {
  title: "",
  description: "",
  due_date: "",
  priority: "medium",
  status: "pending",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onSaved: () => void;
}

export function TaskSheet({ open, onOpenChange, task, onSaved }: Props) {
  const isEdit = !!task;
  const [form, setForm] = useState<TaskForm>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm(task ? taskToForm(task) : EMPTY);
  }, [task, open]);

  function set(field: keyof TaskForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("El título es requerido");
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      status: form.status,
    };

    setLoading(true);
    const supabase = createClient();

    if (isEdit) {
      const { error } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", task.id);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Tarea actualizada");
    } else {
      const { error } = await supabase.from("tasks").insert(payload);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Tarea creada");
    }

    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 overflow-y-auto">
        <SheetHeader className="pb-4 border-b" style={{ borderColor: "var(--border)" }}>
          <SheetTitle className="font-sans font-semibold text-base">
            {isEdit ? "Editar tarea" : "Nueva tarea"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-5">
          <div>
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Título de la tarea"
            />
          </div>

          <div>
            <Label>Descripción</Label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Detalles opcionales"
              className="w-full rounded-lg border px-3 py-2 text-sm font-sans resize-none outline-none focus:ring-1 focus:ring-rose-400 transition"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
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
            <Select value={form.priority} onValueChange={(v) => v && set("priority", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Estado</Label>
            <Select value={form.status} onValueChange={(v) => v && set("status", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="in_progress">En progreso</SelectItem>
                <SelectItem value="completed">Completada</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear tarea"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
