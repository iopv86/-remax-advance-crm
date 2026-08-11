import { test, expect } from "@playwright/test";
import {
  computeScanWindow,
  shouldAdvanceWatermark,
  OVERLAP_MS,
  MAX_SCAN_WINDOW_MS,
  FIRST_RUN_MS,
} from "../lib/lead-poll-watermark";

// These are pure-function tests: they never touch the `page` fixture, so no
// browser is launched. They exist because the defect they guard against (2 Meta
// leads permanently lost between 2026-07-10 and 2026-08-09) lived entirely in
// this arithmetic, and was invisible to every other kind of test.

const NOW = Date.parse("2026-08-11T12:00:00.000Z");

test.describe("computeScanWindow", () => {
  test("subtracts the overlap so a lead indexed late is still re-read", () => {
    const wm = new Date(NOW - 60_000).toISOString(); // watermark 1 min ago
    const w = computeScanWindow(wm, NOW);

    expect(w.firstRun).toBe(false);
    expect(w.clamped).toBe(false);
    expect(w.sinceMs).toBe(NOW - 60_000 - OVERLAP_MS);
    // The regression that matters: the window must reach BACK past the
    // watermark, never start at it.
    expect(w.sinceMs).toBeLessThan(Date.parse(wm));
  });

  test("a missing watermark falls back to the first-run window", () => {
    const w = computeScanWindow(null, NOW);
    expect(w.firstRun).toBe(true);
    expect(w.sinceMs).toBe(NOW - FIRST_RUN_MS);
  });

  test("a malformed watermark is treated as first run, never as NaN", () => {
    const w = computeScanWindow("garbage", NOW);
    expect(w.firstRun).toBe(true);
    expect(Number.isFinite(w.sinceMs)).toBe(true);
    expect(w.sinceMs).toBe(NOW - FIRST_RUN_MS);
  });

  test("a long-pinned watermark is clamped to 24h and flagged", () => {
    const wm = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    const w = computeScanWindow(wm, NOW);
    expect(w.clamped).toBe(true);
    expect(w.sinceMs).toBe(NOW - MAX_SCAN_WINDOW_MS);
  });

  test("a watermark in the future never asks for a window starting after now", () => {
    const wm = new Date(NOW + 60 * 60 * 1000).toISOString();
    const w = computeScanWindow(wm, NOW);
    expect(w.sinceMs).toBeLessThanOrEqual(NOW);
  });
});

test.describe("shouldAdvanceWatermark", () => {
  const clean = { tokenOk: true, formsOk: true, graphErrors: 0, noAgent: 0 };

  test("advances only when the whole window was actually read", () => {
    expect(shouldAdvanceWatermark(clean)).toBe(true);
  });

  test("pins on a failed page token", () => {
    expect(shouldAdvanceWatermark({ ...clean, tokenOk: false })).toBe(false);
  });

  test("pins when the form list could not be read", () => {
    expect(shouldAdvanceWatermark({ ...clean, formsOk: false })).toBe(false);
  });

  test("pins on any failed lead page", () => {
    expect(shouldAdvanceWatermark({ ...clean, graphErrors: 1 })).toBe(false);
  });

  test("pins when a lead was dropped for lack of an agent", () => {
    expect(shouldAdvanceWatermark({ ...clean, noAgent: 1 })).toBe(false);
  });

  test("an empty but successfully read form list still advances", () => {
    // Every campaign paused is a legitimate state; pinning on it would stall
    // ingestion forever for a benign reason.
    expect(shouldAdvanceWatermark(clean)).toBe(true);
  });
});
