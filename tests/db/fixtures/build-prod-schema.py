"""D01-P01 Tarea 0: construye tests/db/fixtures/prod-schema.sql a partir del catalogo de prod.

Dos pasos:
  python build-prod-schema.py extract   -> ejecuta extract-prod-schema.sql (solo SELECT) contra prod por la
                                           Management API y guarda prod-catalog.json. Lee SUPABASE_PAT de
                                           marketing-agency/.env.local DENTRO del proceso y nunca lo imprime.
  python build-prod-schema.py build     -> sin red: genera prod-schema.sql desde prod-catalog.json.

prod-schema.sql no lleva datos ni secretos: DDL, cuerpos de funcion, triggers, RLS, politicas y ACL.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SQL_FILE = HERE / "extract-prod-schema.sql"
CATALOG = HERE / "prod-catalog.json"
OUT = HERE / "prod-schema.sql"
PAT_FILE = Path(r"C:/Users/ivanp/marketing-agency/.env.local")
PROJECT_REF = "zlnqsgepzfghlmsfolko"
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

T = ["contacts", "deals", "agents", "round_robin_config", "activities", "messages",
     "notifications", "agency_config", "deal_stage_history"]
BENCH_ROLES = {"anon", "authenticated", "service_role"}
PRIV = {"r": "select", "a": "insert", "w": "update", "d": "delete", "D": "truncate",
        "x": "references", "t": "trigger", "m": "maintain", "X": "execute", "U": "usage"}


# ---------------------------------------------------------------- extract

def _read_pat() -> str:
    for line in PAT_FILE.read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPABASE_PAT="):
            value = line.split("=", 1)[1].strip().strip('"').strip("'")
            if value:
                return value
    raise SystemExit("SUPABASE_PAT no encontrado en marketing-agency/.env.local")


def _split_queries(text: str) -> dict[str, str]:
    queries: dict[str, str] = {}
    name = None
    buf: list[str] = []
    for line in text.replace("\r\n", "\n").split("\n"):
        m = re.match(r"^-- @name (\w+)\s*$", line)
        if m:
            if name:
                queries[name] = "\n".join(buf).strip()
            name, buf = m.group(1), []
        elif name and not line.startswith("--"):
            buf.append(line)
    if name:
        queries[name] = "\n".join(buf).strip()
    return queries


def _run(pat: str, sql: str, name: str) -> list[dict]:
    body = json.dumps({"query": sql, "read_only": True}).encode("utf-8")
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Authorization": f"Bearer {pat}", "Content-Type": "application/json",
        "User-Agent": "advance-crm-d01-p01-extract/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            if res.status not in (200, 201):
                raise SystemExit(f"consulta {name}: HTTP {res.status}")
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"consulta {name}: HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}") from None


# Un catalogo vacio en estas consultas daria un banco sin RLS, sin triggers o sin la trampa de 0029, y sus pruebas
# pasarian sin probar nada: se exige un minimo de filas (medido el 2026-10-24: 163, 19, 13, 32, 24, 9, 6).
MIN_ROWS = {"columns": 100, "functions": 10, "triggers": 5, "policies": 10, "default_acl": 3, "table_acl": len(T),
            "roles": 3, "enums": 5, "auth_functions": 4}


def _check_minimums(catalog: dict) -> None:
    short = {k: len(catalog.get(k) or []) for k, n in MIN_ROWS.items() if len(catalog.get(k) or []) < n}
    if short:
        raise SystemExit(f"catalogo incompleto (filas por debajo del minimo): {short}")
    if not any(d["role"] == "postgres" and d["nsp"] == "public" for d in catalog["default_acl"]):
        raise SystemExit("default_acl sin la entrada de postgres en public: el banco no heredaria la trampa de 0029")


def extract() -> None:
    pat = _read_pat()
    queries = _split_queries(SQL_FILE.read_text(encoding="utf-8"))
    catalog = {name: _run(pat, sql, name) for name, sql in queries.items()}
    _check_minimums(catalog)
    CATALOG.write_text(json.dumps(catalog, indent=1, ensure_ascii=False, sort_keys=True) + "\n",
                       encoding="utf-8", newline="\n")
    for name, rows in catalog.items():
        print(f"{name}: {len(rows)} filas")


# ---------------------------------------------------------------- build

def _acl_entries(acl: list[str] | None):
    """'grantee=privs/grantor' -> (grantee or 'public', [privileges]); solo roles del banco."""
    for entry in acl or []:
        grantee, rest = entry.split("=", 1)
        privs = rest.split("/", 1)[0].replace("*", "")
        grantee = grantee.strip('"') or "public"
        unknown = [p for p in privs if p not in PRIV]
        if unknown:
            raise SystemExit(f"privilegio desconocido {unknown} en la entrada de ACL {entry!r}")
        if grantee in BENCH_ROLES or grantee == "public":
            yield grantee, [PRIV[p] for p in privs]


def _enum_labels(raw) -> list[str]:
    """pg devuelve array_agg de `name` como texto '{a,b,c}' por la Management API: se parte aqui.
    Las etiquetas de enum de prod no llevan comas, comillas ni llaves (se comprueba)."""
    if isinstance(raw, list):
        return raw
    if not (isinstance(raw, str) and raw.startswith("{") and raw.endswith("}")):
        raise ValueError(f"etiquetas de enum con forma inesperada: {raw!r}")
    inner = raw[1:-1]
    if '"' in inner or "\\" in inner:
        raise ValueError(f"etiquetas de enum con comillas o barras: {raw!r}")
    return inner.split(",") if inner else []


def _q(ident: str) -> str:
    return ident if re.fullmatch(r"[a-z_][a-z0-9_]*", ident) else '"' + ident.replace('"', '""') + '"'


def build() -> None:
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    _check_minimums(cat)
    out: list[str] = []
    notes: list[str] = []
    w = out.append

    ext_types = sorted({c["type"] for c in cat["columns"] if c["type"].startswith("extensions.")})
    if ext_types:
        raise SystemExit(f"tipos de extension no soportados por el banco: {ext_types}")

    fk_out = [c for c in cat["constraints"] if c["contype"] == "f" and c["ref_tbl"].replace("public.", "") not in T
              and c["ref_tbl"] != "auth.users"]
    for c in fk_out:
        notes.append(f"FK omitida (tabla fuera de T): {c['tbl']}.{c['conname']} -> {c['ref_tbl']}")

    shims = sorted({m for c in cat["columns"] for m in re.findall(r"extensions\.(\w+)\(", c["default_expr"] or "")})
    srv = cat["server"][0]

    w("-- GENERADO por tests/db/fixtures/build-prod-schema.py desde prod-catalog.json. NO EDITAR A MANO.")
    w(f"-- Origen: Supabase {PROJECT_REF}, PostgreSQL {srv['server_version']} (solo SELECT, Tarea 0 de D01-P01).")
    w("-- Sin datos y sin secretos. Tablas (T): " + ", ".join(T) + ".")
    for n in notes:
        w("-- " + n)
    for s in shims:
        w(f"-- Shim: extensions.{s}() no viene en el binario embebido; se define con gen_random_uuid().")
    w("")
    w("set check_function_bodies = off;")
    w("set client_min_messages = warning;")
    w("")
    w("-- Roles de Supabase (NOLOGIN; las pruebas usan set local role).")
    for r in cat["roles"]:
        if r["rolname"] in BENCH_ROLES:
            bypass = "bypassrls" if r["rolbypassrls"] else "nobypassrls"
            w(f"do $$ begin create role {r['rolname']} nologin {bypass}; exception when duplicate_object then null; end $$;")
    w("grant anon, authenticated, service_role to current_user;")
    w("create schema if not exists auth;")
    w("create schema if not exists extensions;")
    w("grant usage on schema public, auth, extensions to anon, authenticated, service_role;")
    w("create table if not exists auth.users (id uuid primary key);")
    for s in shims:
        w(f"create or replace function extensions.{s}() returns uuid language sql as 'select gen_random_uuid()';")
    for f in cat["auth_functions"]:
        w(f["def"].rstrip() + ";")
    w("grant execute on all functions in schema auth to anon, authenticated, service_role;")
    w("")

    w("-- Enums de public.")
    for e in cat["enums"]:
        labels = ", ".join("'" + l.replace("'", "''") + "'" for l in _enum_labels(e["labels"]))
        w(f"create type public.{_q(e['typname'])} as enum ({labels});")
    w("")

    seqs = [s for s in cat["sequences"] if s["deptype"] == "a"]
    for s in seqs:
        w(f"create sequence public.{_q(s['seq'])};")
    w("")

    cols_by_tbl: dict[str, list[dict]] = {}
    for c in cat["columns"]:
        cols_by_tbl.setdefault(c["relname"], []).append(c)
    for tbl in T:
        cols = cols_by_tbl.get(tbl)
        if not cols:
            raise SystemExit(f"tabla sin columnas en el catalogo: {tbl}")
        lines = []
        for c in cols:
            d = f"  {_q(c['attname'])} {c['type']}"
            if c["attidentity"]:
                d += " generated " + ("always" if c["attidentity"] == "a" else "by default") + " as identity"
            elif c["attgenerated"] == "s":
                d += f" generated always as ({c['default_expr']}) stored"
            elif c["default_expr"] is not None:
                d += f" default {c['default_expr']}"
            if c["attnotnull"]:
                d += " not null"
            lines.append(d)
        w(f"create table public.{_q(tbl)} (\n" + ",\n".join(lines) + "\n);")
    for s in seqs:
        w(f"alter sequence public.{_q(s['seq'])} owned by {s['tbl']}.{_q(s['col'])};")
    w("")

    w("-- Constraints (PK, UNIQUE, CHECK, EXCLUDE; despues FK dentro de T).")
    order = {"p": 0, "u": 1, "c": 2, "x": 3}
    for c in sorted((c for c in cat["constraints"] if c["contype"] in order), key=lambda c: (order[c["contype"]], c["tbl"], c["conname"])):
        w(f"alter table {c['tbl']} add constraint {_q(c['conname'])} {c['def']};")
    for c in cat["constraints"]:
        if c["contype"] == "f" and c not in fk_out:
            w(f"alter table {c['tbl']} add constraint {_q(c['conname'])} {c['def']};")
    w("")

    w("-- Indices que no respaldan un constraint.")
    for i in cat["indexes"]:
        if not i["constraint_backed"]:
            w(i["indexdef"] + ";")
    w("")

    w("-- Funciones (cuerpo EXACTO de prod).")
    for f in cat["functions"]:
        w(f["def"].rstrip() + ";")
    w("")

    w("-- Triggers.")
    for t in cat["triggers"]:
        w(t["def"] + ";")
        if t["tgenabled"] == "D":
            w(f"alter table {t['tbl']} disable trigger {_q(t['tgname'])};")
    w("")

    w("-- RLS y politicas.")
    for r in cat["table_acl"]:
        if r["relrowsecurity"]:
            w(f"alter table public.{_q(r['relname'])} enable row level security;")
        if r["relforcerowsecurity"]:
            w(f"alter table public.{_q(r['relname'])} force row level security;")
    for p in cat["policies"]:
        roles = ", ".join("public" if r == "public" else _q(r) for r in p["roles"])
        s = f"create policy {_q(p['policyname'])} on public.{_q(p['tablename'])} as {p['permissive'].lower()} for {p['cmd'].lower()} to {roles}"
        if p["qual"] is not None:
            s += f" using ({p['qual']})"
        if p["with_check"] is not None:
            s += f" with check ({p['with_check']})"
        w(s + ";")
    w("")

    w("-- ACL de tabla y de secuencia (exacto de prod para anon, authenticated, service_role y PUBLIC).")
    for r in cat["table_acl"]:
        w(f"revoke all on table public.{_q(r['relname'])} from public, anon, authenticated, service_role;")
        for grantee, privs in _acl_entries(r["acl"]):
            if privs:
                w(f"grant {', '.join(privs)} on table public.{_q(r['relname'])} to {grantee};")
    for s in cat["sequences"]:
        w(f"revoke all on sequence public.{_q(s['seq'])} from public, anon, authenticated, service_role;")
        for grantee, privs in _acl_entries(s["acl"]):
            privs = [p for p in privs if p in ("select", "update", "usage")]
            if privs:
                w(f"grant {', '.join(privs)} on sequence public.{_q(s['seq'])} to {grantee};")
    w("")

    w("-- ACL de funciones (proacl de prod; null = default de PostgreSQL: EXECUTE a PUBLIC).")
    for f in cat["functions"]:
        if f["acl"] is None:
            continue
        w(f"revoke all on function {f['sig']} from public, anon, authenticated, service_role;")
        for grantee, privs in _acl_entries(f["acl"]):
            if "execute" in privs:
                w(f"grant execute on function {f['sig']} to {grantee};")
    w("")

    w("-- ALTER DEFAULT PRIVILEGES del rol que aplica las migraciones en prod (postgres), para el owner del banco.")
    w("-- Asi las tablas y funciones NUEVAS de 0034-0037 heredan la trampa de 0029 y sus revokes se prueban de verdad.")
    objtype = {"r": "tables", "S": "sequences", "f": "functions", "T": "types"}
    for d in cat["default_acl"]:
        if d["role"] != "postgres" or d["nsp"] != "public" or d["defaclobjtype"] not in objtype:
            continue
        for grantee, privs in _acl_entries(d["acl"]):
            if privs:
                w(f"alter default privileges in schema public grant {', '.join(privs)} on {objtype[d['defaclobjtype']]} to {grantee};")
    w("")
    w("reset check_function_bodies;")

    OUT.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")
    print(f"prod-schema.sql: {len(out)} lineas; {len(notes)} notas; shims={shims}")


def fingerprint() -> None:
    """Ejecuta <stem>-fingerprint.sql en prod (solo SELECT) y escribe {"fp": ...} en <stem>-fingerprint.<fase>.prod.json.
    stem = contacts (por defecto, D01-P01) o agents (0038)."""
    stems = ("contacts", "agents")
    if len(sys.argv) not in (3, 4) or sys.argv[2] not in ("pre", "post") or (len(sys.argv) == 4 and sys.argv[3] not in stems):
        raise SystemExit("uso: fingerprint pre | post [contacts | agents]")
    stem = sys.argv[3] if len(sys.argv) == 4 else "contacts"
    rows = _run(_read_pat(), (HERE / f"{stem}-fingerprint.sql").read_text(encoding="utf-8"), "fingerprint")
    if len(rows) != 1 or "fp" not in rows[0]:
        raise SystemExit(f"respuesta inesperada: {len(rows)} filas")
    target = HERE / f"{stem}-fingerprint.{sys.argv[2]}.prod.json"
    target.write_text(json.dumps({"fp": rows[0]["fp"]}, indent=1, ensure_ascii=False, sort_keys=True) + "\n",
                      encoding="utf-8", newline="\n")
    fp = rows[0]["fp"]
    print(f"{target.name}: claves={sorted(fp)} funciones={len(fp['functions'] or [])}")


if __name__ == "__main__":
    {"extract": extract, "build": build, "fingerprint": fingerprint}.get(
        sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit("uso: extract | build | fingerprint pre|post [contacts|agents]"))()
