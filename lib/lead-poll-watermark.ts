/**
 * Scan-window and watermark arithmetic for the Meta lead poller.
 *
 * Extracted as pure functions on purpose: the defect these rules fix
 * (2 leads permanently lost between 2026-07-10 and 2026-08-09) lived entirely
 * in this arithmetic, so it must be testable without a server, a database or
 * a Graph token.
 *
 * The bug, for the record: the poller queried Meta with
 * `time_created GREATER_THAN watermark` and then advanced the watermark to the
 * run's start time UNCONDITIONALLY. A lead created at 10:00:30 but not yet
 * visible on Meta's leads edge when the 10:01 run fired was invisible to that
 * run, and the 10:02 run asked for `created > 10:01:00` -- which the lead could
 * never satisfy again. The filter itself excluded it forever, with no error
 * logged and a 200 response.
 */

/** Query the window with this much overlap, to absorb Meta leads-edge visibility lag. */
export const OVERLAP_MS = 15 * 60 * 1000;

/** Hard floor on how far back a pinned watermark may drag the scan window. */
export const MAX_SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Window used when there is no usable stored watermark. */
export const FIRST_RUN_MS = 60 * 60 * 1000;

export interface ScanWindow {
  /** Epoch ms; the poller sends floor(sinceMs / 1000) to Meta. */
  sinceMs: number;
  /** No stored watermark, or one that could not be parsed. */
  firstRun: boolean;
  /** The window hit MAX_SCAN_WINDOW_MS: the watermark has been pinned too long. */
  clamped: boolean;
}

/**
 * Turns the stored watermark into the window to ask Meta for.
 *
 * The overlap is applied to the QUERY only. The value written back to
 * `agency_config.lead_poll_last_ts` stays the clean run-start timestamp, so the
 * margin never compounds and can be retuned by redeploy alone.
 */
export function computeScanWindow(
  watermarkRaw: string | null | undefined,
  nowMs: number,
): ScanWindow {
  const parsed = watermarkRaw ? new Date(watermarkRaw).getTime() : NaN;

  // A missing OR malformed watermark both mean "we do not know where we were".
  // Without this guard a malformed value yields NaN, which reaches Meta's
  // filtering param as NaN and produces undefined behaviour -- the same
  // silent-total-loss class this module exists to remove.
  if (!Number.isFinite(parsed)) {
    return { sinceMs: nowMs - FIRST_RUN_MS, firstRun: true, clamped: false };
  }

  let sinceMs = parsed - OVERLAP_MS;
  let clamped = false;

  const floor = nowMs - MAX_SCAN_WINDOW_MS;
  if (sinceMs < floor) {
    sinceMs = floor;
    clamped = true;
  }

  // A watermark in the future (clock skew, manual edit) must not ask Meta for
  // a window that starts after now.
  if (sinceMs > nowMs) sinceMs = nowMs;

  return { sinceMs, firstRun: false, clamped };
}

export interface RunStats {
  /** The page access token was obtained for the configured page. */
  tokenOk: boolean;
  /** The ACTIVE lead-form list was READ successfully (an empty list still counts as read). */
  formsOk: boolean;
  /** Number of lead pages that failed to fetch. */
  graphErrors: number;
  /** Leads that reached processLead but produced no contact for lack of an agent. */
  noAgent: number;
}

/**
 * Fail-closed: the watermark only moves when the run actually saw the whole window.
 * Any failure leaves it where it was, so the next run re-reads the same window.
 * Re-reading is safe because processLead is idempotent (deduped by phone, then
 * meta_lead_id, and the intake deal is deduped per contact).
 *
 * `forms.length > 0` is deliberately NOT a condition: once the user-token
 * fallback is gone, an empty ACTIVE-form list is a legitimate state (every
 * campaign paused) and pinning on it would stall forever for a benign reason.
 *
 * `noAgent` IS a condition: an empty round-robin roster is global state, not a
 * poison lead. It self-heals the moment an agent is reactivated, and pinning
 * means every lead seen meanwhile gets re-scanned and ingested.
 * MAX_SCAN_WINDOW_MS caps the exposure at 24h.
 */
export function shouldAdvanceWatermark(s: RunStats): boolean {
  return s.tokenOk && s.formsOk && s.graphErrors === 0 && s.noAgent === 0;
}
