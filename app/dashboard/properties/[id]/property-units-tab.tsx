"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Download, Check, X, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropertyUnit {
  id: string;
  property_id: string;
  unit_number: string;
  unit_type?: string | null;
  area_m2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  price?: number | null;
  currency?: string | null;
  status?: string | null;
  floor_plan_url?: string | null;
  notes?: string | null;
  created_at: string;
}

// CSV row before mapping
interface CsvRow {
  unit_number: string;
  unit_type?: string;
  area_m2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  price?: number | null;
  currency?: string;
  status?: string;
  notes?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = "#C9963A";
const BG_BODY = "#0D0E12";
const BG_SURFACE = "#181820";
const BG_ELEVATED = "#1C1D27";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED = "#9899A8";
const BORDER_GOLD = "rgba(201,150,58,0.15)";
const BORDER_DIM = "rgba(255,255,255,0.06)";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: "Disponible", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  reserved:  { label: "Reservado",  color: "#C9963A", bg: "rgba(201,150,58,0.12)" },
  sold:      { label: "Vendido",    color: "#f43f5e", bg: "rgba(244,63,94,0.12)" },
};

const CSV_STATUS_MAP: Record<string, string> = {
  disponible: "available",
  reservado:  "reserved",
  vendido:    "sold",
  available:  "available",
  reserved:   "reserved",
  sold:       "sold",
};

const CSV_TEMPLATE_HEADERS = "numero,tipo,area_m2,habitaciones,banos,precio,moneda,estado,notas";
const CSV_TEMPLATE_ROWS = [
  "101,Apartamento,120.5,3,2,185000,USD,disponible,Vista al mar",
  "102,Apartamento,95.0,2,2,145000,USD,reservado,",
  "PH-A,Penthouse,250.0,4,3,450000,USD,disponible,Terraza privada",
].join("\n");

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

  // Expected header aliases
  const colIdx = (aliases: string[]): number =>
    aliases.map((a) => headers.indexOf(a)).find((i) => i >= 0) ?? -1;

  const colNumero    = colIdx(["numero", "unit_number", "unidad"]);
  const colTipo      = colIdx(["tipo", "unit_type", "type"]);
  const colArea      = colIdx(["area_m2", "area", "m2", "metros"]);
  const colBeds      = colIdx(["habitaciones", "bedrooms", "hab", "cuartos"]);
  const colBaths     = colIdx(["banos", "bathrooms", "baños", "bath"]);
  const colPrice     = colIdx(["precio", "price"]);
  const colCurrency  = colIdx(["moneda", "currency"]);
  const colStatus    = colIdx(["estado", "status"]);
  const colNotes     = colIdx(["notas", "notes"]);

  if (colNumero === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const get = (idx: number) => (idx >= 0 ? cols[idx] ?? "" : "");
    const num = (idx: number): number | null => {
      const v = parseFloat(get(idx).replace(/,/g, ""));
      return isNaN(v) ? null : v;
    };

    const unitNumber = get(colNumero);
    if (!unitNumber) continue;

    const rawStatus = get(colStatus).toLowerCase().trim();
    rows.push({
      unit_number: unitNumber,
      unit_type:   get(colTipo) || undefined,
      area_m2:     num(colArea),
      bedrooms:    colBeds >= 0 ? (num(colBeds) !== null ? Math.round(num(colBeds)!) : null) : null,
      bathrooms:   colBaths >= 0 ? (num(colBaths) !== null ? Math.round(num(colBaths)!) : null) : null,
      price:       num(colPrice),
      currency:    get(colCurrency) || "USD",
      status:      CSV_STATUS_MAP[rawStatus] ?? "available",
      notes:       get(colNotes) || undefined,
    });
  }
  return rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number, currency?: string | null): string {
  const cur = currency ?? "USD";
  if (price >= 1_000_000)
    return `${cur} ${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 2)}M`;
  return `${cur} ${price.toLocaleString()}`;
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = STATUS_MAP[status ?? "available"] ?? STATUS_MAP.available;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  propertyId: string;
  canEdit: boolean;
}

