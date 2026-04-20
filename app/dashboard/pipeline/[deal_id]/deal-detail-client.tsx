"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, User, CalendarDays, DollarSign,
  ChevronRight, Pencil, Check, X, Clock, TrendingUp,
  CheckSquare, Square, Plus, MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STAGE_LABELS, type Deal, type DealStage, type Task } from "@/lib/types";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const ALL_STAGES: DealStage[] = [
  "lead_captured", "qualified", "contacted", "showing_scheduled",
  "showing_done", "offer_made", "negotiation", "promesa_de_venta",
  "financiamiento", "contract", "due_diligence", "closed_won", "closed_lost",
];

const STAGE_COLORS: Record<string, string> = {
  lead_captured: "#3b82f6",
  qualified: "#8b5cf6",
  contacted: "#6366f1",
  showing_scheduled: "#f59e0b",
  showing_done: "#f59e0b",
  offer_made: "#f97316",
  negotiation: "#ef4444",
  promesa_de_venta: "#C9963A",
  financiamiento: "#C9963A",
  contract: "#10b981",
  due_diligence: "#10b981",
  closed_won: "#22c55e",
  closed_lost: "#64748b",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#64748b",
};

interface StageHistoryEntry {
  id: string;
  from_stage: DealStage | null;
  to_stage: DealStage;
  changed_by: string | null;
  changed_by_system: boolean;
  notes: string | null;
  created_at: string;
  agent?: { full_name: string | null } | null;
}

interface DealWithProperty extends Deal {
  property?: {
    id: string;
    title: string;
    city?: string;
    sector?: string;
  } | null;
}

interface Props {
  deal: DealWithProperty;
  history: StageHistoryEntry[];
  initialTasks: Task[];
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[\s\-\+\(\)]/g, "");
}

