// Prueba del constructor del mutante de B2 sobre un texto sintetico (sin base de datos): garantiza que el
// reemplazo falla en voz alta si la 0035 deja de tener la forma esperada. Corre aunque 0035 no exista aun.
import { describe, it, expect } from 'vitest'
import { buildMutant } from './helpers/mutant'

const SRC = `-- cabecera que menciona pg_advisory_xact_lock fuera del cuerpo
create or replace function public.resolve_contact(p_phone text)
returns table(outcome text)
language plpgsql security definer set search_path = ''
as $function$
begin
  perform pg_advisory_xact_lock(73010, hashtext(p_phone));
  perform pg_advisory_xact_lock(73011, hashtext(p_phone));
  select 1;
  insert into public.contacts (phone) values (p_phone);
  insert into public.contact_match_events (kind) values ('x');
  return query select 'created';
end;
$function$;
revoke all on function public.resolve_contact(text) from public;
`

describe('buildMutant', () => {
  it('quita exactamente 2 lineas de cerrojo, inserta 1 pg_sleep antes del insert y renombra', () => {
    const m = buildMutant(SRC)
    expect(m.removedLockLines).toBe(2) // la cabecera queda fuera del bloque
    expect(m.sleepInsertions).toBe(1)
    expect(m.renamedHeaders).toBe(1)
    expect(m.lineDelta).toBe(-1)
    expect(m.sql).toContain('function public.resolve_contact_mutante(')
    expect(m.sql).not.toContain('pg_advisory_xact_lock')
    expect(m.sql.indexOf('perform pg_sleep(0.05);')).toBeLessThan(m.sql.indexOf('insert into public.contacts'))
    expect(m.sql).not.toContain('revoke all')
  })

  it('si el insert no es unico, no inserta el sleep (la prueba lo detecta)', () => {
    const twice = SRC.replace('  return query', '  insert into public.contacts (phone) values (1);\n  return query')
    expect(buildMutant(twice).sleepInsertions).toBe(0)
  })

  it('si falta la funcion, falla', () => {
    expect(() => buildMutant('select 1;')).toThrow(/resolve_contact/)
  })
})
