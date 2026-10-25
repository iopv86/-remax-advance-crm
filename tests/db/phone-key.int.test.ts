// D01-P01 Tarea 1: clave canonica de telefono, vectores compartidos, B1 y busqueda por variantes.
// Funciones de 0034 y 0035 (phone_key / phone_match_set / phone_variants / resolve_contact). El CONTROL NEGATIVO de
// busqueda (la consulta actual `where phone = $1`) usa solo columnas que ya existian: demuestra, con el mismo
// arnes y los mismos datos, que el codigo actual no encuentra esos contactos.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  RUN, REPO, AVA, startBench, seedAgents, insertContact, resolveContact, codeOf, countContacts,
  type Bench, type Seed,
} from './helpers/bench'

const VECTORS_FILE = path.join(REPO, 'tests', 'fixtures', 'phone-vectors.json')
// sha256 del contenido con \r\n -> \n. Lo recalculan lib/phone.test.ts (P02) y Ava (P03) sobre su copia.
const VECTORS_SHA256 = '6eac4d7bed26217728f79c7fae3100a9f978fdeb1f0a33e27b62e505e158656b'

interface SqlKey { input: string | null; key: string | null; match: string[]; nota?: string }
interface Lookup { stored: string; wa_id: string; found: boolean; by: string | null; nota: string }
interface Vectors {
  sql_keys: SqlKey[]
  lookups: Lookup[]
  variants: Array<{ key: string; contains: string[] }>
}
const rawVectors = readFileSync(VECTORS_FILE)
const vectors = JSON.parse(rawVectors.toString('utf8')) as Vectors

describe('phone-vectors.json (sin base de datos)', () => {
  it('el fichero es UTF-8 sin BOM, sin CR, y su sha256 (CRLF->LF) es el fijado', () => {
    expect(rawVectors.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
    expect(rawVectors.includes(0x0d)).toBe(false)
    const normalized = rawVectors.toString('utf8').replace(/\r\n/g, '\n')
    expect(createHash('sha256').update(normalized, 'utf8').digest('hex')).toBe(VECTORS_SHA256)
  })

  it('incluye el marcador de prod con acento y el sin acento', () => {
    const inputs = vectors.sql_keys.map((v) => v.input)
    expect(inputs).toContain('[numero de contacto del cliente]')
    expect(inputs).toContain('[número de contacto del cliente]')
  })
})

describe.skipIf(!RUN)('clave de telefono y busqueda por variantes (Postgres embebido 17.6)', () => {
  let b: Bench
  let seed: Seed

  beforeAll(async () => { b = await startBench() })
  afterAll(async () => { await b?.stop() })
  beforeEach(async () => { seed = await seedAgents(b.sql) })

  const keyOf = async (input: string | null) =>
    (await b.sql<{ k: string | null }[]>`select public.phone_key(${input}) k`)[0].k
  const matchOf = async (input: string | null) =>
    (await b.sql<{ m: string[] }[]>`select public.phone_match_set(${input}, null) m`)[0].m

  describe('sql_keys', () => {
    it.each(vectors.sql_keys.map((v) => [JSON.stringify(v.input), v] as const))(
      'phone_key y phone_match_set de %s',
      async (_name, v) => {
        expect(await keyOf(v.input)).toBe(v.key)
        expect(await matchOf(v.input)).toEqual(v.match)
      },
    )
  })

  describe('B1: numeros europeos y asiaticos con +', () => {
    it.each([
      ['+4791234567', '4791234567'],
      ['+4520123456', '4520123456'],
      ['+6591234567', '6591234567'],
    ])('phone_key(%s) = %s', async (input, key) => {
      expect(await keyOf(input)).toBe(key)
    })

    it('resolve_contact("+4791234567", "4791234567") crea y una segunda llamada lo encuentra (exact)', async () => {
      const first = await resolveContact(b.sql, AVA, { phone: '+4791234567', key: '4791234567', rr: true })
      expect(first.outcome).toBe('created')
      const second = await resolveContact(b.sql, AVA, { phone: '+4791234567', key: '4791234567', rr: true })
      expect(second).toMatchObject({ outcome: 'found', matched_by: 'exact', contact_id: first.contact_id })
      expect(await countContacts(b.sql)).toBe(1)
    })

    it('NEGATIVO B1: el wa_id SIN "+" no tiene clave: resolve_contact da 22023', async () => {
      expect(await keyOf('4791234567')).toBeNull()
      const code = await codeOf(resolveContact(b.sql, AVA, { phone: '4791234567', key: '4791234567', rr: true }))
      expect(code).toBe('22023')
      expect(await countContacts(b.sql)).toBe(0)
    })

    it('NEGATIVO B1: sin "+" un numero europeo con forma NANP recibe una clave NANP equivocada', async () => {
      expect(await keyOf('4792234567')).toBe('14792234567')
      expect(await keyOf('+4792234567')).toBe('4792234567')
    })
  })

  describe('lookups: Ava manda p_phone = "+" || wa_id', () => {
    it.each(vectors.lookups.map((l) => [`${l.stored} <- ${l.wa_id} (${l.found ? l.by : 'NO casa'})`, l] as const))(
      '%s',
      async (_name, l) => {
        const stored = await insertContact(b.sql, { phone: l.stored, agent: seed.jenny.id })
        const phone = `+${l.wa_id}`
        const key = await keyOf(phone)
        expect(key).not.toBeNull()
        const r = await resolveContact(b.sql, AVA, { phone, key, rr: false })
        if (l.found) {
          expect(r).toMatchObject({ outcome: 'found', matched_by: l.by, contact_id: stored })
          expect(await countContacts(b.sql)).toBe(1)
        } else {
          expect(r.outcome).toBe('created')
          expect(r.contact_id).not.toBe(stored)
          expect(await countContacts(b.sql)).toBe(2)
        }
      },
    )

    it('phone_variants de los vectores contiene lo esperado', async () => {
      for (const v of vectors.variants) {
        const [{ vs }] = await b.sql<{ vs: string[] }[]>`select public.phone_variants(${v.key}) vs`
        for (const want of v.contains) expect(vs).toContain(want)
      }
    })

    it('phone_variants no inventa sufijo-10: 12612345678 no lleva 612345678', async () => {
      const [{ vs }] = await b.sql<{ vs: string[] }[]>`select public.phone_variants('12612345678') vs`
      expect(vs).not.toContain('612345678')
      expect(vs).toContain('2612345678')
    })
  })

  describe('CONTROL NEGATIVO de busqueda: el codigo actual no los encuentra', () => {
    // `select id from contacts where phone = $1` con el wa_id crudo (meta-leads.ts:562, tools.py:375).
    // Mismo arnes y mismos datos que los lookups de arriba; no usa ninguna funcion nueva, asi que PASA ya.
    it.each(vectors.lookups.filter((l) => l.found).map((l) => [`${l.stored} / ${l.wa_id}`, l] as const))(
      'where phone = wa_id NO encuentra %s aunque el contacto existe',
      async (_name, l) => {
        const stored = await insertContact(b.sql, { phone: l.stored, agent: seed.jenny.id })
        const [{ n: total }] = await b.sql<{ n: number }[]>`select count(*)::int n from public.contacts where id = ${stored}`
        expect(total).toBe(1)
        const hits = await b.sql`select id from public.contacts where phone = ${l.wa_id}`
        expect(hits).toHaveLength(0)
      },
    )
  })
})
