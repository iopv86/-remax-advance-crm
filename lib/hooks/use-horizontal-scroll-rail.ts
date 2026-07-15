"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives a custom horizontal scrollbar ("rail") for a scroll container.
 *
 * A native scrollbar cannot be made sticky — it belongs to the scroll
 * container's own box, which is as tall as the tallest content, so it sits far
 * below the fold. This hook hides it and drives a rail instead: two arrow
 * buttons, a track, and a thumb that can be dragged or jumped to.
 *
 * Two contracts the consumer MUST honour, because they live in files this hook
 * cannot see:
 *
 * 1. This hook writes `data-dragging="true"` on the scroll element and on the
 *    track while a drag is live. The consumer's CSS must ship at least
 *    `[data-dragging="true"] { scroll-behavior: auto }` on the scroll element,
 *    or every drag frame animates and the drag feels rubbery. Cursor and
 *    user-select suppression belong in that same rule — NOT mutated onto
 *    `el.style`, because React diffs against its own props and would never
 *    restore a value we cleared.
 *
 * 2. The thumb must be a descendant of the track and carry `.kanban-thumb`.
 *    The track's single pointerdown discriminates drag-vs-jump with
 *    `closest(".kanban-thumb")`.
 */

const DEFAULT_MIN_THUMB_PX = 40;
/** scrollLeft never lands exactly on the max under fractional device pixel ratios. */
const SCROLL_EDGE_TOLERANCE = 1;

interface UseHorizontalScrollRailOptions {
  /** Pixels scrolled per arrow click. */
  step: number;
  /** Floor for the rendered thumb width. */
  minThumbPx?: number;
}

interface DragState {
  startX: number;
  startScrollLeft: number;
  pointerId: number;
  /** Board pixels per pointer pixel. -1 for the board pan (content follows the
   *  hand); max/travel for a thumb drag (the thumb follows the hand). */
  ratio: number;
  captureTarget: HTMLElement;
}

interface Geometry {
  max: number;
  thumbWidth: number;
  travel: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The single source of thumb geometry. `sync()` and the drag MUST both consume
 * this, or they drift apart and the thumb slides out from under the cursor.
 *
 * Returns null when nothing is draggable, which every caller treats as "bail".
 */
function measure(el: HTMLElement, track: HTMLElement, minThumbPx: number): Geometry | null {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 0 || el.scrollWidth <= 0) return null;

  const trackWidth = track.clientWidth;
  // Math.min against trackWidth is load-bearing, not defensive noise: if the
  // track measures 0 (mounted pre-layout, or an ancestor is display:none) the
  // minThumbPx floor alone yields travel = -minThumbPx, which makes the drag
  // ratio NEGATIVE — dragging right would scroll left.
  const thumbWidth = Math.min(
    trackWidth,
    Math.max(minThumbPx, (el.clientWidth / el.scrollWidth) * trackWidth)
  );
  const travel = trackWidth - thumbWidth;
  if (travel <= 0) return null;

  return { max, thumbWidth, travel };
}

