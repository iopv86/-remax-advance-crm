"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AgentFilter, type AgentFilterOption } from "@/components/agent-filter";
import { STAGE_LABELS } from "@/lib/types";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import type { Deal, DealStage, LeadClassification } from "@/lib/types";
import { ClassificationQuickEdit } from "@/app/dashboard/contacts/[id]/classification-quick-edit";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
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

interface Props {
  deals: Deal[];
  agents?: AgentFilterOption[];
  canFilterByAgent?: boolean;
}

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGE_ORDER: DealStage[] = [
  "nuevo_sin_contactar",
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

const COLUMN_WIDTH = 320;
const COLUMN_GAP = 24;
const SCROLL_STEP = COLUMN_WIDTH + COLUMN_GAP;
const MIN_THUMB_PX = 40;
/** scrollLeft never lands exactly on the max under fractional device pixel ratios. */
const SCROLL_EDGE_TOLERANCE = 1;

const STAGE_SHORT: Record<DealStage, string> = {
  nuevo_sin_contactar: "SIN CONTACTAR",
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
  nuevo_sin_contactar: "#94a3b8",
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
  onDelete: (deal: Deal, e: React.MouseEvent) => void;
  deletingId: string | null;
  isDragging?: boolean;
}

function DealCard({ deal, onDelete, deletingId, isDragging = false }: DealCardProps) {
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
      /* Opts this subtree out of the board's drag-to-scroll, so dragging a card
         moves the card and never pans the board. */
      data-no-drag-scroll=""
      style={{
        ...style,
        padding: "20px",
        cursor: dragging || isDragging ? "grabbing" : "grab",
        opacity: dragging || isDragging ? 0.5 : 1,
        position: "relative",
      }}
      className={`card-interactive group ${isWon ? "opacity-70 grayscale hover:grayscale-0 hover:opacity-100" : ""}`}
    >
      {/* Drag handle area */}
      <div {...listeners} {...attributes} className="absolute inset-0 rounded" style={{ cursor: "grab" }} />

      {/* Interactive header layer — quick-edit temperature + Ganado.
          Sibling of the drag overlay with pointerEvents:auto + zIndex (same escape
          pattern as the Ver/Editar/Borrar row), so clicks here never reach the drag
          listeners and the badge becomes editable without breaking column drag. */}
      <div
        className={`flex justify-between items-start${contactId ? "" : " mb-4"}`}
        style={{ position: "relative", zIndex: 3, pointerEvents: "auto" }}
      >
        {contactId ? (
          <ClassificationQuickEdit
            contactId={contactId}
            classification={contact?.lead_classification as LeadClassification | undefined}
          />
        ) : (
          <span
            style={{
              background: "rgba(59,130,246,0.1)",
              color: "#93c5fd",
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "8px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: "var(--font-sans)",
            }}
          >
            {contact?.lead_classification ?? "Lead"}
          </span>
        )}
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
            <Check size={10} strokeWidth={3} /> Ganado
          </span>
        )}
      </div>

      {/* Card content (above drag layer) */}
      <div className="relative" style={{ pointerEvents: "none" }}>
        {/* Property / deal name — contact name as headline */}
        <h4
          className="surface-heading"
          style={{ marginBottom: 2, lineHeight: 1.3 }}
        >
          {contactName}
        </h4>

        {/* Notes snippet if available */}
        {deal.notes && (
          <p
            style={{
              color: "var(--muted-foreground)",
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
              background: "var(--secondary)",
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
              className="num"
              style={{
                fontWeight: 700,
                fontSize: "14px",
                color: isWon ? "#34d399" : "#f5bd5d",
              }}
            >
              {formatCurrency(deal.deal_value, deal.currency ?? "USD")}
            </span>
          )}
        </div>
      </div>

      {/* Edit / delete actions — separate row below content, no overlap.
          Resting state is visible (muted affordance), not a hover-ghost;
          hover lift is declarative CSS (.pipe-action / .pipe-action-danger
          defined in the scoped <style> block below), not JS DOM mutation. */}
      <div
        className="flex gap-1"
        style={{ pointerEvents: "auto", marginTop: 10, justifyContent: "flex-end", position: "relative", zIndex: 2 }}
      >
        <Link
          href={`/dashboard/pipeline/${deal.id}`}
          onClick={(e) => e.stopPropagation()}
          title="Ver detalle"
          className="pipe-action"
          style={{
            padding: "3px 6px",
            borderRadius: "8px",
            background: "var(--glass-bg-md)",
            border: "1px solid rgba(201,150,58,0.2)",
            color: "var(--muted-foreground)",
            fontSize: 11,
            cursor: "pointer",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Ver
        </Link>
        <Link
          href={`/dashboard/pipeline/${deal.id}/edit`}
          onClick={(e) => e.stopPropagation()}
          title="Editar"
          className="pipe-action"
          style={{
            padding: "3px 6px",
            borderRadius: "8px",
            background: "var(--glass-bg-md)",
            border: "1px solid rgba(201,150,58,0.2)",
            color: "var(--muted-foreground)",
            fontSize: 11,
            cursor: "pointer",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Editar
        </Link>
        <button
          onClick={(e) => onDelete(deal, e)}
          title="Eliminar"
          disabled={deletingId === deal.id}
          className="pipe-action-danger"
          style={{
            padding: "3px 6px",
            borderRadius: "8px",
            background: "var(--glass-bg-md)",
            border: "1px solid rgba(201,150,58,0.2)",
            color: "var(--muted-foreground)",
            fontSize: 11,
            cursor: "pointer",
            opacity: deletingId === deal.id ? 0.4 : 1,
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
              outline: "2px dashed rgba(201,150,58,0.4)",
              borderRadius: "16px",
              background: "rgba(201,150,58,0.03)",
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  // ── Horizontal scroll rail ──────────────────────────────────────────────────
  // The board is 14 columns (~4,800px) inside a ~1,660px viewport. The native
  // scrollbar lives at the bottom of the scroll container, which is as tall as
  // the longest column, so it sits far below the fold. We hide it and drive a
  // sticky rail instead.
  //
  // Thumb geometry is written imperatively: every DealCard calls useDraggable,
  // so a setState per scroll frame would re-render the whole board. Only the
  // booleans below live in state, and only flip at the extremes.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startScrollLeft: number; pointerId: number } | null>(
    null
  );

  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  // Starts false so the server and the hydration pass both render no rail —
  // identical markup, no mismatch. The first measurement flips it on, already
  // sized, so the thumb never paints at the wrong width.
  const [canScroll, setCanScroll] = useState(false);

  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const max = el.scrollWidth - el.clientWidth;

    // The board booleans are computed first and unconditionally: the rail is
    // only mounted once canScroll flips true, so gating this on the track/thumb
    // refs would deadlock — they can't exist until canScroll is already true.
    const nextAtStart = el.scrollLeft <= SCROLL_EDGE_TOLERANCE;
    const nextAtEnd = el.scrollLeft >= max - SCROLL_EDGE_TOLERANCE;
    const nextCanScroll = max > SCROLL_EDGE_TOLERANCE;
    setAtStart((prev) => (prev === nextAtStart ? prev : nextAtStart));
    setAtEnd((prev) => (prev === nextAtEnd ? prev : nextAtEnd));
    setCanScroll((prev) => (prev === nextCanScroll ? prev : nextCanScroll));

    // Thumb geometry, written imperatively — a setState per scroll frame would
    // re-render all 14 columns and every useDraggable card.
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb || max <= 0 || el.scrollWidth <= 0) return;

    const trackWidth = track.clientWidth;
    const thumbWidth = Math.max(
      MIN_THUMB_PX,
      (el.clientWidth / el.scrollWidth) * trackWidth
    );
    const offset = (el.scrollLeft / max) * (trackWidth - thumbWidth);

    thumb.style.width = `${thumbWidth}px`;
    thumb.style.transform = `translateX(${offset}px)`;
  }, []);

  const scheduleSync = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      sync();
    });
  }, [sync]);

  // useEffect, not useLayoutEffect: this component is server-rendered, and
  // useLayoutEffect warns ("does nothing on the server") there. Nothing here
  // runs during render, so server and client markup stay identical.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    sync();
    el.addEventListener("scroll", scheduleSync, { passive: true });
    const observer = new ResizeObserver(scheduleSync);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", scheduleSync);
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [sync, scheduleSync]);

  // The first sync runs before the rail is mounted, so it sizes the booleans but
  // not the thumb. Size the thumb once the rail actually exists.
  useEffect(() => {
    if (canScroll) sync();
  }, [canScroll, sync]);

  const step = useCallback((direction: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: direction * SCROLL_STEP, behavior: "smooth" });
  }, []);

  // Drag-to-scroll. dnd-kit's PointerSensor binds its activator to the card's
  // own drag handle, so a pointerdown on the board background never reaches it.
  // The inverse is the real risk — card pointerdowns bubble up to here — hence
  // the data-no-drag-scroll opt-out.
  function handleBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-no-drag-scroll]")) return;

    const el = scrollRef.current;
    if (!el) return;

    // Capture first: it throws NotFoundError if the pointer is no longer active,
    // and anything we mutated before it would then never be cleaned up — leaving
    // the board stuck in the dragging state with smooth scrolling disabled.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      return;
    }

    el.dataset.dragging = "true";
    dragRef.current = {
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      pointerId: e.pointerId,
    };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }

  function handleBoardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el || e.pointerId !== drag.pointerId) return;
    el.scrollLeft = drag.startScrollLeft - (e.clientX - drag.startX);
  }

  function endBoardDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el || e.pointerId !== drag.pointerId) return;
    if (el.hasPointerCapture(drag.pointerId)) el.releasePointerCapture(drag.pointerId);
    dragRef.current = null;
    delete el.dataset.dragging;
    el.style.cursor = "";
    el.style.userSelect = "";
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
        /* Native bar hidden: it cannot be made sticky (it belongs to the scroll
           container's own box, ~2,700px below the fold here). The rail replaces it. */
        .kanban-scroll { scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth; }
        .kanban-scroll::-webkit-scrollbar { display: none; }
        /* During a drag-to-scroll every scrollLeft write would animate, making the
           drag feel rubbery. Declared here rather than mutated via el.style: React
           owns the inline style and would never restore a value we cleared. */
        .kanban-scroll[data-dragging="true"] { scroll-behavior: auto; }
        .kanban-rail {
          position: sticky;
          bottom: 0;
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 12px;
          width: fit-content;
          margin: 0 auto;
          padding: 8px 12px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 999px;
        }
        .kanban-track {
          position: relative;
          width: min(420px, 40vw);
          height: 10px;
          border-radius: 999px;
          background: var(--muted);
          overflow: hidden;
        }
        .kanban-thumb {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          border-radius: 999px;
          background: var(--primary);
          opacity: 0.7;
          transition: opacity 0.15s ease;
        }
        .kanban-track:hover .kanban-thumb { opacity: 1; }
        .kanban-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted-foreground);
          transition: color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
        }
        .kanban-arrow:hover:not(:disabled) { color: var(--primary); border-color: var(--primary); }
        .kanban-arrow:disabled { opacity: 0.3; cursor: default; }
        .pipe-action { transition: color 0.15s ease, border-color 0.15s ease; }
        .pipe-action:hover { color: #C9963A; border-color: rgba(201,150,58,0.5); }
        .pipe-action-danger { transition: color 0.15s ease, border-color 0.15s ease; }
        .pipe-action-danger:hover:not(:disabled) { color: #f87171; border-color: rgba(248,113,113,0.4); }
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
                color: "var(--muted-foreground)",
                fontFamily: "var(--font-sans)",
              }}
            >
              Mostrando {visibleDeals.length} de {deals.length} oportunidades
            </span>
          )}
        </div>
      )}

      <DndContext
        id="pipeline-kanban"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
      >
        {/* Kanban viewport — must NOT declare overflow, or it becomes the rail's
            scroll container and sticky silently stops working. */}
        <div>
        {/* Kanban scroll container. tabIndex + role: WCAG 2.1.1 — a scrollable
            region needs to be reachable by keyboard, which also gives native
            Left/Right arrow scrolling for free. (Home/End are vertical-axis
            keys and are a no-op here; the rail's buttons cover jump-to-edge.) */}
        <div
          ref={scrollRef}
          id="kanban-board"
          className="kanban-scroll focus-ring"
          role="region"
          aria-label="Tablero de oportunidades"
          tabIndex={0}
          onPointerDown={handleBoardPointerDown}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={endBoardDrag}
          onPointerCancel={endBoardDrag}
          style={{
            overflowX: "auto",
            paddingBottom: 24,
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
                      <h3 className="eyebrow">
                        {STAGE_SHORT[stage]}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {stageValue > 0 && (
                        <span
                          className="num"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--muted-foreground)",
                          }}
                        >
                          {formatCurrencyCompact(stageValue)}
                        </span>
                      )}
                      <span
                        style={{
                          background: "var(--secondary)",
                          color: "var(--muted-foreground)",
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
                          borderRadius: "14px",
                          color: "var(--muted-foreground)",
                          fontSize: 12,
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {overStage === stage ? "Soltar aquí" : "Vacío"}
                      </div>
                    )}
                    {stageDeals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
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

        {/* Scroll rail. The track/thumb are decorative: keyboard and screen
            reader users get the board via the focusable region above, so the
            two buttons carry the whole accessible affordance. */}
        {canScroll && (
          <div className="kanban-rail">
            <button
              type="button"
              className="kanban-arrow focus-ring"
              aria-label="Desplazar columnas a la izquierda"
              aria-controls="kanban-board"
              disabled={atStart}
              onClick={() => step(-1)}
            >
              <ChevronLeft size={16} />
            </button>

            <div className="kanban-track" ref={trackRef} aria-hidden="true">
              <div className="kanban-thumb" ref={thumbRef} />
            </div>

            <button
              type="button"
              className="kanban-arrow focus-ring"
              aria-label="Desplazar columnas a la derecha"
              aria-controls="kanban-board"
              disabled={atEnd}
              onClick={() => step(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
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
                    borderRadius: "14px",
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
                        background: "var(--secondary)",
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
                          color: "var(--foreground)",
                        }}
                      >
                        {name}
                      </p>
                      {activeDeal.deal_value != null && (
                        <p
                          className="num"
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: "#f5bd5d",
                            marginTop: 2,
                          }}
                        >
                          {formatCurrency(activeDeal.deal_value, activeDeal.currency ?? "USD")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
        </DragOverlay>
      </DndContext>
    </>
  );
}
