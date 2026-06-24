/**
 * Single source of truth for the lead "Intereses" vocabulary — Spanish labels
 * keyed by the Postgres enum value / has_* amenity key. Imported by the read
 * surfaces (contact detail, deal detail, contacts table) AND the editor, so the
 * option lists never drift from what the pages render.
 *
 * Values MUST match the DB enums:
 *   property_type      = apartment|penthouse|villa|house|land|commercial|apart_hotel|farm
 *   operation_type     = buy|sell|rent
 *   property_condition = ready|under_construction|any
 *   timeline_type      = immediate|1_3_months|3_6_months|6_12_months|exploring
 *   purpose_type       = investment|personal|both|unknown
 *   payment_method     = cash|financing|mixed|crypto|unknown
 *   desired_amenities  = has_* keys (vocabulary from migration 0006)
 */

import type { SelectOption } from "@/components/form/fields";

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Apartamento",
  penthouse: "Penthouse",
  villa: "Villa",
  house: "Casa",
  land: "Terreno / Solar",
  commercial: "Comercial",
  apart_hotel: "Apart-hotel",
  farm: "Finca",
};

export const OPERATION_TYPE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venta",
  rent: "Alquiler",
};

export const CONDITION_LABELS: Record<string, string> = {
  ready: "Lista para entrega",
  under_construction: "En construcción",
  any: "Indiferente",
};

export const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Inmediato",
  "1_3_months": "1 – 3 meses",
  "3_6_months": "3 – 6 meses",
  "6_12_months": "6 – 12 meses",
  exploring: "Solo explorando",
};

export const PURPOSE_LABELS: Record<string, string> = {
  investment: "Inversión",
  personal: "Uso personal",
  both: "Ambos",
  unknown: "Sin definir",
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Contado",
  financing: "Financiamiento bancario",
  mixed: "Mixto",
  crypto: "Cripto",
  unknown: "Otro / Sin definir",
};

/** Amenity vocabulary = has_* keys from migration 0006. */
export const AMENITY_LABELS: Record<string, string> = {
  has_pool: "Piscina",
  has_gym: "Gimnasio",
  has_terrace: "Terraza",
  has_security: "Seguridad 24h",
  has_elevator: "Ascensor",
  has_covered_parking: "Parqueo cubierto",
  has_generator: "Planta eléctrica",
  has_storage: "Storage",
  has_laundry: "Lavandería",
  has_furnished: "Amueblado",
  has_balcony: "Balcón",
  has_staff_quarters: "Cuarto de servicio",
  has_solar_panels: "Paneles solares",
  has_jacuzzi: "Jacuzzi",
  has_ocean_view: "Vista al mar",
  has_city_view: "Vista a la ciudad",
  has_club_house: "Club house",
  has_kids_area: "Área de niños",
};

/** Build `SelectOption[]` from a label record, preserving insertion order. */
export function toOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

export const PROPERTY_TYPE_OPTS = toOptions(PROPERTY_TYPE_LABELS);
export const OPERATION_TYPE_OPTS = toOptions(OPERATION_TYPE_LABELS);
export const CONDITION_OPTS = toOptions(CONDITION_LABELS);
export const TIMELINE_OPTS = toOptions(TIMELINE_LABELS);
export const PAYMENT_OPTS = toOptions(PAYMENT_LABELS);
export const AMENITY_OPTS = toOptions(AMENITY_LABELS);
/** Purpose excludes "unknown" in the editor (only meaningful choices offered). */
export const PURPOSE_OPTS: SelectOption[] = [
  { value: "investment", label: "Inversión" },
  { value: "personal", label: "Uso personal" },
  { value: "both", label: "Ambos" },
];

/** Render a multi-value array as "Label A, Label B" using a label map. */
export function labelList(
  values: string[] | null | undefined,
  labels: Record<string, string>,
): string {
  if (!values || values.length === 0) return "";
  return values.map((v) => labels[v] ?? v).join(", ");
}
