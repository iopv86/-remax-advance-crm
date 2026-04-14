"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DealSheet } from "@/components/deal-sheet";
import { STAGE_LABELS } from "@/lib/types";
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

// Simplified display names for Stitch-style headers
const STAGE_SHORT: Record<DealStage, string> = {
  lead_captured: "NUEVO LEAD",
  qualified: "CALIFICADO",
  contacted: "CONTACTADO",
  showing_scheduled: "VISITA AGEND.",
  showing_done: "VISITA HECHA",
  offer_made: "OFERTA",
  negotiation: "NEGOCIACIÓN",
  contract: "CONTRATO",
  closed_won: "CERRADO ✓",
  closed_lost: "PERDIDO",
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
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Sin nombre";
  const contactInitials =
    [contact?.first_name?.[0], contact?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?";

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        boxShadow: "0 1px 3px rgba(28,25,23,0.08)",
        cursor: dragging || isDragging ? "grabbing" : "grab",
        opacity: dragging || isDragging ? 0.5 : 1,
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      className="group hover:border-rose-300 hover:shadow-md"
    >
      {/* Drag handle + info */}
      <div {...listeners} {...attributes} className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center text-xs font-bold"
            style={{ background: "#fee2e2", color: "#dc2626" }}
          >
            {contactInitials}
          </div>
        </div>
        <GripVertical className="w-4 h-4 shrink-0 text-stone-300 group-hover:text-stone-400" />
      </div>

      {/* Contact name */}
      {contactId ? (
        <Link
          href={`/dashboard/contacts/${contactId}`}
          onClick={(e) => e.stopPropagation()}
          className="block text-sm font-semibold text-stone-900 leading-tight mb-1 hover:text-rose-600 transition-colors"
        >
          {contactName}
        </Link>
      ) : (
        <p className="text-sm font-semibold text-stone-900 leading-tight mb-1">{contactName}</p>
      )}

      {/* Deal value */}
      {deal.deal_value != null && (
        <div
          className="flex justify-between items-end pt-3 mt-2"
          style={{ borderTop: "1px solid #f5f5f4" }}
        >
          <span
            className="font-bold text-sm"
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              color: "#1C1917",
            }}
          >
            {deal.currency ?? "RD$"} {deal.deal_value.toLocaleString()}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => onEdit(deal, e)}
              title="Editar"
              className="p-1 rounded hover:bg-stone-100 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => onDelete(deal, e)}
              title="Eliminar"
              disabled={deletingId === deal.id}
              className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
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
      className="flex flex-col gap-3 p-2 rounded-b-lg transition-colors min-h-[80px]"
      style={isOver ? { background: "rgba(225,29,72,0.04)", outline: "2px dashed rgba(225,29,72,0.3)" } : {}}
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

    setDeals((prev) =>
      prev.map((d) => (d.id === draggedDeal.id ? { ...d, stage: newStage } : d))
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("deals")
      .update({ stage: newStage })
      .eq("id", draggedDeal.id);

    if (error) {
      toast.error("Error al mover: " + error.message);
      setDeals((prev) =>
        prev.map((d) => (d.id === draggedDeal.id ? { ...d, stage: draggedDeal.stage } : d))
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

  const grouped = STAGE_ORDER.reduce(
    (acc, stage) => {
      acc[stage] = deals.filter((d) => d.stage === stage);
      return acc;
    },
    {} as Record<DealStage, Deal[]>
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
      >
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-5 min-w-max items-start">
            {STAGE_ORDER.map((stage) => {
              const stageDeals = grouped[stage];
              const stageValue = stageDeals.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);

              return (
                <div
                  key={stage}
                  style={{ minWidth: 280, width: 280 }}
                  className="flex flex-col gap-3"
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-xs text-stone-500 tracking-wider uppercase">
                        {STAGE_SHORT[stage]}
                      </h3>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: "#e5e7eb", color: "#6b7280" }}
                      >
                        {stageDeals.length}
                      </span>
                    </div>
                    {stageValue > 0 && (
                      <span className="text-[11px] font-bold text-stone-400">
                        RD$ {(stageValue / 1_000_000).toFixed(1)}M
                      </span>
                    )}
                  </div>

                  <DroppableColumn stage={stage} isOver={overStage === stage}>
                    {stageDeals.length === 0 && (
                      <div
                        className="flex items-center justify-center py-6 rounded-lg"
                        style={{
                          border: "2px dashed #e5e7eb",
                          color: "#94a3b8",
                          fontSize: 12,
                        }}
                      >
                        {overStage === stage ? "Soltar aquí" : "Vacío"}
                      </div>
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
          {activeDeal && (() => {
            const contact = activeDeal.contact as { first_name?: string; last_name?: string } | null;
            const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Sin nombre";
            return (
              <div
                className="opacity-95 shadow-xl rotate-1 cursor-grabbing"
                style={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 12,
                  width: 280,
                }}
              >
                <p className="text-sm font-semibold text-stone-900">{name}</p>
                {activeDeal.deal_value != null && (
                  <p className="text-sm font-bold mt-1" style={{ color: "#1C1917" }}>
                    {activeDeal.currency ?? "RD$"} {activeDeal.deal_value.toLocaleString()}
                  </p>
                )}
              </div>
            );
          })()}
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