export function PropertyUnitsTab({ propertyId, canEdit }: Props) {
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CSV import state
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; error?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing units
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("property_units")
      .select("*")
      .eq("property_id", propertyId)
      .order("unit_number")
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setUnits((data as PropertyUnit[]) ?? []);
        setLoading(false);
      });
  }, [propertyId]);

  function handleDownloadTemplate() {
    const content = `${CSV_TEMPLATE_HEADERS}\n${CSV_TEMPLATE_ROWS}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-unidades.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setError("El CSV no tiene filas válidas o el encabezado no coincide.");
        setCsvRows(null);
      } else {
        setError(null);
        setCsvRows(rows);
      }
    };
    reader.readAsText(file, "utf-8");

    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  async function handleConfirmImport() {
    if (!csvRows || csvRows.length === 0) return;
    setImporting(true);
    setImportResult(null);

    const supabase = createClient();
    const payload = csvRows.map((row) => ({
      property_id: propertyId,
      unit_number: row.unit_number,
      unit_type:   row.unit_type ?? null,
      area_m2:     row.area_m2 ?? null,
      bedrooms:    row.bedrooms ?? null,
      bathrooms:   row.bathrooms ?? null,
      price:       row.price ?? null,
      currency:    row.currency ?? "USD",
      status:      row.status ?? "available",
      notes:       row.notes ?? null,
    }));

    const { error: upsertErr } = await supabase
      .from("property_units")
      .upsert(payload, { onConflict: "property_id,unit_number", ignoreDuplicates: false });

    setImporting(false);

    if (upsertErr) {
      setImportResult({ success: 0, error: upsertErr.message });
    } else {
      setImportResult({ success: csvRows.length });
      setCsvRows(null);
      setCsvFileName(null);

      // Reload units
      const { data } = await supabase
        .from("property_units")
        .select("*")
        .eq("property_id", propertyId)
        .order("unit_number");
      setUnits((data as PropertyUnit[]) ?? []);
    }
  }

  function handleCancelImport() {
    setCsvRows(null);
    setCsvFileName(null);
    setImportResult(null);
    setError(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2
            style={{
              fontFamily: "Manrope, sans-serif",
              fontSize: 16,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              margin: 0,
            }}
          >
            Unidades del proyecto
          </h2>
          {units.length > 0 && (
            <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 3 }}>
              {units.length} unidad{units.length !== 1 ? "es" : ""} en total
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleDownloadTemplate}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 13px", background: BG_ELEVATED, color: TEXT_MUTED,
              fontSize: 12, fontWeight: 500, borderRadius: 8,
              border: `1px solid ${BORDER_DIM}`, cursor: "pointer",
            }}
          >
            <Download style={{ width: 13, height: 13 }} />
            Descargar plantilla
          </button>

          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 13px", background: "rgba(201,150,58,0.1)", color: GOLD,
                  fontSize: 12, fontWeight: 600, borderRadius: 8,
                  border: `1px solid rgba(201,150,58,0.2)`, cursor: "pointer",
                }}
              >
                <Upload style={{ width: 13, height: 13 }} />
                Subir CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderRadius: 10,
            background: importResult.error ? "rgba(244,63,94,0.08)" : "rgba(16,185,129,0.08)",
            border: `1px solid ${importResult.error ? "rgba(244,63,94,0.2)" : "rgba(16,185,129,0.2)"}`,
          }}
        >
          {importResult.error ? (
            <>
              <AlertCircle style={{ width: 15, height: 15, color: "#f43f5e", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#f43f5e" }}>
                Error al importar: {importResult.error}
              </span>
            </>
          ) : (
            <>
              <Check style={{ width: 15, height: 15, color: "#10b981", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#10b981" }}>
                {importResult.success} unidad{importResult.success !== 1 ? "es" : ""} importadas correctamente.
              </span>
            </>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && !importResult && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderRadius: 10,
            background: "rgba(244,63,94,0.08)",
            border: "1px solid rgba(244,63,94,0.2)",
          }}
        >
          <AlertCircle style={{ width: 15, height: 15, color: "#f43f5e", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#f43f5e" }}>{error}</span>
        </div>
      )}

      {/* CSV Preview */}
      {csvRows && csvRows.length > 0 && (
        <div
          style={{
            background: BG_ELEVATED,
            border: `1px solid ${BORDER_GOLD}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: `1px solid ${BORDER_DIM}`,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
                Vista previa — {csvFileName}
              </div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                {csvRows.length} fila{csvRows.length !== 1 ? "s" : ""} detectadas
                {csvRows.length > 5 ? ` · mostrando las primeras 5` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCancelImport}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", background: BG_SURFACE, color: TEXT_MUTED,
                  fontSize: 12, borderRadius: 7, border: `1px solid ${BORDER_DIM}`, cursor: "pointer",
                }}
              >
                <X style={{ width: 12, height: 12 }} />
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", background: importing ? "rgba(201,150,58,0.4)" : GOLD,
                  color: BG_BODY, fontSize: 12, fontWeight: 600,
                  borderRadius: 7, border: "none", cursor: importing ? "not-allowed" : "pointer",
                }}
              >
                <Check style={{ width: 12, height: 12 }} />
                {importing ? "Importando…" : `Confirmar importación (${csvRows.length})`}
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: BG_SURFACE }}>
                  {["#", "Tipo", "Área m²", "Hab.", "Baños", "Precio", "Estado", "Notas"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px", textAlign: "left",
                        fontSize: 10, fontWeight: 600, color: TEXT_MUTED,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        borderBottom: `1px solid ${BORDER_DIM}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BORDER_DIM}` }}>
                    <td style={{ padding: "9px 14px", color: TEXT_PRIMARY, fontWeight: 500 }}>{row.unit_number}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.unit_type ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.area_m2 != null ? `${row.area_m2}` : "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.bedrooms ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.bathrooms ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>
                      {row.price != null ? formatPrice(row.price, row.currency) : "—"}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.notes || "—"}
                    </td>
                  </tr>
                ))}
                {csvRows.length > 5 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: "8px 14px", textAlign: "center",
                        fontSize: 11, color: TEXT_MUTED,
                        fontStyle: "italic",
                      }}
                    >
                      + {csvRows.length - 5} fila{csvRows.length - 5 !== 1 ? "s" : ""} más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Existing units table */}
      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: TEXT_MUTED, fontSize: 13 }}>
          Cargando unidades…
        </div>
      ) : units.length === 0 && !csvRows ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            background: BG_ELEVATED,
            borderRadius: 12,
            border: `1px dashed ${BORDER_DIM}`,
          }}
        >
          <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 6 }}>
            No hay unidades registradas para este proyecto.
          </div>
          {canEdit && (
            <div style={{ fontSize: 12, color: TEXT_MUTED, opacity: 0.6 }}>
              Sube un CSV con la tabla de unidades para comenzar.
            </div>
          )}
        </div>
      ) : units.length > 0 ? (
        <div
          style={{
            background: BG_ELEVATED,
            border: `1px solid ${BORDER_DIM}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: BG_SURFACE }}>
                  {["Unidad", "Tipo", "Área m²", "Hab.", "Baños", "Precio", "Estado"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px", textAlign: "left",
                        fontSize: 10, fontWeight: 600, color: TEXT_MUTED,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        borderBottom: `1px solid ${BORDER_DIM}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {units.map((unit, i) => (
                  <tr
                    key={unit.id}
                    style={{
                      borderBottom: i < units.length - 1 ? `1px solid ${BORDER_DIM}` : "none",
                      transition: "background 0.12s",
                    }}
                  >
                    <td
                      style={{
                        padding: "11px 16px",
                        color: TEXT_PRIMARY,
                        fontWeight: 600,
                        fontFamily: "Manrope, sans-serif",
                      }}
                    >
                      {unit.unit_number}
                    </td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>
                      {unit.unit_type ?? "—"}
                    </td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>
                      {unit.area_m2 != null ? `${unit.area_m2} m²` : "—"}
                    </td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>
                      {unit.bedrooms ?? "—"}
                    </td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>
                      {unit.bathrooms ?? "—"}
                    </td>
                    <td style={{ padding: "11px 16px", color: unit.price ? TEXT_PRIMARY : TEXT_MUTED, fontWeight: unit.price ? 500 : 400 }}>
                      {unit.price != null ? formatPrice(unit.price, unit.currency) : "—"}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <StatusBadge status={unit.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 20,
              padding: "10px 16px",
              borderTop: `1px solid ${BORDER_DIM}`,
              background: BG_SURFACE,
            }}
          >
            {(["available", "reserved", "sold"] as const).map((s) => {
              const count = units.filter((u) => u.status === s).length;
              if (count === 0) return null;
              const info = STATUS_MAP[s];
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: info.color, display: "inline-block" }} />
                  <span style={{ fontSize: 11, color: TEXT_MUTED }}>{info.label}: <strong style={{ color: info.color }}>{count}</strong></span>
                </div>
              );
            })}
            <div style={{ marginLeft: "auto", fontSize: 11, color: TEXT_MUTED }}>
              Total: <strong style={{ color: TEXT_PRIMARY }}>{units.length}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
