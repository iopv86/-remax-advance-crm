import { describe, it, expect } from "vitest";

import { normalizeRow, prepareRow } from "@/lib/contacts-import";

// Copia literal de normalizePhone de app/api/contacts/import/route.ts antes de D01-P04 (import:29-37). Solo sirve
// de CONTROL NEGATIVO: demuestra que los vectores de abajo distinguen la version vieja de la nueva.
function normalizePhoneOld(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (!digits.startsWith("+")) return `+${digits}`;
  return digits;
}

describe("normalizeRow (telefono por toE164, region DO)", () => {
  it("10 digitos dominicanos -> +1 y 10 digitos", () => {
    expect(normalizeRow({ telefono: "8095550101" }).phone).toBe("+18095550101");
  });

  it("formato con guiones y parentesis -> el mismo E.164", () => {
    expect(normalizeRow({ phone: "(809) 555-0101" }).phone).toBe("+18095550101");
  });

  it("E.164 extranjero se conserva", () => {
    expect(normalizeRow({ telefono: "+34612345678" }).phone).toBe("+34612345678");
  });

  it("nacional espanol de 9 cifras sin prefijo -> null (no se inventa el pais)", () => {
    expect(normalizeRow({ telefono: "612345678" }).phone).toBeNull();
  });

  it("CONTROL NEGATIVO: la version vieja fabricaba '+612345678' con el mismo vector", () => {
    expect(normalizePhoneOld("612345678")).toBe("+612345678");
  });

  it("prefijo 00 y numeros cortos o con texto tampoco se adivinan", () => {
    expect(normalizeRow({ telefono: "0034612345678" }).phone).toBeNull();
    expect(normalizeRow({ telefono: "5550101" }).phone).toBeNull();
    expect(normalizeRow({ telefono: "809 555 0101 ext 5" }).phone).toBeNull();
  });

  it("marcador del LLM y 1234567890 -> null", () => {
    expect(normalizeRow({ telefono: "[numero de contacto del cliente]" }).phone).toBeNull();
    expect(normalizeRow({ telefono: "1234567890" }).phone).toBeNull();
  });

  it("whatsapp vacio hereda el telefono; whatsapp propio se normaliza aparte", () => {
    expect(normalizeRow({ telefono: "8095550101" }).whatsapp_number).toBe("+18095550101");
    expect(normalizeRow({ telefono: "8095550101", whatsapp: "8295550102" }).whatsapp_number).toBe("+18295550102");
  });

  it("contrato sin cambios: cabeceras flexibles, nombre completo partido y email en minusculas", () => {
    expect(normalizeRow({ "Nombre Completo": " Ana Maria Perez ", Correo: "Ana@Example.COM", Notas: "x" })).toStrictEqual({
      first_name: "Ana",
      last_name: "Maria Perez",
      phone: null,
      whatsapp_number: null,
      email: "ana@example.com",
      source_detail: undefined,
      agent_notes: "x",
    });
  });
});

describe("prepareRow", () => {
  it("telefono presente sin ningun numero valido -> invalid_phone (no se importa: sin clave se duplicaria en cada reimport)", () => {
    expect(prepareRow({ nombre: "Ana", telefono: "612345678" })).toStrictEqual({ kind: "invalid_phone" });
    expect(prepareRow({ nombre: "Ana", telefono: "612345678", whatsapp: "5550101" })).toStrictEqual({ kind: "invalid_phone" });
  });

  it("telefono invalido pero whatsapp valido -> se importa con el whatsapp", () => {
    const r = prepareRow({ nombre: "Ana", telefono: "612345678", whatsapp: "8095550101" });
    expect(r).toMatchObject({ kind: "ok", data: { phone: null, whatsapp_number: "+18095550101" } });
  });

  it("whatsapp invalido con telefono valido -> se importa con el telefono en los dos campos", () => {
    expect(prepareRow({ telefono: "8095550101", whatsapp: "abc" }))
      .toMatchObject({ kind: "ok", data: { phone: "+18095550101", whatsapp_number: "+18095550101" } });
  });

  it("solo whatsapp valido -> no es una fila vacia", () => {
    expect(prepareRow({ whatsapp: "+18095550101" })).toMatchObject({ kind: "ok", data: { whatsapp_number: "+18095550101" } });
  });

  it("un telefono sin digitos ('N/A', '-') cuenta como ausente: la fila con nombre o email se importa sin telefono", () => {
    expect(prepareRow({ nombre: "Ana", email: "a@b.com", telefono: "N/A" }))
      .toMatchObject({ kind: "ok", data: { first_name: "Ana", phone: null, email: "a@b.com" } });
    expect(prepareRow({ telefono: "-" })).toStrictEqual({ kind: "empty" });
  });

  it("varias columnas de telefono: una vacia de digitos no tapa a la que trae el numero", () => {
    expect(prepareRow({ telefono: "8095550101", celular: "N/A" }))
      .toMatchObject({ kind: "ok", data: { phone: "+18095550101" } });
    expect(prepareRow({ celular: "N/A", telefono: "8095550101" }))
      .toMatchObject({ kind: "ok", data: { phone: "+18095550101" } });
  });

  it("sin nombre, telefono, whatsapp ni email -> empty; solo nombre -> ok", () => {
    expect(prepareRow({ notas: "x" })).toStrictEqual({ kind: "empty" });
    expect(prepareRow({ telefono: "  " })).toStrictEqual({ kind: "empty" });
    expect(prepareRow({ nombre: "Ana" })).toMatchObject({ kind: "ok", data: { first_name: "Ana", phone: null } });
  });
});
