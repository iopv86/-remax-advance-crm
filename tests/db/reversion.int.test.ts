// D01-P01 Tarea 1: la huella del DDL del banco es la de prod y la reversion la restaura.
// La MISMA consulta (contacts-fingerprint.sql) corre en prod (contacts-fingerprint.pre.prod.json) y aqui.
//  1) Linea base: prod-schema.sql solo (sin migraciones) == huella de prod antes de D01-P01.
//  2) Reversion: con 0034-0037 aplicadas, migrations/rollback/D01-P01-down.sql deja la huella igual a esa linea.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import type { Sql } from 'postgres'
import { RUN, MIGRATIONS, startBench, readSql, fixturePath, migrationPath, type Bench } from './helpers/bench'

const DOWN = 'rollback/D01-P01-down.sql'

// La huella ordena las funciones con el collation de cada servidor (prod en_US ignora la puntuacion: is_admin_or_manager
// antes que is_admin; el banco usa C). Se reordenan las dos huellas por nombre, sin tocar su contenido.
type Fp = { functions?: Array<[string, ...unknown[]]> } & Record<string, unknown>
function normalized(fp: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(fp)) as Fp
  copy.functions = (copy.functions ?? []).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return copy
}
async function fingerprint(sql: Sql): Promise<unknown> {
  const rows = await sql.unsafe(readSql(fixturePath('contacts-fingerprint.sql')))
  return normalized(rows[0].fp)
}
const prodPre = () => normalized((JSON.parse(readFileSync(fixturePath('contacts-fingerprint.pre.prod.json'), 'utf8')) as { fp: unknown }).fp)

describe.skipIf(!RUN)('huella del DDL y reversion (Postgres embebido 17.6)', () => {
  it('linea base: el banco sin migraciones tiene la huella de prod (contacts-fingerprint.pre.prod.json)', async () => {
    const b: Bench = await startBench({ without: MIGRATIONS })
    try {
      expect(await fingerprint(b.sql)).toEqual(prodPre())
    } finally {
      await b.stop()
    }
  })

  // Tarea 4: en prod se aplicaron 0034-0036; 0037 no (N_VIOL = 1, queda para P04). La huella post de prod
  // (contacts-fingerprint.post.prod.json, tomada tras apply_migration) debe ser la del banco con esas tres.
  it('la huella post de prod coincide con el banco tras 0034-0036 (sin 0037)', async () => {
    const without = MIGRATIONS.filter((m) => m.startsWith('0037'))
    expect(without).toHaveLength(1)
    const b: Bench = await startBench({ without })
    try {
      const prodPost = normalized((JSON.parse(readFileSync(fixturePath('contacts-fingerprint.post.prod.json'), 'utf8')) as { fp: unknown }).fp)
      expect(await fingerprint(b.sql)).toEqual(prodPost)
    } finally {
      await b.stop()
    }
  })

  it('D01-P01-down.sql sobre 0034-0037 deja la huella igual a la de prod antes de D01-P01', async () => {
    const b: Bench = await startBench()
    try {
      if (!existsSync(migrationPath(DOWN))) throw new Error(`${DOWN} no existe`)
      expect(b.skipped).toEqual([]) // la reversion solo significa algo si las 4 migraciones estaban aplicadas
      await b.sql.begin((t) => t.unsafe(readSql(migrationPath(DOWN))))
      expect(await fingerprint(b.sql)).toEqual(prodPre())
    } finally {
      await b.stop()
    }
  })
})
