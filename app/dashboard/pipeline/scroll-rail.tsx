"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";

interface Props {
  /** id of the scroll container these controls drive. */
  controls: string;
  trackRef: RefObject<HTMLDivElement | null>;
  thumbRef: RefObject<HTMLDivElement | null>;
  atStart: boolean;
  atEnd: boolean;
  onStepLeft: () => void;
  onStepRight: () => void;
  onTrackPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTrackPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTrackPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTrackPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTrackLostPointerCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * Sticky scroll rail for the kanban board.
 *
 * MOUNT AS A BARE SIBLING of the scroll container — do not wrap it. `position:
 * sticky` anchors to the nearest scrolling ancestor, and per the CSS spec a box
 * whose overflow is non-visible on one axis gets `auto` on the other. So any
 * wrapper that ever acquires an overflow property silently becomes the sticky
 * ancestor and the rail scrolls away with the page instead of pinning.
 *
 * The track and thumb are decorative (aria-hidden, not focusable): keyboard and
 * screen reader users reach the board through its focusable region, so the two
 * buttons carry the whole accessible affordance. Dragging is a mouse
 * enhancement on top, not the only way through.
 */
export function ScrollRail({
  controls,
  trackRef,
  thumbRef,
  atStart,
  atEnd,
  onStepLeft,
  onStepRight,
  onTrackPointerDown,
  onTrackPointerMove,
  onTrackPointerUp,
  onTrackPointerCancel,
  onTrackLostPointerCapture,
}: Props) {
  return (
    <>
      <style>{`
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
          cursor: pointer;
          touch-action: pan-x;
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
        /* Driven by the hook's dataset writes, not inline style: React diffs
           against its own props, so a cleared inline value would never be
           restored. */
        .kanban-track[data-dragging="true"] { cursor: grabbing; }
        .kanban-track[data-dragging="true"] .kanban-thumb { opacity: 1; }
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
      `}</style>

      {/* data-no-drag-scroll is a no-op at the current mount point (the rail is
          a sibling of the scroll container, so its pointer events never reach
          the board's handler). It is a portability invariant: this component is
          droppable inside a scroll container, and there it would double-drag. */}
      <div className="kanban-rail" data-no-drag-scroll="">
        <button
          type="button"
          className="kanban-arrow focus-ring"
          aria-label="Desplazar columnas a la izquierda"
          aria-controls={controls}
          disabled={atStart}
          onClick={onStepLeft}
        >
          <ChevronLeft size={16} />
        </button>

        <div
          className="kanban-track"
          ref={trackRef}
          aria-hidden="true"
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerCancel}
          onLostPointerCapture={onTrackLostPointerCapture}
        >
          <div className="kanban-thumb" ref={thumbRef} />
        </div>

        <button
          type="button"
          className="kanban-arrow focus-ring"
          aria-label="Desplazar columnas a la derecha"
          aria-controls={controls}
          disabled={atEnd}
          onClick={onStepRight}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}
