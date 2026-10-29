import { describe, it, expect } from "vitest";

import {
  friendlyContactError,
  isUniqueViolation,
  DUPLICATE_CONTACT_MESSAGE,
  GENERIC_CONTACT_MESSAGE,
  INVALID_PHONE_MESSAGE,
} from "@/lib/contact-errors";

const PHONE_KEY_23505 = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "contacts_phone_key_uidx"',
};

describe("isUniqueViolation", () => {
  it("23505 del indice de telefono (D01-P04) o de meta_lead_id", () => {
    expect(isUniqueViolation(PHONE_KEY_23505)).toBe(true);
    expect(isUniqueViolation({ code: "23505", message: "" })).toBe(true);
  });

  it("solo por SQLSTATE: un texto con 'unique' o 'duplicate' y otro codigo NO es un duplicado", () => {
    expect(isUniqueViolation({ code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" })).toBe(false);
    expect(isUniqueViolation({ code: "23514", message: 'new row violates check constraint "x_unique_fmt"' })).toBe(false);
    expect(isUniqueViolation({ message: "duplicate key value" })).toBe(false);
  });

  it("otros errores, null y undefined -> false", () => {
    expect(isUniqueViolation({ code: "42501", message: "permission denied for table contacts" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe("friendlyContactError", () => {
  it("23505 -> mensaje claro de duplicado", () => {
    expect(friendlyContactError(PHONE_KEY_23505)).toBe(DUPLICATE_CONTACT_MESSAGE);
    expect(DUPLICATE_CONTACT_MESSAGE).toBe("Ya existe un contacto con ese teléfono o ese lead.");
  });

  it("cualquier otro error -> mensaje generico, sin texto crudo de la BD", () => {
    const msg = friendlyContactError({ code: "42501", message: 'new row violates row-level security policy for table "contacts"' });
    expect(msg).toBe(GENERIC_CONTACT_MESSAGE);
    expect(msg).not.toMatch(/contacts|policy|violates/);
    expect(friendlyContactError(null)).toBe(GENERIC_CONTACT_MESSAGE);
  });

  it("23514 (CHECK contacts_phone_no_marker) -> el telefono no es valido", () => {
    expect(friendlyContactError({ code: "23514", message: 'new row violates check constraint "contacts_phone_no_marker"' }))
      .toBe(INVALID_PHONE_MESSAGE);
    expect(INVALID_PHONE_MESSAGE).not.toMatch(/contacts_|constraint/);
  });

  it("el mensaje de duplicado no nombra el indice ni la tabla", () => {
    expect(friendlyContactError(PHONE_KEY_23505)).not.toMatch(/uidx|contacts_|constraint/);
  });
});
