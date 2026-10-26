import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type FakeDbOptions } from "@/tests/unit/fake-db";

vi.mock("server-only", () => ({}));
const sendAgentEmail = vi.fn<(a: { to: string; subject: string; text: string }) => Promise<boolean>>();
vi.mock("@/lib/email", () => ({ sendAgentEmail: (a: { to: string; subject: string; text: string }) => sendAgentEmail(a) }));

import { sendGroupedMatchAlerts, MATCH_ALERT_EVERY_MS } from "@/lib/match-alerts";

type Db = Parameters<typeof sendGroupedMatchAlerts>[0];
const NOW = Date.parse("2026-10-25T23:00:00Z");
const TO = "alertas@test.local";

const ev = (id: number, kind: string, extra: Record<string, unknown> = {}) => ({
  id, created_at: "2026-10-25T22:50:00Z", kind, caller: "crm", key_last4: "0101", contact_id: `c-${id}`,
  candidate_ids: [], source: "lead_form", alerted_at: null, ...extra,
});

function setup(o: {
  events?: Record<string, unknown>[]; dead?: Record<string, unknown>[]; lastAt?: string | null; nullRow?: boolean;
  time?: Record<string, unknown>[]; fail?: FakeDbOptions["fail"];
} = {}) {
  const db = fakeDb({
    tables: {
      contact_match_events: o.events ?? [],
      agent_lead_notifications: o.dead ?? [],
      agent_time_notifications: o.time ?? [],
      agency_config: o.nullRow
        ? [{ key: "match_alert_last_at", value: null }]
        : o.lastAt === undefined || o.lastAt === null ? [] : [{ key: "match_alert_last_at", value: o.lastAt }],
    },
    unique: { agency_config: ["key"] },
    fail: o.fail,
  });
  return { db, asDb: db as unknown as Db };
}

beforeEach(() => {
  sendAgentEmail.mockReset();
  sendAgentEmail.mockResolvedValue(true);
});

