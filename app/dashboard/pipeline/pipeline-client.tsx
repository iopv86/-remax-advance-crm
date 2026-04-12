"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DealSheet } from "@/components/deal-sheet";
import { STAGE_LABELS, CLASSIFICATION_LABELS } from "@/lib/types";
import type { Deal, DealStage } from "@/lib/types";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Props {
  deals: Deal[];
}

const STAGE_ORDER: DealStage[] = [
  "lead_captured",
  "qualified",
  "contacted",
  "showing_scheduled",
  "showing_done",
  "offer_made",
  "negotiation",
  "contract",
  "closed_won",
  "closed_lost",
];

const STAGE_ACCENT: Record<DealStage, string> = {
  lead_captured: "#94a3b8",
  qualified: "#2563eb",
  contacted: "#2563eb",
  showing_scheduled: "#d97706",
  showing_done: "#d97706",
  offer_made: "#e11d48",
  negotiation: "#e11d48",
  contract: "#7c3aed",
  closed_won: "#10b981",
  closed_lost: "#94a3b8",
};

// ── Draggable deal card ───────────────────────────────────────────────────────

interface DealCardProps {
  deal: Deal;
  onEdit: (deal: Deal, e: React.MouseEvent) => void;
  onDelete: (deal: Deal, e: React.MouseEvent) => void;
  deletingId: string | null;
  isDragging?: boolean;
}

