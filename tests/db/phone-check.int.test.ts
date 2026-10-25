// D01-P01 Tarea 1: CHECK NOT VALID contra marcadores (0037). Se prueba SOLO en el banco: prod tiene 1 fila
// que lo viola (N_VIOL = 1, medido el 2026-10-24). El banco arranca SIN la 0037, crea la fila previa con marcador
// (como existe en prod) y recien despues aplica la 0037.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync } from 'node:fs'
import {
  RUN, startBench, seedAgents, insertContact, applyMigration, migrationPath, codeOf, type Bench, type Seed,
} from './helpers/bench'

const F0037 = '0037_contacts_phone_check.sql'
const MARKER = '[numero de contacto del cliente]'
const MARKER_ACCENT = '[número de contacto del cliente]'

describe.skipIf(!RUN)('CHECK contacts_phone_no_marker (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed
  let previous: string

  beforeAll(async () => {
    b = await startBench({ without: [F0037] })
    seed = await seedAgents(b.sql)
    // Fila PREVIA con marcador, creada antes del ALTER (como la de prod).
    previous = await insertContact(b.sql, { phone: MARKER_ACCENT, agent: seed.jenny.id })
    if (!existsSync(migrationPath(F0037))) throw new Error(`${F0037} no existe`)
    await applyMigration(b.sql, F0037)
  })
  afterAll(async () => { await b?.stop() })

  it('la restriccion existe y es NOT VALID', async () => {
    const rows = await b.sql`select convalidated from pg_constraint where conname = 'contacts_phone_no_marker'`
    expect(rows).toMatchObject([{ convalidated: false }])
  })

  it.each([MARKER, MARKER_ACCENT])('insert de phone con marcador %s -> 23514', async (marker) => {
    expect(await codeOf(insertContact(b.sql, { phone: marker, agent: seed.jenny.id }))).toBe('23514')
  })

  it('insert de whatsapp_number con marcador -> 23514', async () => {
    expect(await codeOf(insertContact(b.sql, { phone: '+18095550101', whatsapp: MARKER, agent: seed.jenny.id }))).toBe('23514')
  })

  it('un insert valido pasa', async () => {
    expect(await codeOf(insertContact(b.sql, { phone: '+18095550101', agent: seed.jenny.id }))).toBeNull()
  })

  it('RIESGO (decide la Tarea 4): un UPDATE de last_message_at sobre la fila PREVIA con marcador da 23514', async () => {
    expect(await codeOf(b.sql`update public.contacts set last_message_at = now() where id = ${previous}`)).toBe('23514')
  })

  it('un UPDATE que corrige el telefono de la fila previa si pasa', async () => {
    expect(await codeOf(b.sql`update public.contacts set phone = '+18095550177' where id = ${previous}`)).toBeNull()
  })
})
