// Mensajes de error de guardado de contactos para la UI.

export const DUPLICATE_CONTACT_MESSAGE = "Ya existe un contacto con ese teléfono o ese lead.";
export const INVALID_PHONE_MESSAGE = "El teléfono no es válido: no puede llevar letras ni corchetes.";
export const GENERIC_CONTACT_MESSAGE = "No se pudo guardar el contacto.";

interface DbError { code?: string | null; message?: string | null }

/** 23505 por SQLSTATE (PostgREST siempre lo propaga); un texto con "unique" puede ser otro error (p. ej. 42P10). */
export function isUniqueViolation(error: DbError | null | undefined): boolean {
  return error?.code === "23505";
}

/** Texto para el toast: nunca el mensaje crudo de la BD (nombres de indices, tablas y politicas). */
export function friendlyContactError(error: DbError | null | undefined): string {
  if (isUniqueViolation(error)) return DUPLICATE_CONTACT_MESSAGE;
  // El unico CHECK de contacts es contacts_phone_no_marker (0037): un telefono con letras o corchetes.
  if (error?.code === "23514") return INVALID_PHONE_MESSAGE;
  return GENERIC_CONTACT_MESSAGE;
}
