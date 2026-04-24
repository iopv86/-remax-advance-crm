"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Download, Check, X, AlertCircle, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ProjectUnit, UnitEstado } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = "#C9963A";
const BG_BODY = "#0D0E12";
const BG_SURFACE = "#181820";
const BG_ELEVATED = "#1C1D27";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED = "#9899A8";
const BORDER_GOLD = "rgba(201,150,58,0.15)";
const BORDER_DIM = "rgba(255,255,255,0.06)";

const STATUS_MAP: Record<UnitEstado, { label: string; color: string; bg: string }> = {
  disponible: { label: "Disponible", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  reservado:  { label: "Reservado",  color: "#C9963A", bg: "rgba(201,150,58,0.12)" },
  vendido:    { label: "Vendido",    color: "#f43f5e", bg: "rgba(244,63,94,0.12)"  },
  bloqueado:  { label: "Bloqueado",  color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

const CSV_HEADERS =
  "nombre_unidad,seccion,nivel,habitaciones,banos,medios_banos,estacionamientos,m2_construido,m2_extra,precio_venta,moneda_venta,precio_mantenimiento,precio_separacion,estado,etapa,notas";

const CSV_EXAMPLE_ROWS = [
  "I6,,3,3,2,0,1,120.5,,185000,USD,2500,5000,disponible,Fase 1,Vista al mar",
  "D3,Torre A,2,2,2,0,1,95.0,,145000,USD,2000,,reservado,,",
  "PH-A,Penthouse,10,4,3,1,2,250.0,80.0,450000,USD,5000,10000,disponible,Fase 2,Terraza privada",
].join("\n");

interface CsvRowParsed {
  nombre_unidad: string;
  seccion?: string;
  nivel?: number | null;
  habitaciones?: number | null;
  banos?: number | null;
  medios_banos?: number | null;
  estacionamientos?: number | null;
  m2_construido?: number | null;
  m2_extra?: number | null;
  precio_venta?: number | null;
  moneda_venta?: string;
  precio_mantenimiento?: number | null;
  precio_separacion?: number | null;
  estado?: UnitEstado;
  etapa?: string;
  notas?: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

const VALID_ESTADOS: UnitEstado[] = ["disponible", "vendido", "reservado", "bloqueado"];
const VALID_CURRENCIES = ["USD", "DOP"];

function parseCsv(text: string): CsvRowParsed[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const col = (aliases: string[]) => aliases.map((a) => headers.indexOf(a)).find((i) => i >= 0) ?? -1;

  const cNombre = col(["nombre_unidad", "nombre", "unidad", "unit_number", "numero"]);
  const cSeccion = col(["seccion", "sección", "bloque", "torre"]);
  const cNivel = col(["nivel", "piso", "floor"]);
  const cHab = col(["habitaciones", "hab", "bedrooms", "cuartos"]);
  const cBanos = col(["banos", "baños", "bathrooms", "bath"]);
  const cMedios = col(["medios_banos", "medios", "half_baths"]);
  const cEst = col(["estacionamientos", "est", "parking"]);
  const cM2c = col(["m2_construido", "m2", "area_m2", "area", "metros"]);
  const cM2e = col(["m2_extra", "terraza", "balcon"]);
  const cPv = col(["precio_venta", "precio", "price"]);
  const cMv = col(["moneda_venta", "moneda", "currency"]);
  const cMant = col(["precio_mantenimiento", "mantenimiento", "maintenance"]);
  const cSep = col(["precio_separacion", "separacion"]);
  const cEstado = col(["estado", "status", "disponibilidad"]);
  const cEtapa = col(["etapa", "stage", "fase"]);
  const cNotas = col(["notas", "notes", "comentarios"]);

  if (cNombre === -1) return [];

  const rows: CsvRowParsed[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const get = (idx: number) => (idx >= 0 ? cols[idx] ?? "" : "");
    const num = (idx: number): number | null => {
      const v = parseFloat(get(idx).replace(/,/g, ""));
      return isNaN(v) ? null : v;
    };
    const int = (idx: number): number | null => {
      const v = parseInt(get(idx), 10);
      return isNaN(v) ? null : v;
    };

    const nombre = get(cNombre);
    if (!nombre) continue;

    const rawEstado = get(cEstado).toLowerCase().trim();
    const estado: UnitEstado = VALID_ESTADOS.includes(rawEstado as UnitEstado) ? rawEstado as UnitEstado : "disponible";

    rows.push({
      nombre_unidad: nombre,
      seccion: get(cSeccion) || undefined,
      nivel: int(cNivel),
      habitaciones: int(cHab),
      banos: int(cBanos),
      medios_banos: int(cMedios),
      estacionamientos: int(cEst),
      m2_construido: num(cM2c),
      m2_extra: num(cM2e),
      precio_venta: num(cPv),
      moneda_venta: VALID_CURRENCIES.includes((get(cMv) || "USD").toUpperCase()) ? (get(cMv) || "USD").toUpperCase() : "USD",
      precio_mantenimiento: num(cMant),
      precio_separacion: num(cSep),
      estado,
      etapa: get(cEtapa) || undefined,
      notas: get(cNotas) || undefined,
    });
  }
  return rows;
}

// ─── Price formatter ──────────────────────────────────────────────────────────

function fmt(price: number, currency?: string | null): string {
  const cur = currency ?? "USD";
  if (price >= 1_000_000)
    return `${cur} ${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 2)}M`;
  return `${cur} ${price.toLocaleString()}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ estado }: { estado?: UnitEstado | null }) {
  const s = STATUS_MAP[estado ?? "disponible"] ?? STATUS_MAP.disponible;
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function StatChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: TEXT_MUTED }}>{label}: <strong style={{ color }}>{count}</strong></span>
    </div>
  );
}

// ─── Add Unit Inline Form ─────────────────────────────────────────────────────

interface AddUnitFormProps {
  propertyId: string;
  onSaved: () => void;
  onCancel: () => void;
}

function AddUnitForm({ propertyId, onSaved, onCancel }: AddUnitFormProps) {
  const [form, setForm] = useState({
    nombre_unidad: "",
    seccion: "",
    nivel: "",
    habitaciones: "",
    banos: "",
    estacionamientos: "",
    m2_construido: "",
    precio_venta: "",
    moneda_venta: "USD",
    precio_mantenimiento: "",
    precio_separacion: "",
    estado: "disponible" as UnitEstado,
    etapa: "",
    notas: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function field(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    if (!form.nombre_unidad.trim()) { setErr("El nombre/código de unidad es obligatorio"); return; }
    setSaving(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("project_units").insert({
      property_id: propertyId,
      nombre_unidad: form.nombre_unidad.trim(),
      seccion: form.seccion.trim() || null,
      nivel: form.nivel ? parseInt(form.nivel, 10) : null,
      habitaciones: form.habitaciones ? parseInt(form.habitaciones, 10) : null,
      banos: form.banos ? parseInt(form.banos, 10) : null,
      estacionamientos: form.estacionamientos ? parseInt(form.estacionamientos, 10) : null,
      m2_construido: form.m2_construido ? parseFloat(form.m2_construido) : null,
      precio_venta: form.precio_venta ? parseFloat(form.precio_venta) : null,
      moneda_venta: form.moneda_venta,
      precio_mantenimiento: form.precio_mantenimiento ? parseFloat(form.precio_mantenimiento) : null,
      precio_separacion: form.precio_separacion ? parseFloat(form.precio_separacion) : null,
      estado: form.estado,
      etapa: form.etapa.trim() || null,
      notas: form.notas.trim() || null,
    });
    setSaving(false);
    if (error) {
      const msg = error.code === "42501"
        ? "Sin permisos para agregar unidades a esta propiedad."
        : error.code === "23505"
        ? "Ya existe una unidad con ese nombre en este proyecto."
        : "Error al guardar la unidad. Intenta de nuevo.";
      setErr(msg);
      return;
    }
    onSaved();
  }

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    background: BG_SURFACE, border: `1px solid ${BORDER_DIM}`, borderRadius: 7,
    padding: "7px 10px", color: TEXT_PRIMARY, fontSize: 12, outline: "none", width: "100%",
    ...style,
  });

  return (
    <div style={{ background: BG_ELEVATED, border: `1px solid ${BORDER_GOLD}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 16 }}>Nueva unidad</div>

      {err && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", marginBottom: 14 }}>
          <AlertCircle style={{ width: 13, height: 13, color: "#f43f5e", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#f43f5e" }}>{err}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Unidad *</div>
          <input style={inp()} value={form.nombre_unidad} onChange={(e) => field("nombre_unidad", e.target.value)} placeholder="I6, D3, Apt 201" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sección</div>
          <input style={inp()} value={form.seccion} onChange={(e) => field("seccion", e.target.value)} placeholder="Torre A" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Nivel</div>
          <input style={inp()} type="number" value={form.nivel} onChange={(e) => field("nivel", e.target.value)} placeholder="3" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Hab.</div>
          <input style={inp()} type="number" value={form.habitaciones} onChange={(e) => field("habitaciones", e.target.value)} placeholder="2" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Baños</div>
          <input style={inp()} type="number" value={form.banos} onChange={(e) => field("banos", e.target.value)} placeholder="2" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Est.</div>
          <input style={inp()} type="number" value={form.estacionamientos} onChange={(e) => field("estacionamientos", e.target.value)} placeholder="1" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>m²</div>
          <input style={inp()} type="number" step="0.01" value={form.m2_construido} onChange={(e) => field("m2_construido", e.target.value)} placeholder="120.5" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Precio venta</div>
          <input style={inp()} type="number" value={form.precio_venta} onChange={(e) => field("precio_venta", e.target.value)} placeholder="185000" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Moneda</div>
          <select style={{ ...inp(), cursor: "pointer" }} value={form.moneda_venta} onChange={(e) => field("moneda_venta", e.target.value)}>
            <option value="USD">USD</option>
            <option value="DOP">DOP</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Estado</div>
          <select style={{ ...inp(), cursor: "pointer" }} value={form.estado} onChange={(e) => field("estado", e.target.value as UnitEstado)}>
            <option value="disponible">Disponible</option>
            <option value="reservado">Reservado</option>
            <option value="vendido">Vendido</option>
            <option value="bloqueado">Bloqueado</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Mantenimiento</div>
          <input style={inp()} type="number" value={form.precio_mantenimiento} onChange={(e) => field("precio_mantenimiento", e.target.value)} placeholder="2500" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Separación</div>
          <input style={inp()} type="number" value={form.precio_separacion} onChange={(e) => field("precio_separacion", e.target.value)} placeholder="5000" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Etapa</div>
          <input style={inp()} value={form.etapa} onChange={(e) => field("etapa", e.target.value)} placeholder="Fase 1" />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Notas</div>
          <input style={inp()} value={form.notas} onChange={(e) => field("notas", e.target.value)} placeholder="Vista al mar, esquina..." />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button onClick={onCancel} style={{ padding: "7px 14px", background: BG_SURFACE, color: TEXT_MUTED, fontSize: 12, borderRadius: 7, border: `1px solid ${BORDER_DIM}`, cursor: "pointer" }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "7px 16px", background: saving ? "rgba(201,150,58,0.4)" : GOLD, color: BG_BODY, fontSize: 12, fontWeight: 600, borderRadius: 7, border: "none", cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Guardando…" : "Guardar unidad"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  propertyId: string;
  canEdit: boolean;
}

export function PropertyUnitsTab({ propertyId, canEdit }: Props) {
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // CSV import state
  const [csvRows, setCsvRows] = useState<CsvRowParsed[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; error?: string } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadUnits = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("project_units")
      .select("*")
      .eq("property_id", propertyId)
      .order("nombre_unidad");
    if (error) setFetchError("No se pudieron cargar las unidades.");
    else setUnits((data ?? []) as ProjectUnit[]);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { loadUnits(); }, [loadUnits]);

  // ── CSV export ──────────────────────────────────────────────────────────────

  function csvQ(v: unknown): string {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  }

  function handleExportCsv() {
    const rows = units.map((u) =>
      [
        u.nombre_unidad,
        u.seccion ?? "",
        u.nivel ?? "",
        u.habitaciones ?? "",
        u.banos ?? "",
        u.medios_banos ?? "",
        u.estacionamientos ?? "",
        u.m2_construido ?? "",
        u.m2_extra ?? "",
        u.precio_venta ?? "",
        u.moneda_venta ?? "USD",
        u.precio_mantenimiento ?? "",
        u.precio_separacion ?? "",
        u.estado,
        u.etapa ?? "",
        u.notas ?? "",
      ].map(csvQ).join(",")
    );
    const content = `${CSV_HEADERS}\n${rows.join("\n")}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unidades-proyecto-${propertyId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadTemplate() {
    const content = `${CSV_HEADERS}\n${CSV_EXAMPLE_ROWS}`;
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
    if (file.size > 2 * 1024 * 1024) {
      setCsvError("El archivo CSV no puede superar 2 MB.");
      e.target.value = "";
      return;
    }
    setCsvFileName(file.name);
    setImportResult(null);
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") {
        setCsvError("Error leyendo el archivo. Intenta de nuevo.");
        return;
      }
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setCsvError("El CSV no tiene filas válidas o el encabezado no coincide. Descarga la plantilla para ver el formato correcto.");
        setCsvRows(null);
      } else if (rows.length > 500) {
        setCsvError(`El archivo tiene ${rows.length} filas. Máximo 500 unidades por importación. Divide el archivo y vuelve a intentar.`);
        setCsvRows(null);
      } else {
        setCsvRows(rows);
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  async function handleConfirmImport() {
    if (!csvRows || csvRows.length === 0) return;
    setImporting(true);
    setImportResult(null);
    const supabase = createClient();
    const payload = csvRows.map((row) => ({
      property_id: propertyId,
      nombre_unidad: row.nombre_unidad,
      seccion: row.seccion ?? null,
      nivel: row.nivel ?? null,
      habitaciones: row.habitaciones ?? null,
      banos: row.banos ?? null,
      medios_banos: row.medios_banos ?? null,
      estacionamientos: row.estacionamientos ?? null,
      m2_construido: row.m2_construido ?? null,
      m2_extra: row.m2_extra ?? null,
      precio_venta: row.precio_venta ?? null,
      moneda_venta: row.moneda_venta ?? "USD",
      precio_mantenimiento: row.precio_mantenimiento ?? null,
      precio_separacion: row.precio_separacion ?? null,
      estado: row.estado ?? "disponible",
      etapa: row.etapa ?? null,
      notas: row.notas ?? null,
    }));
    const { error } = await supabase
      .from("project_units")
      .upsert(payload, { onConflict: "property_id,nombre_unidad", ignoreDuplicates: false });
    setImporting(false);
    if (error) {
      const msg = error.code === "42501"
        ? "Sin permisos para importar unidades a esta propiedad."
        : "Error al importar. Verifica que los datos sean correctos y vuelve a intentar.";
      setImportResult({ success: 0, error: msg });
    } else {
      setImportResult({ success: csvRows.length });
      setCsvRows(null);
      setCsvFileName(null);
      void loadUnits();
    }
  }

  function handleCancelImport() {
    setCsvRows(null);
    setCsvFileName(null);
    setImportResult(null);
    setCsvError(null);
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const stats = {
    total: units.length,
    disponible: units.filter((u) => u.estado === "disponible").length,
    vendido: units.filter((u) => u.estado === "vendido").length,
    reservado: units.filter((u) => u.estado === "reservado").length,
    bloqueado: units.filter((u) => u.estado === "bloqueado").length,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "Manrope, sans-serif", fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: 0 }}>
            Unidades del proyecto
          </h2>
          {units.length > 0 && (
            <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 3 }}>
              {stats.total} unidad{stats.total !== 1 ? "es" : ""} · {stats.disponible} disponible{stats.disponible !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleDownloadTemplate}
            title="Descargar plantilla CSV"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", background: BG_ELEVATED, color: TEXT_MUTED, fontSize: 12, fontWeight: 500, borderRadius: 8, border: `1px solid ${BORDER_DIM}`, cursor: "pointer" }}
          >
            <Download style={{ width: 13, height: 13 }} />
            Plantilla
          </button>

          {units.length > 0 && (
            <button
              onClick={handleExportCsv}
              title="Exportar unidades a CSV"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", background: BG_ELEVATED, color: TEXT_MUTED, fontSize: 12, fontWeight: 500, borderRadius: 8, border: `1px solid ${BORDER_DIM}`, cursor: "pointer" }}
            >
              <Download style={{ width: 13, height: 13 }} />
              Exportar CSV
            </button>
          )}

          {canEdit && (
            <>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", background: BG_ELEVATED, color: TEXT_MUTED, fontSize: 12, fontWeight: 500, borderRadius: 8, border: `1px solid ${BORDER_DIM}`, cursor: "pointer" }}
              >
                <Upload style={{ width: 13, height: 13 }} />
                Subir CSV
              </button>
              <button
                onClick={() => { setShowAddForm(true); setImportResult(null); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", background: "rgba(201,150,58,0.1)", color: GOLD, fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid rgba(201,150,58,0.2)`, cursor: "pointer" }}
              >
                <Plus style={{ width: 13, height: 13 }} />
                Agregar unidad
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <AddUnitForm
          propertyId={propertyId}
          onSaved={() => { setShowAddForm(false); void loadUnits(); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Import result banner */}
      {importResult && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: importResult.error ? "rgba(244,63,94,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${importResult.error ? "rgba(244,63,94,0.2)" : "rgba(16,185,129,0.2)"}` }}>
          {importResult.error
            ? <><AlertCircle style={{ width: 15, height: 15, color: "#f43f5e", flexShrink: 0 }} /><span style={{ fontSize: 13, color: "#f43f5e" }}>Error: {importResult.error}</span></>
            : <><Check style={{ width: 15, height: 15, color: "#10b981", flexShrink: 0 }} /><span style={{ fontSize: 13, color: "#10b981" }}>{importResult.success} unidad{importResult.success !== 1 ? "es" : ""} importadas correctamente.</span></>
          }
        </div>
      )}

      {/* CSV error */}
      {csvError && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)" }}>
          <AlertCircle style={{ width: 15, height: 15, color: "#f43f5e", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#f43f5e" }}>{csvError}</span>
        </div>
      )}

      {/* CSV preview */}
      {csvRows && csvRows.length > 0 && (
        <div style={{ background: BG_ELEVATED, border: `1px solid ${BORDER_GOLD}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${BORDER_DIM}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>Vista previa — {csvFileName}</div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                {csvRows.length} fila{csvRows.length !== 1 ? "s" : ""}{csvRows.length > 5 ? ` · mostrando primeras 5` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCancelImport} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: BG_SURFACE, color: TEXT_MUTED, fontSize: 12, borderRadius: 7, border: `1px solid ${BORDER_DIM}`, cursor: "pointer" }}>
                <X style={{ width: 12, height: 12 }} /> Cancelar
              </button>
              <button onClick={handleConfirmImport} disabled={importing} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: importing ? "rgba(201,150,58,0.4)" : GOLD, color: BG_BODY, fontSize: 12, fontWeight: 600, borderRadius: 7, border: "none", cursor: importing ? "not-allowed" : "pointer" }}>
                <Check style={{ width: 12, height: 12 }} />
                {importing ? "Importando…" : `Confirmar (${csvRows.length})`}
              </button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: BG_SURFACE }}>
                  {["Unidad", "Sección", "Nivel", "Hab.", "Baños", "m²", "Precio", "Estado"].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${BORDER_DIM}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BORDER_DIM}` }}>
                    <td style={{ padding: "9px 14px", color: TEXT_PRIMARY, fontWeight: 500 }}>{row.nombre_unidad}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.seccion ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.nivel ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.habitaciones ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.banos ?? "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.m2_construido != null ? `${row.m2_construido}` : "—"}</td>
                    <td style={{ padding: "9px 14px", color: TEXT_MUTED }}>{row.precio_venta != null ? fmt(row.precio_venta, row.moneda_venta) : "—"}</td>
                    <td style={{ padding: "9px 14px" }}><StatusBadge estado={row.estado} /></td>
                  </tr>
                ))}
                {csvRows.length > 5 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, color: TEXT_MUTED, fontStyle: "italic" }}>
                      + {csvRows.length - 5} fila{csvRows.length - 5 !== 1 ? "s" : ""} más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Units table */}
      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: TEXT_MUTED, fontSize: 13 }}>Cargando unidades…</div>
      ) : fetchError ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)" }}>
          <AlertCircle style={{ width: 15, height: 15, color: "#f43f5e" }} />
          <span style={{ fontSize: 13, color: "#f43f5e" }}>{fetchError}</span>
        </div>
      ) : units.length === 0 && !csvRows ? (
        <div style={{ padding: "48px 24px", textAlign: "center", background: BG_ELEVATED, borderRadius: 12, border: `1px dashed ${BORDER_DIM}` }}>
          <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 6 }}>No hay unidades registradas para este proyecto.</div>
          {canEdit && <div style={{ fontSize: 12, color: TEXT_MUTED, opacity: 0.6 }}>Usa "Agregar unidad" o sube un CSV para comenzar.</div>}
        </div>
      ) : units.length > 0 ? (
        <div style={{ background: BG_ELEVATED, border: `1px solid ${BORDER_DIM}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: BG_SURFACE }}>
                  {["Unidad", "Sección", "Nivel", "Hab.", "Baños", "Est.", "m²", "Precio venta", "Estado", "Etapa"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${BORDER_DIM}`, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {units.map((unit, i) => (
                  <tr key={unit.id} style={{ borderBottom: i < units.length - 1 ? `1px solid ${BORDER_DIM}` : "none" }}>
                    <td style={{ padding: "11px 16px", color: TEXT_PRIMARY, fontWeight: 600, fontFamily: "Manrope, sans-serif", whiteSpace: "nowrap" }}>{unit.nombre_unidad}</td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>{unit.seccion ?? "—"}</td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>{unit.nivel ?? "—"}</td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>{unit.habitaciones ?? "—"}</td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>{unit.banos ?? "—"}</td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>{unit.estacionamientos ?? "—"}</td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED }}>{unit.m2_construido != null ? `${unit.m2_construido} m²` : "—"}</td>
                    <td style={{ padding: "11px 16px", color: unit.precio_venta ? TEXT_PRIMARY : TEXT_MUTED, fontWeight: unit.precio_venta ? 500 : 400, whiteSpace: "nowrap" }}>
                      {unit.precio_venta != null ? fmt(unit.precio_venta, unit.moneda_venta) : "—"}
                    </td>
                    <td style={{ padding: "11px 16px" }}><StatusBadge estado={unit.estado} /></td>
                    <td style={{ padding: "11px 16px", color: TEXT_MUTED, fontSize: 12 }}>{unit.etapa ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stats footer */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "10px 16px", borderTop: `1px solid ${BORDER_DIM}`, background: BG_SURFACE, flexWrap: "wrap" }}>
            {stats.disponible > 0 && <StatChip label="Disponibles" count={stats.disponible} color={STATUS_MAP.disponible.color} />}
            {stats.vendido > 0 && <StatChip label="Vendidas" count={stats.vendido} color={STATUS_MAP.vendido.color} />}
            {stats.reservado > 0 && <StatChip label="Reservadas" count={stats.reservado} color={STATUS_MAP.reservado.color} />}
            {stats.bloqueado > 0 && <StatChip label="Bloqueadas" count={stats.bloqueado} color={STATUS_MAP.bloqueado.color} />}
            <div style={{ marginLeft: "auto", fontSize: 11, color: TEXT_MUTED }}>Total: <strong style={{ color: TEXT_PRIMARY }}>{stats.total}</strong></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