export function useHorizontalScrollRail({
  step: stepPx,
  minThumbPx = DEFAULT_MIN_THUMB_PX,
}: UseHorizontalScrollRailOptions) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);

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

    // The booleans are computed first and unconditionally: the rail is only
    // mounted once canScroll flips true, so gating this on the track/thumb refs
    // would deadlock — they cannot exist until canScroll is already true.
    const nextAtStart = el.scrollLeft <= SCROLL_EDGE_TOLERANCE;
    const nextAtEnd = el.scrollLeft >= max - SCROLL_EDGE_TOLERANCE;
    const nextCanScroll = max > SCROLL_EDGE_TOLERANCE;
    setAtStart((prev) => (prev === nextAtStart ? prev : nextAtStart));
    setAtEnd((prev) => (prev === nextAtEnd ? prev : nextAtEnd));
    setCanScroll((prev) => (prev === nextCanScroll ? prev : nextCanScroll));

    // Thumb geometry, written imperatively — a setState per scroll frame would
    // re-render every column and every draggable card. This is the ONLY writer
    // of the thumb transform; drag handlers write scrollLeft and let the
    // resulting scroll event land here.
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    const geo = measure(el, track, minThumbPx);
    if (!geo) return;

    // clamp: elastic overscroll reports an out-of-range scrollLeft, which would
    // multiply straight into the transform and pop the thumb out of the track.
    const offset = clamp(el.scrollLeft / geo.max, 0, 1) * geo.travel;

    thumb.style.width = `${geo.thumbWidth}px`;
    thumb.style.transform = `translateX(${offset}px)`;
  }, [minThumbPx]);

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
      // Net for an unmount mid-drag: a stranded data-dragging would kill smooth
      // scrolling for the rest of the session.
      dragRef.current = null;
      delete el.dataset.dragging;
    };
  }, [sync, scheduleSync]);

  // The first sync runs before the rail is mounted, so it sizes the booleans but
  // not the thumb. Size the thumb once the rail actually exists.
  useEffect(() => {
    if (canScroll) sync();
  }, [canScroll, sync]);

  const step = useCallback(
    (direction: -1 | 1) => {
      scrollRef.current?.scrollBy({ left: direction * stepPx, behavior: "smooth" });
    },
    [stepPx]
  );

  const beginDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>, captureTarget: HTMLElement, ratio: number, startScrollLeft: number) => {
      const el = scrollRef.current;
      if (!el) return;
      el.dataset.dragging = "true";
      dragRef.current = {
        startX: e.clientX,
        startScrollLeft,
        pointerId: e.pointerId,
        ratio,
        captureTarget,
      };
    },
    []
  );

  // Drag-to-scroll from the board background. dnd-kit's PointerSensor binds its
  // activator to the card's own drag handle, so a pointerdown on the background
  // never reaches it. The inverse is the real risk — card pointerdowns bubble up
  // to here — hence the data-no-drag-scroll opt-out.
  const onBoardPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (dragRef.current) return;
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-no-drag-scroll]")) return;

      const el = scrollRef.current;
      if (!el) return;

      // Capture first: it throws NotFoundError if the pointer is no longer
      // active, and anything mutated before it would then never be cleaned up —
      // leaving the board stuck in the dragging state with smooth scroll dead.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        return;
      }

      // ratio -1: the content follows the hand, so scrollLeft moves opposite.
      beginDrag(e, el, -1, el.scrollLeft);
    },
    [beginDrag]
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current) return;
      // Mouse only, mirroring the board pan. Pen/touch pan the board natively
      // and get the arrow buttons; accepting them here would need touch-action:
      // none on the track and opens a gesture surface for no gain.
      if (e.pointerType !== "mouse" || e.button !== 0) return;

      const el = scrollRef.current;
      const track = trackRef.current;
      if (!el || !track) return;

      const geo = measure(el, track, minThumbPx);
      if (!geo) return;

      // Capture first — nothing above this line mutates anything, so a throw
      // unwinds to zero state.
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        return;
      }

      // Only after capture succeeds: suppressing selection is a mutation too.
      e.preventDefault();

      let startScrollLeft = el.scrollLeft;

      const onThumb = (e.target as HTMLElement).closest(".kanban-thumb");
      if (!onThumb) {
        // Jump-to-position: centre the thumb on the click, the way a modern
        // scrollbar does. Instant, not smooth — we cannot know yet whether a
        // drag follows, and a running animation would fight its scrollLeft
        // writes. data-dragging must be set BEFORE the write or the CSS
        // animates it.
        const x = e.clientX - track.getBoundingClientRect().left;
        const offset = clamp(x - geo.thumbWidth / 2, 0, geo.travel);
        el.dataset.dragging = "true";
        el.scrollLeft = (offset / geo.travel) * geo.max;
        // Read back, do NOT reuse the computed value: the browser clamps and may
        // snap scrollLeft, and a chained drag anchored to a stale origin makes
        // the thumb slide out from under the cursor.
        startScrollLeft = el.scrollLeft;
      }

      track.dataset.dragging = "true";
      // Inverse of sync(): sync maps scrollLeft -> offset over travel, so the
      // drag maps pointer delta -> scrollLeft over the same ratio. Both read the
      // same measure(), so the round trip lands the thumb under the cursor even
      // when the minThumbPx floor engages and coarsens the gear ratio.
      beginDrag(e, track, geo.max / geo.travel, startScrollLeft);
    },
    [beginDrag, minThumbPx]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el || e.pointerId !== drag.pointerId) return;
    el.scrollLeft = drag.startScrollLeft + (e.clientX - drag.startX) * drag.ratio;
  }, []);

  /**
   * Deliberately the inverse order of pointerdown. On the way IN we capture
   * first, because nothing is mutated yet and a throw must unwind to zero. On
   * the way OUT we clear state first, because a throw in the release must never
   * strand data-dragging="true" — that is what kills smooth scroll for the rest
   * of the session. This asymmetry looks like a bug; it is not.
   */
  const endDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    dragRef.current = null;
    if (scrollRef.current) delete scrollRef.current.dataset.dragging;
    if (trackRef.current) delete trackRef.current.dataset.dragging;

    try {
      if (drag.captureTarget.hasPointerCapture(drag.pointerId)) {
        drag.captureTarget.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // Already released or the node is gone. State is clear either way.
    }
  }, []);

  return {
    scrollRef,
    canScroll,
    boardProps: {
      onPointerDown: onBoardPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      // Same reasoning as the track's, below: any involuntary capture loss
      // skips pointerup entirely, and a stranded drag leaves data-dragging on
      // the board forever — smooth scroll dead for the rest of the session.
      onLostPointerCapture: endDrag,
    },
    railProps: {
      trackRef,
      thumbRef,
      atStart,
      atEnd,
      onStepLeft: () => step(-1),
      onStepRight: () => step(1),
      onTrackPointerDown,
      onTrackPointerMove: onPointerMove,
      onTrackPointerUp: endDrag,
      onTrackPointerCancel: endDrag,
      // If canScroll flips false mid-drag (the ResizeObserver fires, the rail
      // unmounts) the browser fires lostpointercapture and pointerup never
      // arrives. Without this the drag state strands forever.
      onTrackLostPointerCapture: endDrag,
    },
  };
}
