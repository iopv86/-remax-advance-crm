"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { DealSheet } from "@/components/deal-sheet";
import { AgentFilter, type AgentFilterOption } from "@/components/agent-filter";
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Props {
  deals: Deal[];
  agents?: AgentFilterOption[];
  canFilterByAgent?: boolean;
}

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGE_ORDER: DealStage[] = [
  "lead_captured",
  "qualified",
  "contacted",
  "showing_scheduled",
  "showing_done",
  "offer_made",
  "negotiation",
  "promesa_de_venta",
  "financiamiento",
  "contract",
  "due_diligence",
  "closed_won",
  "closed_lost",
];

const STAGE_SHORT: Record<DealStage, string> = {
  lead_captured: "NUEVO LEAD",
  qualified: "CALIFICADO",
  contacted: "CONTACTADO",
  showing_scheduled: "VISITA AGEND.",
  showing_done: "VISITA HECHA",
  offer_made: "OFERTA",
  negotiation: "NEGOCIACIÓN",
  promesa_de_venta: "PROMESA",
  financiamiento: "FINANCIAMIENTO",
  contract: "CONTRATO",
  due_diligence: "DUE DILIGENCE",
  closed_won: "CERRADO GANADO",
  closed_lost: "PERDIDO",
};

// Dot color per stage
const STAGE_DOT: Record<DealStage, string> = {
  lead_captured: "#3b82f6",
  qualified: "#f59e0b",
  contacted: "#8b5cf6",
  showing_scheduled: "#6366f1",
  showing_done: "#0ea5e9",
  offer_made: "#ec4899",
  negotiation: "#f97316",
  promesa_de_venta: "#14b8a6",
  financiamiento: "#84cc16",
  contract: "#a78bfa",
  due_diligence: "#fb923c",
  closed_won: "#10b981",
  closed_lost: "#6b7280",
};

