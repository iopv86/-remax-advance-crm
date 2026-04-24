"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Calculator } from "lucide-react";

const GOLD = "#C9963A";
const BG_ELEVATED = "#1C1D27";
const BG_SURFACE = "#181820";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED = "#9899A8";
const BORDER_GOLD = "rgba(201,150,58,0.15)";
const BORDER_DIM = "rgba(255,255,255,0.06)";

function pmt(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  initialPrice?: number;
  currency?: string;
}

export function LoanCalculator({ initialPrice, currency = "USD" }: Props) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(initialPrice ?? ""));
  const [downPct, setDownPct] = useState("20");
  const [rate, setRate] = useState("9.5");
  const [years, setYears] = useState("20");

  const result = useMemo(() => {
    const p = parseFloat(price);
    const d = parseFloat(downPct);
    const r = parseFloat(rate);
    const y = parseFloat(years);
    if (!p || isNaN(p) || !r || isNaN(r) || !y || isNaN(y) || isNaN(d)) return null;
    const down = p * (d / 100);
    const principal = p - down;
    if (principal <= 0) return null;
    const monthly = pmt(principal, r, y);
    return { monthly, principal, down, total: monthly * y * 12 };
  }, [price, downPct, rate, years]);

  return (
    <div
      style={{
        background: BG_ELEVATED,
        border: `1px solid ${BORDER_GOLD}`,
        borderRadius: 14,
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", background: "none", border: "none", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calculator style={{ width: 15, height: 15, color: GOLD }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
            Calculadora de préstamo
          </span>
        </div>
        {open
          ? <ChevronUp style={{ width: 15, height: 15, color: TEXT_MUTED }} />
          : <ChevronDown style={{ width: 15, height: 15, color: TEXT_MUTED }} />}
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ height: 1, background: BORDER_DIM }} />

          {/* Inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={`Precio (${currency})`} value={price} onChange={setPrice} placeholder="0" />
            <Field label="Inicial %" value={downPct} onChange={setDownPct} placeholder="20" />
            <Field label="Tasa anual %" value={rate} onChange={setRate} placeholder="9.5" />
            <Field label="Plazo (años)" value={years} onChange={setYears} placeholder="20" />
          </div>

          {/* Result */}
          {result ? (
            <div
              style={{
                background: BG_SURFACE,
                border: `1px solid rgba(201,150,58,0.2)`,
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Cuota mensual
                </span>
                <span style={{ fontSize: 22, fontWeight: 700, color: GOLD, fontFamily: "Manrope, sans-serif" }}>
                  {currency} {fmt(result.monthly)}
                </span>
              </div>
              <div style={{ height: 1, background: BORDER_DIM }} />
              <Row label="Inicial / Enganche" value={`${currency} ${fmt(result.down)}`} />
              <Row label="Monto a financiar" value={`${currency} ${fmt(result.principal)}`} />
              <Row label="Total pagado" value={`${currency} ${fmt(result.total)}`} muted />
            </div>
          ) : (
            <p style={{ fontSize: 12, color: TEXT_MUTED, margin: 0, textAlign: "center" }}>
              Completa los campos para calcular
            </p>
          )}

          <p style={{ fontSize: 11, color: TEXT_MUTED, margin: 0, opacity: 0.6 }}>
            Cálculo referencial. No incluye impuestos ni seguros.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, color: TEXT_MUTED, letterSpacing: "0.04em" }}>{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: BG_SURFACE, border: `1px solid ${BORDER_DIM}`, borderRadius: 8,
          padding: "8px 10px", fontSize: 13, color: TEXT_PRIMARY, outline: "none",
          width: "100%", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, color: TEXT_MUTED }}>{label}</span>
      <span style={{ fontSize: 12, color: muted ? TEXT_MUTED : TEXT_PRIMARY, fontWeight: muted ? 400 : 600 }}>{value}</span>
    </div>
  );
}