describe("sendGroupedMatchAlerts", () => {
  it("sin LEAD_ALERT_EMAIL -> ok false con motivo, sin enviar", async () => {
    const { asDb } = setup({ events: [ev(1, "ambiguous")] });
    const r = await sendGroupedMatchAlerts(asDb, { to: undefined, now: NOW });
    expect(r).toMatchObject({ ok: false });
    expect(r.reason).toContain("LEAD_ALERT_EMAIL");
    expect(sendAgentEmail).not.toHaveBeenCalled();
  });

  it("ambiguous + no_agent + dup_group + avisos dead -> UN correo con todos; marca alerted_at y match_alert_last_at", async () => {
    const { db, asDb } = setup({
      events: [
        ev(1, "ambiguous", { contact_id: null, candidate_ids: ["c-a", "c-b"] }),
        ev(2, "no_agent", { contact_id: null }),
        ev(3, "dup_group", { candidate_ids: ["c-3", "c-x"] }),
        ev(4, "variant"),
        ev(5, "unarchived"),
        ev(6, "ambiguous", { alerted_at: "2026-10-25T20:00:00Z" }),
      ],
      dead: [
        { id: 9, deal_id: "d-9", status: "dead", last_error: "meta 400 code=131026", alerted_at: null },
        { id: 10, deal_id: "d-10", status: "failed", last_error: "x", alerted_at: null },
      ],
    });
    const r = await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW });
    expect(r).toMatchObject({ ok: true, events: 3, dead: 1 });
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
    const mail = sendAgentEmail.mock.calls[0][0];
    expect(mail.to).toBe(TO);
    expect(mail.subject).toBe("[CRM] Leads que requieren revision (4)");
    expect(mail.text).toContain("ambiguous origen=crm ...0101");
    expect(mail.text).toContain("/dashboard/contacts/c-a");
    expect(mail.text).toContain("/dashboard/contacts/c-b");
    expect(mail.text).toContain("/dashboard/contacts/c-3");
    expect(mail.text).toContain("aviso del deal");
    expect(mail.text).toContain("/dashboard/pipeline/d-9");
    expect(mail.text).toContain("meta 400 code=131026");
    expect(mail.text).not.toContain("c-4");
    expect(mail.text).not.toContain("d-10");
    const alerted = db.tables.contact_match_events.filter((e) => e.alerted_at && e.id !== 6).map((e) => e.id);
    expect(alerted).toEqual([1, 2, 3]);
    expect(db.tables.agent_lead_notifications.find((n) => n.id === 9)?.alerted_at).toBeTruthy();
    expect(db.tables.agent_lead_notifications.find((n) => n.id === 10)?.alerted_at).toBeNull();
    expect(db.tables.agency_config.find((c) => c.key === "match_alert_last_at")?.value).toBe(new Date(NOW).toISOString());
  });

  it("eventos identicos (el mismo lead reprocesado en cada pasada) -> 1 linea con (xN); todos quedan alertados", async () => {
    const same = { contact_id: null, candidate_ids: ["c-a", "c-b"] };
    const { db, asDb } = setup({ events: [ev(1, "ambiguous", same), ev(2, "ambiguous", same), ev(3, "ambiguous", same)] });
    await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW });
    const text = sendAgentEmail.mock.calls[0][0].text;
    expect(text.match(/\/dashboard\/contacts\/c-a/g)).toHaveLength(1);
    expect(text).toContain("(x3)");
    expect(sendAgentEmail.mock.calls[0][0].subject).toBe("[CRM] Leads que requieren revision (1)");
    expect(db.tables.contact_match_events.every((e) => e.alerted_at)).toBe(true);
  });

  it("el correo solo lleva los ultimos 4 digitos, aunque la fila trajera mas", async () => {
    const { asDb } = setup({ events: [ev(1, "no_agent", { key_last4: "18095550101" })] });
    await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW });
    const text = sendAgentEmail.mock.calls[0][0].text;
    expect(text).toContain("...0101");
    expect(text).not.toMatch(/\d{5,}/);
  });

  it("fila de cooldown con value NULL -> el reclamo funciona (no queda muda para siempre)", async () => {
    const { asDb } = setup({ events: [ev(1, "ambiguous")], nullRow: true });
    expect((await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW })).ok).toBe(true);
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
  });

  it("solo avisos dead, sin eventos -> envia", async () => {
    const { asDb } = setup({ dead: [{ id: 9, deal_id: "d-9", status: "dead", last_error: "meta 400 code=131026", alerted_at: null }] });
    expect(await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW })).toMatchObject({ ok: true, dead: 1 });
  });

  it("falla el marcado de alerted_at tras enviar -> ok false con motivo (no exito silencioso)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { asDb } = setup({
      events: [ev(1, "ambiguous")],
      fail: ({ table, op }) => (table === "contact_match_events" && op === "update" ? { code: "57014", message: "x" } : null),
    });
    const r = await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW });
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, reason: "mark_alerted_failed" });
  });

  it("correos de hora preferida agotados (5 intentos) -> en el mismo correo, y no se repiten", async () => {
    const { db, asDb } = setup({
      time: [
        { id: 31, deal_id: "d-31", attempts: 5, email_sent_at: null, last_error: "agent_without_email" },
        { id: 32, deal_id: "d-32", attempts: 2, email_sent_at: null, last_error: "send_failed" },
        { id: 33, deal_id: "d-33", attempts: 6, email_sent_at: null, last_error: "agent_without_email" },
      ],
    });
    const r = await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW });
    expect(r).toMatchObject({ ok: true, time: 1 });
    const text = sendAgentEmail.mock.calls[0][0].text;
    expect(text).toContain("/dashboard/pipeline/d-31");
    expect(text).toContain("agent_without_email");
    expect(text).not.toContain("d-32");
    expect(text).not.toContain("d-33");
    expect(db.tables.agent_time_notifications.find((t) => t.id === 31)?.attempts).toBe(6);
  });

  it("envio fallido -> no marca nada y la siguiente corrida reintenta sin esperar 30 min", async () => {
    sendAgentEmail.mockResolvedValue(false);
    const { db, asDb } = setup({ events: [ev(1, "ambiguous")] });
    const r = await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW });
    expect(r).toMatchObject({ ok: false });
    expect(db.tables.contact_match_events[0].alerted_at).toBeNull();
    sendAgentEmail.mockResolvedValue(true);
    expect((await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW + 60_000 })).ok).toBe(true);
    expect(sendAgentEmail).toHaveBeenCalledTimes(2);
  });

  it("dentro de 30 min del ultimo envio -> no envia", async () => {
    const { asDb } = setup({ events: [ev(1, "ambiguous")], lastAt: new Date(NOW - MATCH_ALERT_EVERY_MS + 60_000).toISOString() });
    const r = await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW });
    expect(r.reason).toBe("cooldown");
    expect(sendAgentEmail).not.toHaveBeenCalled();
  });

  it("pasados 30 min -> envia", async () => {
    const { asDb } = setup({ events: [ev(1, "ambiguous")], lastAt: new Date(NOW - MATCH_ALERT_EVERY_MS - 1).toISOString() });
    expect((await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW })).ok).toBe(true);
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
  });

  it("nada que alertar -> no envia ni toca el cooldown", async () => {
    const { db, asDb } = setup({ events: [ev(1, "variant")] });
    const r = await sendGroupedMatchAlerts(asDb, { to: TO, now: NOW });
    expect(r).toMatchObject({ ok: true, events: 0, dead: 0 });
    expect(sendAgentEmail).not.toHaveBeenCalled();
    expect(db.tables.agency_config).toHaveLength(0);
  });

  it("dos corridas solapadas -> 1 solo correo (reclamo del cooldown)", async () => {
    const { asDb } = setup({ events: [ev(1, "ambiguous")], lastAt: "2026-10-01T00:00:00Z" });
    await Promise.all([sendGroupedMatchAlerts(asDb, { to: TO, now: NOW }), sendGroupedMatchAlerts(asDb, { to: TO, now: NOW })]);
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
  });

  it("dos corridas solapadas sin fila de cooldown previa -> 1 solo correo", async () => {
    const { asDb } = setup({ events: [ev(1, "ambiguous")] });
    await Promise.all([sendGroupedMatchAlerts(asDb, { to: TO, now: NOW }), sendGroupedMatchAlerts(asDb, { to: TO, now: NOW })]);
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
  });
});