// ── Deal card ─────────────────────────────────────────────────────────────────

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
  const contactName =
    [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Sin nombre";
  const contactInitials =
    [contact?.first_name?.[0], contact?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?";

  const isWon = deal.stage === "closed_won";

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: "var(--glass-bg)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(201,150,58,0.15)",
        borderRadius: "0.25rem",
        padding: "20px",
        cursor: dragging || isDragging ? "grabbing" : "grab",
        opacity: dragging || isDragging ? 0.5 : 1,
        transition: "border-color 0.2s, box-shadow 0.2s",
        position: "relative",
      }}
      className={`group ${isWon ? "opacity-70 grayscale hover:grayscale-0 hover:opacity-100" : ""}`}
      onMouseEnter={(e) => {
        if (!dragging && !isDragging) {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = "rgba(201,150,58,0.4)";
          el.style.boxShadow = "inset 0 0 10px rgba(245,189,93,0.05)";
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "rgba(201,150,58,0.15)";
        el.style.boxShadow = "none";
      }}
    >
      {/* Drag handle area */}
      <div {...listeners} {...attributes} className="absolute inset-0 rounded" style={{ cursor: "grab" }} />

      {/* Card content (above drag layer) */}
      <div className="relative" style={{ pointerEvents: "none" }}>
        {/* Header row: classification badge + age */}
        <div className="flex justify-between items-start mb-4">
          <span
            style={{
              background: "rgba(59,130,246,0.1)",
              color: "#93c5fd",
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "0.125rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: "Inter, sans-serif",
            }}
          >
            {contact?.lead_classification ?? "Lead"}
          </span>
          {isWon && (
            <span
              style={{
                fontSize: "10px",
                color: "#34d399",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              ✓ Ganado
            </span>
          )}
        </div>

        {/* Property / deal name — contact name as headline */}
        <h4
          style={{
            color: "#e3e1ea",
            fontFamily: "Manrope, var(--font-manrope), sans-serif",
            fontWeight: 700,
            fontSize: "15px",
            marginBottom: 2,
            lineHeight: 1.3,
          }}
        >
          {contactName}
        </h4>

        {/* Notes snippet if available */}
        {deal.notes && (
          <p
            style={{
              color: "#9899A8",
              fontSize: "12px",
              marginBottom: 16,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {deal.notes}
          </p>
        )}

        {/* Bottom row: avatar / initials + value */}
        <div className="flex justify-between items-center" style={{ marginTop: deal.notes ? 0 : 16 }}>
          {/* Avatar initials */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#292a30",
              border: "1px solid rgba(245,189,93,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: "#f5bd5d",
            }}
          >
            {contactInitials}
          </div>

          {/* Value */}
          {deal.deal_value != null && (
            <span
              style={{
                fontFamily: "Manrope, var(--font-manrope), sans-serif",
                fontWeight: 700,
                fontSize: "14px",
                color: isWon ? "#34d399" : "#f5bd5d",
              }}
            >
              {deal.currency ?? "RD$"} {deal.deal_value.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Edit / delete actions — separate row below content, no overlap */}
      <div
        className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ pointerEvents: "auto", marginTop: 10, justifyContent: "flex-end" }}
      >
        <Link
          href={`/dashboard/pipeline/${deal.id}`}
          onClick={(e) => e.stopPropagation()}
          title="Ver detalle"
          style={{
            padding: "3px 6px",
            borderRadius: "0.125rem",
            background: "var(--glass-bg-md)",
            border: "1px solid rgba(201,150,58,0.2)",
            color: "#9899A8",
            fontSize: 11,
            cursor: "pointer",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Ver
        </Link>
        <button
          onClick={(e) => onEdit(deal, e)}
          title="Editar"
          style={{
            padding: "3px 6px",
            borderRadius: "0.125rem",
            background: "var(--glass-bg-md)",
            border: "1px solid rgba(201,150,58,0.2)",
            color: "#9899A8",
            fontSize: 11,
            cursor: "pointer",
            transition: "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#f5bd5d";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,189,93,0.5)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#9899A8";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,150,58,0.2)";
          }}
        >
          Editar
        </button>
        <button
          onClick={(e) => onDelete(deal, e)}
          title="Eliminar"
          disabled={deletingId === deal.id}
          style={{
            padding: "3px 6px",
            borderRadius: "0.125rem",
            background: "var(--glass-bg-md)",
            border: "1px solid rgba(201,150,58,0.2)",
            color: "#9899A8",
            fontSize: 11,
            cursor: "pointer",
            opacity: deletingId === deal.id ? 0.4 : 1,
            transition: "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (deletingId !== deal.id) {
              (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.4)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#9899A8";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,150,58,0.2)";
          }}
        >
          {deletingId === deal.id ? "..." : "Borrar"}
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
      className="flex flex-col gap-4 transition-all min-h-[80px]"
      style={
        isOver
          ? {
              outline: "2px dashed rgba(245,189,93,0.4)",
              borderRadius: "0.25rem",
              background: "rgba(245,189,93,0.03)",
            }
          : {}
      }
    >
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PipelineClient({
  deals: initial,
  agents = [],
  canFilterByAgent = false,
}: Props) {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(initial);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  useEffect(() => {
    setDeals(initial);
  }, [initial]);

  const visibleDeals = useMemo(
    () =>
      selectedAgentId
        ? deals.filter((d) => d.agent_id === selectedAgentId)
        : deals,
    [deals, selectedAgentId]
  );

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
    const name =
      [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "este deal";
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
      acc[stage] = visibleDeals.filter((d) => d.stage === stage);
      return acc;
    },
    {} as Record<DealStage, Deal[]>
  );

  return (
    <>
      <style>{`
        .kanban-scroll::-webkit-scrollbar { height: 4px; }
        .kanban-scroll::-webkit-scrollbar-track { background: #0d0e14; }
        .kanban-scroll::-webkit-scrollbar-thumb { background: #34343b; border-radius: 10px; }
      `}</style>

      {canFilterByAgent && agents.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <AgentFilter
            agents={agents}
            value={selectedAgentId}
            onChange={setSelectedAgentId}
            label="Filtrar por agente"
          />
          {selectedAgentId && (
            <span
              style={{
                fontSize: 12,
                color: "#9A9088",
                fontFamily: "Inter, sans-serif",
              }}
            >
              Mostrando {visibleDeals.length} de {deals.length} oportunidades
            </span>
          )}
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
      >
        {/* Kanban scroll container */}
        <div
          className="kanban-scroll"
          style={{
            overflowX: "auto",
            paddingBottom: 24,
            scrollBehavior: "smooth",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 24,
              minWidth: "max-content",
              alignItems: "flex-start",
            }}
          >
            {STAGE_ORDER.map((stage) => {
              const stageDeals = grouped[stage];
              const stageValue = stageDeals.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);
              const dotColor = STAGE_DOT[stage];

              return (
                <div
                  key={stage}
                  style={{ minWidth: 320, width: 320, display: "flex", flexDirection: "column", gap: 0 }}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between"
                    style={{ marginBottom: 16, paddingLeft: 4, paddingRight: 4 }}
                  >
                    <div className="flex items-center gap-2">
                      {/* Stage dot */}
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: dotColor,
                          flexShrink: 0,
                        }}
                      />
                      <h3
                        style={{
                          fontFamily: "Manrope, var(--font-manrope), sans-serif",
                          fontWeight: 700,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          color: "#e3e1ea",
                        }}
                      >
                        {STAGE_SHORT[stage]}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {stageValue > 0 && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#9899A8",
                            fontFamily: "Manrope, var(--font-manrope), sans-serif",
                          }}
                        >
                          RD$ {(stageValue / 1_000_000).toFixed(1)}M
                        </span>
                      )}
                      <span
                        style={{
                          background: "#292a30",
                          color: "#9899A8",
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: "999px",
                          fontWeight: 700,
                        }}
                      >
                        {stageDeals.length}
                      </span>
                    </div>
                  </div>

                  {/* Droppable cards area */}
                  <DroppableColumn stage={stage} isOver={overStage === stage}>
                    {stageDeals.length === 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: 80,
                          border: "2px dashed rgba(201,150,58,0.12)",
                          borderRadius: "0.25rem",
                          color: "#9899A8",
                          fontSize: 12,
                          fontFamily: "Inter, sans-serif",
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
          {activeDeal &&
            (() => {
              const contact = activeDeal.contact as {
                first_name?: string;
                last_name?: string;
              } | null;
              const name =
                [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") ||
                "Sin nombre";
              const initials =
                [contact?.first_name?.[0], contact?.last_name?.[0]]
                  .filter(Boolean)
                  .join("")
                  .toUpperCase() || "?";

              return (
                <div
                  style={{
                    background: "rgba(18,19,25,0.95)",
                    border: "1px solid rgba(201,150,58,0.5)",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5), inset 0 0 20px rgba(245,189,93,0.08)",
                    borderRadius: "0.25rem",
                    padding: 20,
                    width: 320,
                    cursor: "grabbing",
                    transform: "rotate(1deg)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#292a30",
                        border: "1px solid rgba(245,189,93,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#f5bd5d",
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>
                    <div>
                      <p
                        style={{
                          fontFamily: "Manrope, sans-serif",
                          fontWeight: 700,
                          fontSize: 14,
                          color: "#e3e1ea",
                        }}
                      >
                        {name}
                      </p>
                      {activeDeal.deal_value != null && (
                        <p
                          style={{
                            fontFamily: "Manrope, sans-serif",
                            fontWeight: 700,
                            fontSize: 13,
                            color: "#f5bd5d",
                            marginTop: 2,
                          }}
                        >
                          {activeDeal.currency ?? "RD$"}{" "}
                          {activeDeal.deal_value.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
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
