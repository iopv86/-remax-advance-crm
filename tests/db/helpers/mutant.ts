// Mutante de B2 (control negativo de concurrencia): copia LITERAL del cuerpo de resolve_contact leida de
// migrations/0035_resolve_contact.sql, sin las llamadas a pg_advisory_xact_lock y con `perform pg_sleep(0.05);`
// entre la busqueda y el insert. Si el texto no cambia exactamente en esos puntos, la prueba falla: asi un
// cambio de la 0035 no puede dejar un mutante distinto del que se cree estar probando.
import { existsSync } from 'node:fs'
import { migrationPath, readSql } from './bench'

export const MUTANT_NAME = 'resolve_contact_mutante'
const SIGNATURE = 'text, text, text, text, text, text, boolean, boolean'

export interface MutantBuild {
  /** Bloque original de `create function public.resolve_contact` (sin grants). */
  original: string
  /** CREATE del mutante + grant a authenticated y service_role. */
  sql: string
  removedLockLines: number
  sleepInsertions: number
  renamedHeaders: number
  lineDelta: number
}

export function buildMutant(src: string): MutantBuild {
  const head = /create\s+(?:or\s+replace\s+)?function\s+public\.resolve_contact\s*\(/i.exec(src)
  if (!head) throw new Error('0035: no encuentro create function public.resolve_contact')
  const afterHead = src.slice(head.index)
  const tagMatch = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(afterHead)
  if (!tagMatch) throw new Error('0035: resolve_contact sin cuerpo entre dollar-quotes')
  const tag = tagMatch[1]
  const bodyStart = tagMatch.index + tagMatch[0].length
  const bodyEnd = afterHead.indexOf(tag, bodyStart)
  if (bodyEnd < 0) throw new Error('0035: resolve_contact con dollar-quote sin cerrar')
  // Incluye atributos tras el cuerpo (`$$ language plpgsql ...;`) hasta el punto y coma que cierra el CREATE.
  const semi = afterHead.indexOf(';', bodyEnd + tag.length)
  if (semi < 0) throw new Error('0035: resolve_contact sin punto y coma final')
  const original = afterHead.slice(0, semi + 1)

  const lines = original.split('\n')
  const kept = lines.filter((l) => !l.includes('pg_advisory_xact_lock'))
  const removedLockLines = lines.length - kept.length
  const insertAt = kept.findIndex((l) => /^\s*insert\s+into\s+public\.contacts\b/i.test(l))
  const inserts = kept.filter((l) => /^\s*insert\s+into\s+public\.contacts\b/i.test(l)).length
  const sleepInsertions = inserts === 1 ? 1 : 0
  if (insertAt >= 0 && inserts === 1) kept.splice(insertAt, 0, '    perform pg_sleep(0.05);')
  let mutated = kept.join('\n')
  const headersBefore = (mutated.match(/function\s+public\.resolve_contact\s*\(/gi) ?? []).length
  mutated = mutated.replace(/(function\s+public\.)resolve_contact(\s*\()/i, `$1${MUTANT_NAME}$2`)
  const stillThere = (mutated.match(/public\.resolve_contact\s*\(/gi) ?? []).length
  const renamedHeaders = headersBefore === 1 && stillThere === 0 ? 1 : 0
  const grant = `\ngrant execute on function public.${MUTANT_NAME}(${SIGNATURE}) to authenticated, service_role;\n`
  return {
    original,
    sql: `${mutated}${grant}`,
    removedLockLines,
    sleepInsertions,
    renamedHeaders,
    lineDelta: mutated.split('\n').length - lines.length,
  }
}

export function loadMutantFrom0035(): MutantBuild {
  const file = migrationPath('0035_resolve_contact.sql')
  if (!existsSync(file)) throw new Error('0035_resolve_contact.sql no existe')
  return buildMutant(readSql(file))
}
