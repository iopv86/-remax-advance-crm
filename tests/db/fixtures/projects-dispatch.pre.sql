-- E01 (0039): public.projects y public.mark_project_dispatched tal como estan en prod ANTES de 0039. El snapshot
-- prod-schema.sql (PRE-P01, no se regenera) no tiene ninguna de las dos. Comprobado contra el catalogo de prod el
-- 2026-10-28 (MCP, solo SELECT):
--   projects: solo las 4 columnas que toca la funcion (id, slug, last_synced_at, last_sync_status) con el tipo, la
--     nulabilidad, el default y la unicidad de prod (ningun CHECK de prod las toca); RLS activa sin force; unica
--     politica projects_select_all; ACL postgres=arwdDxtm, service_role=arwdDxtm, authenticated=r (anon y PUBLIC sin
--     nada).
--   funcion: texto literal de pg_get_functiondef; ACL postgres=X, authenticated=X, service_role=X (anon y PUBLIC sin
--     EXECUTE).
-- No lleva ningun dato de prod: se puede versionar (el repo es publico). Lo carga startBench({ projectsDispatch: true })
-- despues de prod-schema.sql, que fija ALTER DEFAULT PRIVILEGES (por eso los revoke explicitos), y antes de las
-- migraciones.

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  last_synced_at   timestamptz,
  last_sync_status text
);
alter table public.projects enable row level security;
create policy projects_select_all on public.projects for select to authenticated using (true);
revoke all on table public.projects from public, anon, authenticated, service_role;
grant all on table public.projects to service_role;
grant select on table public.projects to authenticated;

CREATE OR REPLACE FUNCTION public.mark_project_dispatched(p_id uuid, p_dispatched_at timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE projects
  SET last_synced_at  = p_dispatched_at,
      last_sync_status = 'dispatched'
  WHERE id = p_id;
END;
$function$;
revoke execute on function public.mark_project_dispatched(uuid, timestamptz) from public, anon;
grant execute on function public.mark_project_dispatched(uuid, timestamptz) to authenticated, service_role;
