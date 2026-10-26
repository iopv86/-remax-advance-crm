import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "@/tests/unit/fake-db";

vi.mock("server-only", () => ({}));

import { assignStalePrefilledContacts, isQueueLive, PREFILLED_RE } from "@/lib/prefilled-sweep";

type Db = Parameters<typeof assignStalePrefilledContacts>[0];
const NOW = Date.parse("2026-10-25T23:00:00Z");
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const PREFILLED_ES = "Enlace:\n\n\n¡Hola! Quiero más información";
const PREFILLED_EN = "Link:\n\n\nHello! Can I get more info on this?";

interface C { id: string; source?: string; agent_id?: string | null; phone_key?: string | null; created_at: string }
const contact = (c: C) => ({ source: "ctwa_ad", agent_id: null, phone_key: "18095550101", ...c });
const msg = (contactId: string, content: string, created: string, direction = "inbound") =>
  ({ id: `${contactId}-${created}`, contact_id: contactId, direction, content, created_at: created });

type ResolveReply = { outcome: string; contact_id: string | null; agent_id: string | null; agent_assigned_now: boolean };

function setup(o: {
  contacts: ReturnType<typeof contact>[]; messages: ReturnType<typeof msg>[]; live?: boolean;
  resolve?: (args: Record<string, unknown>) => ResolveReply | { error: { code: string; message: string } };
}) {
  const db = fakeDb({
    tables: {
      agency_config: o.live === false ? [] : [{ key: "agent_notify_queue_live", value: "true" }],
      contacts: o.contacts,
      messages: o.messages,
    },
    rpc: {
      resolve_contact: (args) => {
        const r = o.resolve?.(args) ?? { outcome: "found", contact_id: "c1", agent_id: "agent-rr", agent_assigned_now: true };
        return "error" in r ? { data: null, error: r.error } : { data: [{ matched_by: "exact", candidate_ids: [], ...r }], error: null };
      },
      create_intake_deal: () => ({ data: "deal-new", error: null }),
    },
  });
  return { db, asDb: db as unknown as Db, calls: (n: string) => db.rpcCalls.filter((c) => c.name === n) };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe("PREFILLED_RE (mismo patron que TEXTO_PRELLENADO de Ava)", () => {
  it.each([PREFILLED_ES, PREFILLED_EN, "  enlace : hola", "*Link:*"])("casa %j", (t) => expect(PREFILLED_RE.test(t)).toBe(true));
  it.each(["hola", "Quiero el enlace: ya", "Enlaces disponibles"])("no casa %j", (t) => expect(PREFILLED_RE.test(t)).toBe(false));
});

describe("isQueueLive (misma lectura que create_intake_deal)", () => {
  it.each([["true", true], ['"true"', true], [" TRUE ", true], ["false", false], ["", false], [null, false], [true, false]])(
    "%j -> %s", (v, expected) => expect(isQueueLive(v)).toBe(expected));
});

describe("assignStalePrefilledContacts (D18)", () => {
  it("create_intake_deal falla tras asignar -> se reintenta una vez en el momento", async () => {
    let calls = 0;
    const db = fakeDb({
      tables: {
        agency_config: [{ key: "agent_notify_queue_live", value: "true" }],
        contacts: [contact({ id: "c1", created_at: ago(20 * MIN) })],
        messages: [msg("c1", PREFILLED_ES, ago(20 * MIN))],
      },
      rpc: {
        resolve_contact: () => ({ data: [{ outcome: "found", contact_id: "c1", agent_id: "a", agent_assigned_now: true }], error: null }),
        create_intake_deal: () => (++calls === 1 ? { data: null, error: { code: "40001", message: "x" } } : { data: "deal-1", error: null }),
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await assignStalePrefilledContacts(db as unknown as Db, { now: NOW })).toMatchObject({ swept: 1, errors: 0 });
    expect(calls).toBe(2);
  });

  it("los candidatos mas nuevos van primero (un contacto viejo sin prellenado no tapa a uno nuevo)", async () => {
    const { asDb, calls } = setup({
      contacts: [contact({ id: "viejo-hola", phone_key: "18095550111", created_at: ago(3 * 24 * 60 * MIN) }),
                 contact({ id: "nuevo", phone_key: "18095550112", created_at: ago(20 * MIN) })],
      messages: [msg("viejo-hola", "hola", ago(3 * 24 * 60 * MIN)), msg("nuevo", PREFILLED_ES, ago(20 * MIN))],
      resolve: (a) => ({ outcome: "found", contact_id: a.p_key === "18095550112" ? "nuevo" : "viejo-hola", agent_id: "a", agent_assigned_now: true }),
    });
    expect((await assignStalePrefilledContacts(asDb, { now: NOW, limit: 1 })).swept).toBe(1);
    expect(calls("resolve_contact")[0].args.p_key).toBe("18095550112");
  });

  it("sin la bandera agent_notify_queue_live no hace nada y lo dice", async () => {
    const { asDb, db } = setup({ live: false, contacts: [contact({ id: "c1", created_at: ago(16 * MIN) })], messages: [msg("c1", PREFILLED_ES, ago(16 * MIN))] });
    const r = await assignStalePrefilledContacts(asDb, { now: NOW });
    expect(r.skipped).toBe("queue_not_live");
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("prellenado a los 15 min y 1 s -> resolve_contact por RR y create_intake_deal con el contacto y agente devueltos", async () => {
    const { asDb, calls } = setup({
      contacts: [contact({ id: "c1", created_at: ago(15 * MIN + 1000) })],
      messages: [msg("c1", PREFILLED_ES, ago(15 * MIN + 1000))],
      resolve: () => ({ outcome: "found", contact_id: "c1", agent_id: "agent-rr", agent_assigned_now: true }),
    });
    const r = await assignStalePrefilledContacts(asDb, { now: NOW });
    expect(r).toMatchObject({ candidates: 1, swept: 1, sweptNoAgent: 0, errors: 0 });
    expect(calls("resolve_contact")[0].args).toEqual({
      p_phone: "+18095550101", p_key: "18095550101", p_meta_lead_id: null, p_first_name: null, p_last_name: null,
      p_source: "ctwa_ad", p_assign_rr: true, p_create_without_agent: false,
    });
    expect(calls("create_intake_deal")[0].args).toEqual({ p_contact_id: "c1", p_agent_id: "agent-rr" });
  });

  it("usa el contact_id que devuelve la RPC (superviviente de un grupo), no el del candidato", async () => {
    const { asDb, calls } = setup({
      contacts: [contact({ id: "c1", created_at: ago(20 * MIN) })],
      messages: [msg("c1", PREFILLED_EN, ago(20 * MIN))],
      resolve: () => ({ outcome: "found", contact_id: "c-superviviente", agent_id: "agent-rr", agent_assigned_now: true }),
    });
    await assignStalePrefilledContacts(asDb, { now: NOW });
    expect(calls("create_intake_deal")[0].args.p_contact_id).toBe("c-superviviente");
  });

  it("a los 14 min no se toca", async () => {
    const { asDb, db } = setup({ contacts: [contact({ id: "c1", created_at: ago(14 * MIN) })], messages: [msg("c1", PREFILLED_ES, ago(14 * MIN))] });
    expect((await assignStalePrefilledContacts(asDb, { now: NOW })).swept).toBe(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("mas de 7 dias no se toca", async () => {
    const old = ago(7 * 24 * 60 * MIN + MIN);
    const { asDb, db } = setup({ contacts: [contact({ id: "c1", created_at: old })], messages: [msg("c1", PREFILLED_ES, old)] });
    await assignStalePrefilledContacts(asDb, { now: NOW });
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("no toca: contacto con agente, lead_form, sin clave, ni uno cuyo PRIMER inbound no es el prellenado", async () => {
    const t = ago(30 * MIN);
    const { asDb, db } = setup({
      contacts: [
        contact({ id: "con-agente", agent_id: "a", created_at: t }),
        contact({ id: "formulario", source: "lead_form", created_at: t }),
        contact({ id: "sin-clave", phone_key: null, created_at: t }),
        contact({ id: "hola-primero", created_at: t }),
      ],
      messages: [
        msg("con-agente", PREFILLED_ES, t), msg("formulario", PREFILLED_ES, t), msg("sin-clave", PREFILLED_ES, t),
        msg("hola-primero", "hola", ago(30 * MIN)), msg("hola-primero", PREFILLED_ES, ago(29 * MIN)),
      ],
    });
    expect((await assignStalePrefilledContacts(asDb, { now: NOW })).swept).toBe(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("un saliente antes del prellenado no cuenta: el que manda es el primer INBOUND", async () => {
    const { asDb } = setup({
      contacts: [contact({ id: "c1", created_at: ago(30 * MIN) })],
      messages: [msg("c1", "Hola, soy Ava", ago(30 * MIN), "outbound"), msg("c1", PREFILLED_ES, ago(29 * MIN))],
    });
    expect((await assignStalePrefilledContacts(asDb, { now: NOW })).swept).toBe(1);
  });

  it("otro proceso ya le puso agente (agent_assigned_now false) -> no crea deal", async () => {
    const { asDb, calls } = setup({
      contacts: [contact({ id: "c1", created_at: ago(20 * MIN) })], messages: [msg("c1", PREFILLED_ES, ago(20 * MIN))],
      resolve: () => ({ outcome: "found", contact_id: "c1", agent_id: "otro", agent_assigned_now: false }),
    });
    const r = await assignStalePrefilledContacts(asDb, { now: NOW });
    expect(r.swept).toBe(0);
    expect(calls("create_intake_deal")).toHaveLength(0);
  });

  it("no_agent -> cuenta sweptNoAgent y no crea deal (el evento lo escribe la RPC)", async () => {
    const { asDb, calls } = setup({
      contacts: [contact({ id: "c1", created_at: ago(20 * MIN) })], messages: [msg("c1", PREFILLED_ES, ago(20 * MIN))],
      resolve: () => ({ outcome: "no_agent", contact_id: "c1", agent_id: null, agent_assigned_now: false }),
    });
    expect(await assignStalePrefilledContacts(asDb, { now: NOW })).toMatchObject({ swept: 0, sweptNoAgent: 1 });
    expect(calls("create_intake_deal")).toHaveLength(0);
  });

  it("el error de una fila se registra y no corta el resto", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { asDb, calls } = setup({
      contacts: [
        contact({ id: "c1", phone_key: "18095550101", created_at: ago(40 * MIN) }),
        contact({ id: "c2", phone_key: "18095550102", created_at: ago(30 * MIN) }),
      ],
      messages: [msg("c1", PREFILLED_ES, ago(40 * MIN)), msg("c2", PREFILLED_ES, ago(30 * MIN))],
      resolve: (a) => a.p_key === "18095550101"
        ? { error: { code: "57014", message: "timeout" } }
        : { outcome: "found", contact_id: "c2", agent_id: "agent-rr", agent_assigned_now: true },
    });
    const r = await assignStalePrefilledContacts(asDb, { now: NOW });
    expect(r).toMatchObject({ swept: 1, errors: 1 });
    expect(calls("create_intake_deal")).toHaveLength(1);
    expect(err.mock.calls.flat().join(" ")).not.toContain("8095550101");
  });
});
