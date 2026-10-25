-- 0037_contacts_phone_check.sql
--
-- D01-P01 (Etapa 2.0): ningun telefono nuevo con letras o corchetes (REQ 8).
--
-- Que cierra: el modelo de Ava escribio un marcador ("[numero de contacto del cliente]") como telefono de un contacto
-- real. Medido el 2026-10-24: N_VIOL = 1 fila (source ctwa_ad, 2026-05-21). Su escritor es el camino de brain.py
-- anterior a 31db51c (2026-05-29), que solo inyectaba el telefono del contexto si el modelo no mandaba uno; desde
-- 31db51c el telefono sale siempre del servidor y pasa _is_valid_phone (0 marcadores nuevos en 25 ctwa_ad).
--
-- NOT VALID no revisa las filas existentes, pero TODO UPDATE de una fila que lo viola falla con 23514 (por ejemplo,
-- el last_message_at que escribe cada mensaje). Por eso esta migracion SOLO se aplica en prod con N_VIOL = 0; con
-- N_VIOL > 0 queda para P04, que limpia esas filas y la aplica con VALIDATE.
--
-- Puramente aditiva: 1 constraint NOT VALID.

alter table public.contacts
  add constraint contacts_phone_no_marker
  check ((phone is null or phone !~ '[A-Za-z\[\]]') and (whatsapp_number is null or whatsapp_number !~ '[A-Za-z\[\]]'))
  not valid;
