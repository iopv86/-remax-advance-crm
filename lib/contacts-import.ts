// Normalizacion de una fila del CSV de importacion de contactos (POST /api/contacts/import).
import { toE164 } from "@/lib/phone";

// Expected CSV columns (case-insensitive, flexible header names)
const COL_MAP: Record<string, string> = {
  nombre:        "first_name",
  name:          "first_name",
  "first name":  "first_name",
  "nombre completo": "full_name",
  "full name":   "full_name",
  apellido:      "last_name",
  "last name":   "last_name",
  telefono:      "phone",
  phone:         "phone",
  "phone number": "phone",
  celular:       "phone",
  whatsapp:      "whatsapp_number",
  email:         "email",
  correo:        "email",
  fuente:        "source_detail",
  source:        "source_detail",
  notas:         "agent_notes",
  notes:         "agent_notes",
};

export interface ImportRow {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
  source_detail?: string;
  agent_notes?: string;
}

// Valid E.164 or null (lib/phone, region DO). Before D01-P04 every number without "+" got one prepended, so a
// Spanish national 612345678 became "+612345678", a key that matches nobody.
function normalizePhone(raw: string | undefined): string | null {
  return toE164(raw, "DO");
}

// A phone cell counts only when it carries digits: "N/A" or "-" mean "no phone", not "invalid phone".
const MIN_PHONE_DIGITS = 7;
const hasPhoneDigits = (value: string | undefined) =>
  (value?.replace(/\D/g, "").length ?? 0) >= MIN_PHONE_DIGITS;

function mapRow(row: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [raw, value] of Object.entries(row)) {
    const key = COL_MAP[raw.toLowerCase().trim()];
    if (!key || !value?.trim()) continue;
    // telefono / phone / celular share a key: one without digits never hides one that has them.
    const isPhoneKey = key === "phone" || key === "whatsapp_number";
    if (isPhoneKey && hasPhoneDigits(mapped[key]) && !hasPhoneDigits(value)) continue;
    mapped[key] = value.trim();
  }
  return mapped;
}

export function normalizeRow(row: Record<string, string>): ImportRow {
  const mapped = mapRow(row);

  // Split full_name into first/last if present
  if (mapped.full_name && !mapped.first_name) {
    const [first, ...rest] = mapped.full_name.split(" ");
    mapped.first_name = first;
    if (rest.length) mapped.last_name = rest.join(" ");
    delete mapped.full_name;
  }

  const phone = normalizePhone(mapped.phone);

  return {
    first_name:      mapped.first_name,
    last_name:       mapped.last_name,
    phone:           phone,
    whatsapp_number: normalizePhone(mapped.whatsapp_number) ?? phone,
    email:           mapped.email?.toLowerCase() || null,
    source_detail:   mapped.source_detail,
    agent_notes:     mapped.agent_notes,
  };
}

export type PreparedRow =
  | { kind: "empty" }
  | { kind: "invalid_phone" }
  | { kind: "ok"; data: ImportRow };

/**
 * empty: sin nombre, telefono, whatsapp ni email (se cuenta como omitida, como antes).
 * invalid_phone: trae telefono o whatsapp con digitos y ninguno es un numero valido. No se importa: sin telefono no tendria
 * phone_key, el indice unico no la veria y cada reimportacion crearia otro contacto; la respuesta la lista.
 */
export function prepareRow(row: Record<string, string>): PreparedRow {
  const mapped = mapRow(row);
  const norm = normalizeRow(row);
  const hadPhone = hasPhoneDigits(mapped.phone) || hasPhoneDigits(mapped.whatsapp_number);
  if (hadPhone && !norm.phone && !norm.whatsapp_number) return { kind: "invalid_phone" };
  if (!norm.first_name && !norm.phone && !norm.whatsapp_number && !norm.email) return { kind: "empty" };
  return { kind: "ok", data: norm };
}