export function DealDetailClient({ deal: initialDeal, history, initialTasks }: Props) {
  const router = useRouter();
  const [deal, setDeal] = useState(initialDeal);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  // Editing state
  const [editingStage, setEditingStage] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingCloseDate, setEditingCloseDate] = useState(false);

  const [stageValue, setStageValue] = useState<DealStage>(deal.stage);
  const [dealValue, setDealValue] = useState(String(deal.deal_value ?? ""));
  const [notesValue, setNotesValue] = useState(deal.notes ?? "");
  const [closeDateValue, setCloseDateValue] = useState(deal.expected_close_date ?? "");
  const [saving, setSaving] = useState(false);

  // Task state
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"high" | "medium" | "low">("medium");
  const [savingTask, setSavingTask] = useState(false);

  const contact = deal.contact as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
  const property = deal.property;
  const agent = deal.agent as { full_name?: string | null; email?: string | null } | null;

  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Sin nombre"
    : "—";

  const formatCurrency = (val?: number | null, cur?: string | null) => {
    if (!val) return "—";
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: cur === "USD" ? "USD" : "DOP",
      minimumFractionDigits: 0,
    }).format(val);
  };

  async function saveStage() {
    if (stageValue === deal.stage) { setEditingStage(false); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ stage: stageValue, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) { toast.error("Error guardando stage"); setSaving(false); return; }
    await supabase.from("deal_stage_history").insert({
      deal_id: deal.id,
      from_stage: deal.stage,
      to_stage: stageValue,
      changed_by_system: false,
    });
    setDeal((d) => ({ ...d, stage: stageValue }));
    toast.success("Stage actualizado");
    setEditingStage(false);
    setSaving(false);
    router.refresh();
  }

  async function saveValue() {
    const parsed = parseFloat(dealValue.replace(/,/g, ""));
    if (isNaN(parsed)) { toast.error("Valor inválido"); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ deal_value: parsed, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) { toast.error("Error guardando valor"); setSaving(false); return; }
    setDeal((d) => ({ ...d, deal_value: parsed }));
    toast.success("Valor actualizado");
    setEditingValue(false);
    setSaving(false);
  }

  async function saveNotes() {
    if (notesValue.length > 5000) { toast.error("Notas demasiado largas (máx 5000 caracteres)"); return; }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ notes: notesValue, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) { toast.error("Error guardando notas"); setSaving(false); return; }
    setDeal((d) => ({ ...d, notes: notesValue }));
    toast.success("Notas guardadas");
    setEditingNotes(false);
    setSaving(false);
  }

  async function saveCloseDate() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ expected_close_date: closeDateValue || null, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) { toast.error("Error guardando fecha"); setSaving(false); return; }
    setDeal((d) => ({ ...d, expected_close_date: closeDateValue || undefined }));
    toast.success("Fecha actualizada");
    setEditingCloseDate(false);
    setSaving(false);
  }

  async function toggleTask(task: Task) {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    const supabase = createClient();
    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    if (error) { toast.error("Error actualizando tarea"); return; }
    setTasks((prev) =>
      prev.map((t) => t.id === task.id ? { ...t, status: newStatus as Task["status"] } : t)
    );
  }

  async function addTask() {
    if (!newTaskTitle.trim()) return;
    setSavingTask(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingTask(false); return; }

    const { data: agentRow } = await supabase
      .from("agents")
      .select("id")
      .eq("email", user.email!)
      .single();

    const payload: Record<string, unknown> = {
      title: newTaskTitle.trim(),
      deal_id: deal.id,
      contact_id: deal.contact_id ?? null,
      agent_id: agentRow?.id ?? user.id,
      priority: newTaskPriority,
      status: "pending",
      is_automated: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (newTaskDue) payload.due_date = new Date(newTaskDue).toISOString();

    const { data, error } = await supabase.from("tasks").insert(payload).select().single();
    if (error) { toast.error("Error creando tarea"); setSavingTask(false); return; }
    setTasks((prev) => [data as Task, ...prev]);
    setNewTaskTitle("");
    setNewTaskDue("");
    setNewTaskPriority("medium");
    setAddingTask(false);
    toast.success("Tarea creada");
    setSavingTask(false);
  }

  const stageColor = STAGE_COLORS[deal.stage] ?? "#C9963A";
  const stageIdx = ALL_STAGES.indexOf(deal.stage);
  const isLost = deal.stage === "closed_lost";
  const isWon = deal.stage === "closed_won";

  const pendingTasks = tasks.filter((t) => t.status !== "completed");
  const doneTasks = tasks.filter((t) => t.status === "completed");

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/pipeline"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: "-0.02em",
                color: "var(--foreground)",
              }}
            >
              {contactName}
            </h1>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}>
              <span>Pipeline</span>
              <ChevronRight className="w-3 h-3" />
              <span>Deal</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: `${stageColor}18`, color: stageColor, border: `1px solid ${stageColor}30` }}
          >
            {STAGE_LABELS[deal.stage]}
          </span>
          <span
            className="text-lg font-bold"
            style={{
              fontFamily: "var(--font-display),var(--font-manrope),system-ui",
              color: "var(--primary)",
            }}
          >
            {formatCurrency(deal.deal_value, deal.currency)}
          </span>
        </div>
      </div>

      <div className="flex-1 p-6 animate-fade-up-1 space-y-5 max-w-5xl">
        {/* ── Stage progress bar ────────────────────────────────────────── */}
        {!isLost && (
          <div className="card-base p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
              Progreso del Pipeline
            </p>
            <div className="flex items-center gap-0.5 flex-wrap">
              {ALL_STAGES.filter((s) => s !== "closed_lost").map((s, i) => {
                const idx = ALL_STAGES.filter((x) => x !== "closed_lost").indexOf(s);
                const isDone = idx <= (isWon ? ALL_STAGES.length : stageIdx);
                const isCurrent = s === deal.stage;
                return (
                  <div
                    key={s}
                    className="h-2 flex-1 rounded-full transition-all"
                    style={{
                      background: isCurrent
                        ? stageColor
                        : isDone && !isWon
                        ? `${stageColor}40`
                        : isWon
                        ? "#22c55e"
                        : "var(--border)",
                      minWidth: 12,
                    }}
                    title={STAGE_LABELS[s]}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Left: Deal info + Notes + Tasks ─────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Info card */}
            <div className="card-base p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>
                Información del deal
              </p>
              <div className="grid grid-cols-2 gap-4">
                {/* Stage */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Stage</p>
                  {editingStage ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={stageValue}
                        onChange={(e) => setStageValue(e.target.value as DealStage)}
                        className="flex-1 text-sm px-2 py-1.5 rounded-lg"
                        style={{
                          background: "var(--muted)", color: "var(--foreground)",
                          border: "1px solid var(--border)", outline: "none",
                        }}
                      >
                        {ALL_STAGES.map((s) => (
                          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                        ))}
                      </select>
                      <button onClick={saveStage} disabled={saving} className="p-1 rounded hover:bg-muted" style={{ color: "#10b981" }}>
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setStageValue(deal.stage); setEditingStage(false); }} className="p-1 rounded hover:bg-muted" style={{ color: "var(--muted-foreground)" }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingStage(true)} className="flex items-center gap-2 group">
                      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {STAGE_LABELS[deal.stage]}
                      </span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--muted-foreground)" }} />
                    </button>
                  )}
                </div>

                {/* Deal value */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Valor del deal</p>
                  {editingValue ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={dealValue}
                        onChange={(e) => setDealValue(e.target.value)}
                        className="flex-1 text-sm px-2 py-1.5 rounded-lg"
                        style={{
                          background: "var(--muted)", color: "var(--foreground)",
                          border: "1px solid var(--border)", outline: "none",
                        }}
                        placeholder="0"
                      />
                      <button onClick={saveValue} disabled={saving} className="p-1 rounded hover:bg-muted" style={{ color: "#10b981" }}>
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingValue(false)} className="p-1 rounded hover:bg-muted" style={{ color: "var(--muted-foreground)" }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingValue(true)} className="flex items-center gap-2 group">
                      <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>
                        {formatCurrency(deal.deal_value, deal.currency)}
                      </span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--muted-foreground)" }} />
                    </button>
                  )}
                </div>

                {/* Contact */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <User className="w-3 h-3" /> Contacto
                  </p>
                  {contact ? (
                    <Link
                      href={`/dashboard/contacts/${contact.id}`}
                      className="text-sm font-semibold hover:underline transition-colors"
                      style={{ color: "var(--foreground)" }}
                    >
                      {contactName}
                    </Link>
                  ) : (
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                  {contact?.phone && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{contact.phone}</p>
                      <a
                        href={`https://wa.me/${sanitizePhone(contact.phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir WhatsApp"
                        className="flex items-center justify-center w-5 h-5 rounded-full transition-opacity hover:opacity-80"
                        style={{ background: "rgba(37,211,102,0.15)", color: "#25D366" }}
                      >
                        <MessageSquare className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Property */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <Building2 className="w-3 h-3" /> Propiedad
                  </p>
                  {property ? (
                    <Link
                      href={`/dashboard/properties/${property.id}`}
                      className="text-sm font-semibold hover:underline"
                      style={{ color: "var(--foreground)" }}
                    >
                      {property.title}
                    </Link>
                  ) : (
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Sin propiedad asignada</span>
                  )}
                  {property?.sector && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {property.sector}{property.city ? `, ${property.city}` : ""}
                    </p>
                  )}
                </div>

                {/* Expected close date */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <CalendarDays className="w-3 h-3" /> Cierre estimado
                  </p>
                  {editingCloseDate ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={closeDateValue}
                        onChange={(e) => setCloseDateValue(e.target.value)}
                        className="flex-1 text-sm px-2 py-1.5 rounded-lg"
                        style={{
                          background: "var(--muted)", color: "var(--foreground)",
                          border: "1px solid var(--border)", outline: "none",
                        }}
                      />
                      <button onClick={saveCloseDate} disabled={saving} className="p-1 rounded hover:bg-muted" style={{ color: "#10b981" }}>
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingCloseDate(false)} className="p-1 rounded hover:bg-muted" style={{ color: "var(--muted-foreground)" }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingCloseDate(true)} className="flex items-center gap-2 group">
                      <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {deal.expected_close_date
                          ? format(parseISO(deal.expected_close_date), "d MMM yyyy", { locale: es })
                          : "—"}
                      </span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--muted-foreground)" }} />
                    </button>
                  )}
                </div>

                {/* Commission */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <TrendingUp className="w-3 h-3" /> Comisión estimada
                  </p>
                  <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    {deal.commission_value
                      ? formatCurrency(deal.commission_value, deal.currency)
                      : deal.commission_percentage
                      ? `${deal.commission_percentage}%`
                      : "—"}
                  </span>
                </div>

                {/* Agent */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Agente</p>
                  <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    {agent?.full_name ?? "—"}
                  </span>
                </div>

                {/* Created */}
                <div>
                  <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <Clock className="w-3 h-3" /> Creado
                  </p>
                  <span className="text-sm" style={{ color: "var(--foreground)" }}>
                    {format(parseISO(deal.created_at), "d MMM yyyy", { locale: es })}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="card-base p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                  Notas internas
                </p>
                {!editingNotes && (
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-muted"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-3">
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    rows={5}
                    placeholder="Agrega notas internas sobre este deal…"
                    className="w-full text-sm px-3 py-2.5 rounded-lg resize-none"
                    style={{
                      background: "var(--muted)", color: "var(--foreground)",
                      border: "1px solid var(--border)", outline: "none",
                      fontFamily: "var(--font-body), system-ui",
                    }}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setNotesValue(deal.notes ?? ""); setEditingNotes(false); }}
                      className="px-3 py-1.5 text-xs rounded-lg"
                      style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveNotes}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg"
                      style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                    >
                      {saving ? "Guardando…" : "Guardar notas"}
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: deal.notes ? "var(--foreground)" : "var(--muted-foreground)" }}
                >
                  {deal.notes ?? "Sin notas. Haz clic en Editar para agregar."}
                </p>
              )}
            </div>

            {/* ── Tasks panel ───────────────────────────────────────────── */}
            <div className="card-base p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                  Tareas
                  {pendingTasks.length > 0 && (
                    <span
                      className="ml-2 px-1.5 py-0.5 rounded-full text-[9px]"
                      style={{ background: "rgba(201,150,58,0.15)", color: "#C9963A" }}
                    >
                      {pendingTasks.length}
                    </span>
                  )}
                </p>
                <button
                  onClick={() => setAddingTask((v) => !v)}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-muted"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <Plus className="w-3 h-3" /> Nueva tarea
                </button>
              </div>

              {/* Add task form */}
              {addingTask && (
                <div className="mb-4 p-3 rounded-lg space-y-2" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                  <input
                    autoFocus
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setAddingTask(false); }}
                    placeholder="Título de la tarea…"
                    className="w-full text-sm px-2.5 py-1.5 rounded-lg"
                    style={{
                      background: "var(--background)", color: "var(--foreground)",
                      border: "1px solid var(--border)", outline: "none",
                    }}
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newTaskDue}
                      onChange={(e) => setNewTaskDue(e.target.value)}
                      className="flex-1 text-xs px-2 py-1.5 rounded-lg"
                      style={{
                        background: "var(--background)", color: "var(--foreground)",
                        border: "1px solid var(--border)", outline: "none",
                      }}
                    />
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as "high" | "medium" | "low")}
                      className="text-xs px-2 py-1.5 rounded-lg"
                      style={{
                        background: "var(--background)", color: "var(--foreground)",
                        border: "1px solid var(--border)", outline: "none",
                      }}
                    >
                      <option value="high">Alta</option>
                      <option value="medium">Media</option>
                      <option value="low">Baja</option>
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setAddingTask(false)}
                      className="px-3 py-1.5 text-xs rounded-lg"
                      style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={addTask}
                      disabled={savingTask || !newTaskTitle.trim()}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg"
                      style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                    >
                      {savingTask ? "Guardando…" : "Crear tarea"}
                    </button>
                  </div>
                </div>
              )}

              {/* Task list */}
              {tasks.length === 0 && !addingTask ? (
                <p className="text-xs py-4 text-center" style={{ color: "var(--muted-foreground)" }}>
                  Sin tareas. Haz clic en Nueva tarea para agregar.
                </p>
              ) : (
                <div className="space-y-1">
                  {[...pendingTasks, ...doneTasks].map((task) => {
                    const isDone = task.status === "completed";
                    const priorityColor = PRIORITY_COLORS[task.priority ?? "medium"] ?? "#64748b";
                    return (
                      <div
                        key={task.id}
                        className="flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors hover:bg-muted/50"
                      >
                        <button
                          onClick={() => toggleTask(task)}
                          className="mt-0.5 shrink-0 transition-colors"
                          style={{ color: isDone ? "#10b981" : "var(--muted-foreground)" }}
                        >
                          {isDone ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm leading-snug"
                            style={{
                              color: isDone ? "var(--muted-foreground)" : "var(--foreground)",
                              textDecoration: isDone ? "line-through" : "none",
                            }}
                          >
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className="text-[9px] font-bold uppercase"
                              style={{ color: priorityColor }}
                            >
                              {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Media" : "Baja"}
                            </span>
                            {task.due_date && (
                              <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                                · {format(parseISO(task.due_date), "d MMM", { locale: es })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Stage history timeline ─────────────────────────── */}
          <div className="card-base p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>
              Historial de stages
            </p>

            {history.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: "var(--muted-foreground)" }}>
                Sin movimientos registrados
              </p>
            ) : (
              <div className="space-y-0">
                {history.map((entry, i) => {
                  const color = STAGE_COLORS[entry.to_stage] ?? "#C9963A";
                  return (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                          style={{ background: color }}
                        />
                        {i < history.length - 1 && (
                          <div className="w-px flex-1 my-1" style={{ background: "var(--border)", minHeight: 20 }} />
                        )}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                          {STAGE_LABELS[entry.to_stage]}
                        </p>
                        {entry.from_stage && (
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                            desde {STAGE_LABELS[entry.from_stage]}
                          </p>
                        )}
                        <p className="text-[10px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                          {entry.agent?.full_name ?? (entry.changed_by_system ? "Sistema" : "—")}
                          {" · "}
                          {formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true, locale: es })}
                        </p>
                        {entry.notes && (
                          <p className="text-[10px] mt-1 italic" style={{ color: "var(--muted-foreground)" }}>
                            {entry.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
