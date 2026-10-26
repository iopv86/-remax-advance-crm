import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

/**
 * Phone normalization for numbers typed by a person (Lead Forms, external API).
 *
 * `libphonenumber-js/max` on purpose: with the default `min` metadata isValid()
 * only checks the length, so "1234567890" would pass. `max` validates the
 * digits the way Google's libphonenumber does (and phonenumbers 9.0.41, which
 * is what D01-CONTEXT section 2 measured).
 *
 * The result is the value stored in contacts.phone and passed to
 * resolve_contact; the database derives its own key (phone_key) from it, and
 * keyFromE164 must return exactly that key or the RPC answers 22023.
 */

// Letters or brackets: a placeholder the model or a person typed ("[numero de
// contacto del cliente]", "tel 809..."). Never guess digits out of prose.
const NOT_A_NUMBER_RE = /[A-Za-z[\]]/;
const E164_RE = /^\+[1-9]\d{7,14}$/;
// Same junk rule as public.phone_key (migration 0034): the library accepts
// +33333333333 (FR) or +77777777777 (KZ), but the database key for them is NULL,
// so resolve_contact would reject the pair with 22023 on every poll.
const SAME_DIGIT_RE = /^(\d)\1+$/;

/** Valid E.164 ("+18095550101") or null. Never throws. */
export function toE164(raw: string | null | undefined, region: CountryCode = "DO"): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || NOT_A_NUMBER_RE.test(trimmed)) return null;
  try {
    const parsed = parsePhoneNumberFromString(trimmed, region);
    if (!parsed?.isValid()) return null;
    const digits = parsed.number.slice(1);
    if (SAME_DIGIT_RE.test(digits) || digits === "1234567890") return null;
    return parsed.number;
  } catch {
    return null;
  }
}

/** Digits of an E.164 number ("+18095550101" -> "18095550101"), or null for anything else. */
export function keyFromE164(e164: string | null): string | null {
  if (!e164 || !E164_RE.test(e164)) return null;
  return e164.slice(1);
}