function DealCard({ deal, onEdit, onDelete, deletingId, isDragging = false }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: dragging } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const contact = deal.contact as {
    first_name?: string;
    last_name?: string;
    lead_classification?: string;
    phone?: string;
  } | null;
  const contactId = typeof deal.contact_id === "string" ? deal.contact_id : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card-base p-3 space-y-2 transition-colors group ${
        dragging || isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab hover:border-[var(--red)]/30"
      }`}
    >
      {/* Drag handle area */}
      <div
        {...listeners}
        {...attributes}
        className="flex items-start justify-between gap-1"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center font-sans font-bold text-[10px] shrink-0"
            style={{ background: "var(--red-muted)", color: "var(--red)" }}
          >
            {(contact?.first_name?.[0] ?? "?").toUpperCase()}
          </div>
          <p className="font-sans text-xs font-medium text-foreground truncate leading-tight">
            {contact?.first_name} {contact?.last_name}
          </p>
        </div>
        {contact?.lead_classification && (
          <span
            className={
              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border shrink-0 " +
              (contact.lead_classification === "hot" ? "badge-hot" :
              contact.lead_classification === "warm" ? "badge-warm" :
              contact.lead_classification === "cold" ? "badge-cold" : "badge-unqualified")
            }
          >
            {CLASSIFICATION_LABELS[contact.lead_classification as keyof typeof CLASSIFICATION_LABELS]}
          </span>
        )}
      </div>

      {deal.deal_value != null && (
        <p className="font-mono text-xs font-semibold" style={{ color: "oklch(0.5 0.16 145)" }}>
          ${deal.deal_value.toLocaleString()} {deal.currency ?? "USD"}
        </p>
      )}

      {contactId && (
        <Link
          href={`/dashboard/contacts/${contactId}`}
          onClick={(e) => e.stopPropagation()}
          className="block font-sans text-[10px] text-rose-500 hover:text-rose-700 transition-colors"
        >
          Ver contacto →
        </Link>
      )}

      {contact?.phone && (
        <p className="font-sans text-[10px] text-muted-foreground">{contact.phone}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
        <button
          onClick={(e) => onEdit(deal, e)}
          title="Editar"
          className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => onDelete(deal, e)}
          title="Eliminar"
          disabled={deletingId === deal.id}
          className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Droppable column ──────────────────────────────────────────────────────────

function DroppableColumn({
  stage,
  children,
  isOver,
}: {
  stage: DealStage;
  children: React.ReactNode;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`kanban-col p-2 space-y-2 transition-colors ${
        isOver ? "ring-2 ring-inset ring-rose-300 bg-rose-50/30" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PipelineClient({ deals: initial }: Props) {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(initial);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);

  // Sync with server data when it changes
  useEffect(() => {
    setDeals(initial);
  }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (!sheetOpen) return;
    const supabase = createClient();
    supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setContacts(data as ContactOption[]);
      });
  }, [sheetOpen]);

  function openEdit(deal: Deal, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setEditDeal(deal);
    setSheetOpen(true);
  }

  async function handleDelete(deal: Deal, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const contact = deal.contact as { first_name?: string; last_name?: string } | null;
    const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "este deal";
    if (!confirm(`¿Eliminar oportunidad de ${name}? Esta acción no se puede deshacer.`)) return;
    setDeletingId(deal.id);
    const supabase = createClient();
    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    setDeletingId(null);
    if (error) {
      toast.error("Error al eliminar: " + error.message);
      return;
    }
    toast.success("Oportunidad eliminada");
    router.refresh();
  }

  function handleSaved() {
    setSheetOpen(false);
    setEditDeal(null);
    router.refresh();
  }

  function handleDragStart(event: DragStartEvent) {
    const deal = deals.find((d) => d.id === event.active.id);
    setActiveDeal(deal ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null);
    setOverStage(null);

    const { active, over } = event;
    if (!over) return;

    const draggedDeal = deals.find((d) => d.id === active.id);
    const newStage = over.id as DealStage;

    if (!draggedDeal || draggedDeal.stage === newStage) return;

    // Optimistic update
    setDeals((prev) =>
      prev.map((d) => d.id === draggedDeal.id ? { ...d, stage: newStage } : d)
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ stage: newStage })
      .eq("id", draggedDeal.id);

    if (error) {
      toast.error("Error al mover: " + error.message);
      // Revert on failure
      setDeals((prev) =>
        prev.map((d) => d.id === draggedDeal.id ? { ...d, stage: draggedDeal.stage } : d)
      );
    } else {
      toast.success(`Movido a ${STAGE_LABELS[newStage]}`);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id?.toString();
    if (overId && STAGE_ORDER.includes(overId as DealStage)) {
      setOverStage(overId as DealStage);
    } else {
      setOverStage(null);
    }
  }

  const grouped = STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = deals.filter((d) => d.stage === stage);
    return acc;
  }, {} as Record<DealStage, Deal[]>);

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
      >
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {STAGE_ORDER.map((stage) => {
              const stageDeals = grouped[stage];
              const stageValue = stageDeals.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);
              const accent = STAGE_ACCENT[stage];
              return (
                <div key={stage} className="w-60 shrink-0">
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between px-3 py-2 mb-2 rounded-t-lg"
                    style={{ background: `${accent}12`, borderBottom: `2px solid ${accent}30` }}
                  >
                    <h3 className="font-sans text-xs font-semibold text-foreground truncate">
                      {STAGE_LABELS[stage]}
                    </h3>
                    <span
                      className="font-mono text-xs font-bold ml-2 shrink-0 px-1.5 py-0.5 rounded"
                      style={{ background: `${accent}20`, color: accent }}
                    >
                      {stageDeals.length}
                    </span>
                  </div>
                  {stageValue > 0 && (
                    <p
                      className="font-mono text-xs px-3 mb-2 flex items-center gap-1"
                      style={{ color: accent }}
                    >
                      <DollarSign className="w-3 h-3" />
                      {stageValue.toLocaleString()}
                    </p>
                  )}
                  <DroppableColumn stage={stage} isOver={overStage === stage}>
                    {stageDeals.length === 0 && (
                      <p className="font-sans text-xs text-muted-foreground text-center py-6">
                        {overStage === stage ? "Soltar aquí" : "Vacío"}
                      </p>
                    )}
                    {stageDeals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        deletingId={deletingId}
                      />
                    ))}
                  </DroppableColumn>
                </div>
              );
            })}
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeDeal && (
            <div className="card-base p-3 space-y-2 opacity-95 shadow-xl rotate-1 cursor-grabbing w-60">
              {(() => {
                const contact = activeDeal.contact as { first_name?: string; last_name?: string } | null;
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center font-sans font-bold text-[10px] shrink-0"
                        style={{ background: "var(--red-muted)", color: "var(--red)" }}
                      >
                        {(contact?.first_name?.[0] ?? "?").toUpperCase()}
                      </div>
                      <p className="font-sans text-xs font-medium text-foreground truncate">
                        {contact?.first_name} {contact?.last_name}
                      </p>
                    </div>
                    {activeDeal.deal_value != null && (
                      <p className="font-mono text-xs font-semibold" style={{ color: "oklch(0.5 0.16 145)" }}>
                        ${activeDeal.deal_value.toLocaleString()} {activeDeal.currency ?? "USD"}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <DealSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        deal={editDeal}
        contacts={contacts}
        onSaved={handleSaved}
      />
    </>
  );
}
