import type { UnitEstado } from "./types";

export const CSV_HEADERS =
  "nombre_unidad,seccion,nivel,habitaciones,banos,medios_banos,estacionamientos,m2_construido,m2_extra,precio_venta,moneda_venta,precio_mantenimiento,precio_separacion,estado,etapa,notas";

export const CSV_EXAMPLE_ROWS = [
  "I6,,3,3,2,0,1,120.5,,185000,USD,2500,5000,disponible,Fase 1,Vista al mar",
  "D3,Torre A,2,2,2,0,1,95.0,,145000,USD,2000,,reservado,,",
  "PH-A,Penthouse,10,4,3,1,2,250.0,80.0,450000,USD,5000,10000,disponible,Fase 2,Terraza privada",
].join("\n");

export interface CsvRowParsed {
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

export const VALID_ESTADOS: UnitEstado[] = ["disponible", "vendido", "reservado", "bloqueado"];
export const VALID_CURRENCIES = ["USD", "DOP"];

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

export function parseCsv(text: string): CsvRowParsed[] {
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
    const estado: UnitEstado = VALID_ESTADOS.includes(rawEstado as UnitEstado)
      ? (rawEstado as UnitEstado)
      : "disponible";

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
      moneda_venta: VALID_CURRENCIES.includes((get(cMv) || "USD").toUpperCase())
        ? (get(cMv) || "USD").toUpperCase()
        : "USD",
      precio_mantenimiento: num(cMant),
      precio_separacion: num(cSep),
      estado,
      etapa: get(cEtapa) || undefined,
      notas: get(cNotas) || undefined,
    });
  }
  return rows;
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
