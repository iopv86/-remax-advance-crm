"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type FxInstitution,
  type FxInstitutionType,
  type RatesSnapshot,
  computePillRate,
  formatDopRate,
} from "@/lib/fx-rates";

const GOLD = "#C9963A";

const GROUP_LABELS: Record<FxInstitutionType, string> = {
  official: "Oficial",
  bank: "Bancos",
  exchange: "Casas de cambio",
};
const GROUP_ORDER: FxInstitutionType[] = ["official", "bank", "exchange"];

function formatUpdated(apiDate: string): string {
  // apiDate is YYYY-MM-DD; render es-DO without tz math (already a DR date).
  const [y, m, d] = apiDate.split("-").map(Number);
  if (!y || !m || !d) return apiDate;
  return new Date(y, m - 1, d).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FxRatePill({ snapshot }: { snapshot: RatesSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Single traversal of the snapshot for both the pill number and the grouped list.
  const { pill, groups } = useMemo(() => {
    const p = computePillRate(snapshot);
    const g = GROUP_ORDER.map((type) => ({
      type,
      rows: (snapshot?.institutions ?? []).filter((i) => i.type === type),
    })).filter((grp) => grp.rows.length > 0);
    return { pill: p, groups: g };
  }, [snapshot]);
  const hasData = pill.value != null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => hasData && setOpen((v) => !v)}
        disabled={!hasData}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          hasData
            ? `Tasa USD a DOP: ${formatDopRate(pill.value)}${pill.sourceLabel ? ` (${pill.sourceLabel})` : ""}. Ver tasas por banco.`
            : "Tasa USD/DOP no disponible"
        }
        title={
          hasData
            ? `${pill.sourceLabel ?? ""}${pill.isStale ? " · tasa de un día anterior" : ""}`.trim()
            : "Tasa no disponible"
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          height: 32,
          padding: "0 11px",
          borderRadius: 8,
          background: "transparent",
          border: `1px solid ${open ? "rgba(201,150,58,0.45)" : "rgba(201,150,58,0.18)"}`,
          color: "var(--foreground)",
          cursor: hasData ? "pointer" : "default",
          fontFamily: "Manrope, sans-serif",
          transition: "all 0.15s",
          opacity: pill.isStale ? 0.62 : 1,
        }}
        onMouseEnter={(e) => {
          if (hasData) (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,150,58,0.08)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: "var(--muted-foreground)",
          }}
        >
          USD/DOP
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: hasData ? GOLD : "var(--muted-foreground)" }}>
          {formatDopRate(pill.value)}
        </span>
        {pill.isStale && hasData && (
          <span
            title="Tasa de un día anterior"
            style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b" }}
          />
        )}
      </button>

      {open && hasData && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Tasas de cambio USD/DOP por institución"
          tabIndex={-1}
          style={{
            position: "absolute",
            top: 40,
            right: 0,
            width: 280,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--card)",
            border: "1px solid rgba(201,150,58,0.2)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            padding: 12,
            outline: "none",
            // zIndex 60 sits above the sticky header (zIndex 40) within its
            // stacking context; below app-level modals/drawers by design.
            zIndex: 60,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "Manrope, sans-serif", color: "var(--foreground)" }}>
              Tasas USD/DOP
            </span>
            {snapshot && (
              <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                {pill.isStale ? "Al " : "Hoy "} {formatUpdated(snapshot.apiDate)}
              </span>
            )}
          </div>

          {/* column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 8,
              padding: "0 4px 4px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.4,
              color: "var(--muted-foreground)",
              borderBottom: "1px solid rgba(201,150,58,0.12)",
            }}
          >
            <span>INSTITUCIÓN</span>
            <span style={{ textAlign: "right", width: 52 }}>COMPRA</span>
            <span style={{ textAlign: "right", width: 52 }}>VENTA</span>
          </div>

          {groups.map((g) => (
            <div key={g.type} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: GOLD, marginBottom: 3, padding: "0 4px" }}>
                {GROUP_LABELS[g.type]}
              </div>
              {g.rows.map((inst) => (
                <Row key={inst.id} inst={inst} highlight={inst.id === pill.sourceId} />
              ))}
            </div>
          ))}

          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(201,150,58,0.12)", fontSize: 9, color: "var(--muted-foreground)" }}>
            Fuente: TasaReal.com · solo referencia
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ inst, highlight }: { inst: FxInstitution; highlight: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 8,
        alignItems: "center",
        padding: "5px 4px",
        borderRadius: 6,
        background: highlight ? "rgba(201,150,58,0.1)" : "transparent",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {inst.name}
        {highlight && <span style={{ color: GOLD, marginLeft: 4, fontSize: 10 }}>●</span>}
      </span>
      <span style={{ fontSize: 12, textAlign: "right", width: 52, color: "var(--muted-foreground)" }}>
        {inst.buy != null ? formatDopRate(inst.buy) : "—"}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right", width: 52, color: "var(--foreground)" }}>
        {inst.sell != null ? formatDopRate(inst.sell) : "—"}
      </span>
    </div>
  );
}
