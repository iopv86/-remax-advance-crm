import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";

// meta-leads.ts importa lib/email.ts, que lleva `import "server-only"` (lanza fuera de un React Server Component).
vi.mock("server-only", () => ({}));

import { toE164, keyFromE164 } from "@/lib/phone";
import { isValidPhone } from "@/lib/meta-leads";

// Mismo fichero y misma constante que tests/db/phone-key.int.test.ts (P01) y la copia de Ava (P03).
const VECTORS_FILE = path.join(process.cwd(), "tests", "fixtures", "phone-vectors.json");
const VECTORS_SHA256 = "6eac4d7bed26217728f79c7fae3100a9f978fdeb1f0a33e27b62e505e158656b";

interface E164Vector { raw: string; region: string; e164: string | null }

const text = readFileSync(VECTORS_FILE, "utf8").replace(/\r\n/g, "\n");
const vectors = JSON.parse(text) as { ts_e164: E164Vector[] };

describe("phone-vectors.json", () => {
  it("su sha256 (CRLF -> LF) es el fijado en P01", () => {
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(VECTORS_SHA256);
  });

  it("trae los 5 vectores ts_e164 de la SPEC", () => {
    expect(vectors.ts_e164.map((v) => v.raw)).toEqual([
      "809 555 0101", "+34612345678", "612345678", "[numero de contacto del cliente]", "1234567890",
    ]);
  });
});

describe("toE164 (libphonenumber-js/max)", () => {
  it.each(vectors.ts_e164)("$raw / $region -> $e164", (v) => {
    expect(toE164(v.raw, v.region as "DO")).toBe(v.e164);
  });

  it("vacio, null y undefined -> null", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("   ")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });

  it("region por defecto DO: 10 digitos 829/849 con guiones o parentesis -> +1", () => {
    expect(toE164("829-555-0101")).toBe("+18295550101");
    expect(toE164("(849) 555 0101")).toBe("+18495550101");
  });

  it("un texto con letras nunca se interpreta (ni con digitos validos dentro)", () => {
    expect(toE164("tel 8095550101")).toBeNull();
  });

  // La libreria da por validos +33333333333 (FR) y +77777777777 (KZ), pero phone_key (0034) los anula por tener
  // todos los digitos iguales: keyFromE164 no coincidiria con phone_key y resolve_contact responderia 22023.
  it("replica la regla de basura de phone_key: todos los digitos iguales -> null", () => {
    expect(toE164("+33 3 33 33 33 33")).toBeNull();
    expect(toE164("+7 777 777 7777")).toBeNull();
  });

  it("toda salida no nula cumple keyFromE164 != null (la RPC acepta la clave)", () => {
    for (const raw of ["809 555 0101", "+34612345678", "888 888 8888", "+1 305 555 0101"]) {
      const e164 = toE164(raw);
      expect(e164).not.toBeNull();
      expect(keyFromE164(e164)).toMatch(/^\d{8,15}$/);
    }
  });
});

describe("keyFromE164", () => {
  it("E.164 con '+' -> sus digitos", () => {
    expect(keyFromE164("+18095550101")).toBe("18095550101");
  });

  it("null -> null", () => {
    expect(keyFromE164(null)).toBeNull();
  });

  it("sin '+' o fuera de 8-15 digitos -> null", () => {
    expect(keyFromE164("18095550101")).toBeNull();
    expect(keyFromE164("+1234567")).toBeNull();
    expect(keyFromE164("+0123456789")).toBeNull();
  });
});

describe("CONTROL NEGATIVO: el validador anterior de processLead", () => {
  // meta-leads.ts:539 guardaba el telefono solo si isValidPhone; un espacio lo dejaba en null.
  it("isValidPhone rechaza '809 555 0101' (el contacto quedaba sin telefono)", () => {
    expect(isValidPhone("809 555 0101")).toBe(false);
  });
});
