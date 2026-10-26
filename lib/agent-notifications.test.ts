import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb } from "@/tests/unit/fake-db";

vi.mock("server-only", () => ({}));
const sendAgentEmail = vi.fn<(a: { to: string; subject: string; text: string }) => Promise<boolean>>();
vi.mock("@/lib/email", () => ({ sendAgentEmail: (a: { to: string; subject: string; text: string }) => sendAgentEmail(a) }));

import {
  drainAgentNotifications, drainTimeNotifications, buildAgentTemplateParams, type TemplateContact,
} from "@/lib/agent-notifications";

type Db = Parameters<typeof drainAgentNotifications>[0];

const TOKEN = "tok-secreto-de-prueba";
const AGENT = { id: "agent-1", phone: "+1 809 555 0199", full_name: "Joanny Mejia", email: "joanny@test.local" };
const DEAL = { id: "deal-1", agent_id: AGENT.id, contact_id: "contact-1" };
const CONTACT: TemplateContact & { id: string } = {
  id: "contact-1", first_name: "Maria", last_name: "Perez", phone: "+18095550101", whatsapp_number: "+18095550101",
  budget_min: 72500, budget_max: 80000, budget_currency: "USD", meta_form_name: "Palmas de San Pedro",
  source_detail: null, lead_form_answers: null, preferred_contact_time: null,
};

interface Claimed { id: number; deal_id: string; attempts: number; email_sent_at: string | null }
const claimedRow = (o: Partial<Claimed> = {}): Claimed => ({ id: 7, deal_id: DEAL.id, attempts: 1, email_sent_at: null, ...o });

function setup(o: {
  claimed?: Claimed[]; claimError?: boolean; markReturns?: boolean; agent?: Partial<typeof AGENT>;
  contact?: Partial<TemplateContact>;
} = {}) {
  const marks: Record<string, unknown>[] = [];
  const db = fakeDb({
    tables: {
      deals: [DEAL],
      contacts: [{ ...CONTACT, ...o.contact }],
      agents: [{ ...AGENT, ...o.agent }],
    },
    rpc: {
      claim_agent_lead_notifications: () =>
        o.claimError ? { data: null, error: { code: "57014", message: "timeout" } } : { data: o.claimed ?? [claimedRow()], error: null },
      mark_agent_lead_notification: (args) => { marks.push(args); return { data: o.markReturns ?? true, error: null }; },
    },
  });
  return { db, marks, asDb: db as unknown as Db };
}

const fetchMock = vi.fn<typeof fetch>();
// Una Response nueva por llamada: un cuerpo solo se puede leer una vez.
const metaReply = (status: number, body: unknown) =>
  fetchMock.mockImplementation(async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.stubEnv("META_ACCESS_TOKEN", TOKEN);
  vi.stubEnv("META_PHONE_NUMBER_ID", "1112223334");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  sendAgentEmail.mockReset();
  sendAgentEmail.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("drainAgentNotifications", () => {
  it("200 con messages[0].id -> mark ok con el id y el agente del DEAL", async () => {
    metaReply(200, { messages: [{ id: "wamid.ABC" }] });
    const { asDb, marks } = setup();
    const r = await drainAgentNotifications(asDb);
    expect(r).toMatchObject({ claimed: 1, sent: 1, failed: 0, dead: 0 });
    expect(marks).toEqual([{ p_id: 7, p_ok: true, p_error: null, p_wa_message_id: "wamid.ABC", p_agent_id: AGENT.id, p_email_sent: true }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/1112223334\/messages$/);
    expect(String(url)).not.toContain(TOKEN);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(init?.body));
    // E.164 con "+" (recomendado por Meta) y recipient_type, obligatorio en el esquema de /messages.
    expect(body.to).toBe("+18095550199");
    expect(body.recipient_type).toBe("individual");
    expect(body.template.name).toBe("ava_nuevo_lead_agente_v2");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text))
      .toEqual(["Maria Perez", "Palmas de San Pedro", "US$72.5k-80k", "No especificado", "+18095550101"]);
  });

  it("4xx de Meta -> failed con status y codigo, sin token ni telefono; nunca p_ok=true", async () => {
    // El mensaje simulado lleva el telefono y el token: si el codigo copiara error.message a p_error, se veria.
    metaReply(400, { error: {
      message: `(#132000) Recipient 18095550199 lead 18095550101 token ${TOKEN}`, code: 132000, error_subcode: 2494010,
      error_data: { details: "18095550199" },
    } });
    const { asDb, marks } = setup();
    const r = await drainAgentNotifications(asDb);
    expect(r).toMatchObject({ claimed: 1, sent: 0, failed: 1, dead: 0 });
    expect(marks).toHaveLength(1);
    expect(marks[0].p_ok).toBe(false);
    const err = String(marks[0].p_error);
    expect(err).toContain("400");
    expect(err).toContain("132000");
    expect(err).not.toContain(TOKEN);
    expect(err).not.toContain("8095550199");
    expect(err).not.toContain("8095550101");
  });

  it("200 sin messages[0].id -> failed (fetch no lanza ante un 200 vacio)", async () => {
    metaReply(200, {});
    const { asDb, marks } = setup();
    const r = await drainAgentNotifications(asDb);
    expect(r).toMatchObject({ sent: 0, failed: 1 });
    expect(marks[0].p_ok).toBe(false);
    expect(String(marks[0].p_error)).toContain("sin messages[0].id");
  });

  it("200 con cuerpo que no es JSON -> failed", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    const { asDb, marks } = setup();
    expect((await drainAgentNotifications(asDb)).failed).toBe(1);
    expect(marks[0].p_ok).toBe(false);
  });

  it("fetch lanza (red) -> failed", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const { asDb, marks } = setup();
    expect((await drainAgentNotifications(asDb)).failed).toBe(1);
    expect(marks[0].p_ok).toBe(false);
    expect(String(marks[0].p_error)).toContain("red");
  });

  it("Meta que no responde -> AbortController corta y queda failed", async () => {
    fetchMock.mockImplementation((_u, init) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const { asDb, marks } = setup();
    const r = await drainAgentNotifications(asDb, { timeoutMs: 20 });
    expect(r.failed).toBe(1);
    expect(String(marks[0].p_error)).toContain("timeout");
  });

  it("agente sin telefono -> failed agent_without_phone, sin peticion a Meta, y el correo sale igual una vez", async () => {
    const { asDb, marks } = setup({ agent: { phone: null as unknown as string } });
    const r = await drainAgentNotifications(asDb);
    expect(r.failed).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(marks[0]).toMatchObject({ p_ok: false, p_error: "agent_without_phone", p_email_sent: true });
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
    expect(sendAgentEmail.mock.calls[0][0].to).toBe(AGENT.email);
  });

  it("correo ya enviado en un intento anterior -> no se reenvia y p_email_sent=false", async () => {
    metaReply(200, { messages: [{ id: "wamid.X" }] });
    const { asDb, marks } = setup({ claimed: [claimedRow({ attempts: 2, email_sent_at: "2026-10-25T20:00:00Z" })] });
    await drainAgentNotifications(asDb);
    expect(sendAgentEmail).not.toHaveBeenCalled();
    expect(marks[0].p_email_sent).toBe(false);
  });

  it("correo que falla -> p_email_sent=false (se reintenta con la fila)", async () => {
    metaReply(400, { error: { code: 131026 } });
    sendAgentEmail.mockResolvedValue(false);
    const { asDb, marks } = setup();
    await drainAgentNotifications(asDb);
    expect(marks[0].p_email_sent).toBe(false);
  });

  it("el correo va SOLO a agents.email, nunca al correo del lead", async () => {
    metaReply(200, { messages: [{ id: "wamid.X" }] });
    const { asDb } = setup();
    await drainAgentNotifications(asDb);
    expect(sendAgentEmail.mock.calls.map((c) => c[0].to)).toEqual([AGENT.email]);
    expect(sendAgentEmail.mock.calls[0][0].text).toContain("/dashboard/pipeline/deal-1");
  });

  it("quinto intento fallido -> cuenta dead (mark lo deja en 'dead')", async () => {
    metaReply(400, { error: { code: 131026 } });
    const { asDb } = setup({ claimed: [claimedRow({ attempts: 5 })] });
    expect(await drainAgentNotifications(asDb)).toMatchObject({ failed: 0, dead: 1 });
  });

  it("claim con error -> no envia nada y devuelve el error (no '0 enviados' silencioso)", async () => {
    const { asDb, marks } = setup({ claimError: true });
    const r = await drainAgentNotifications(asDb);
    expect(r.error).toContain("57014");
    expect(r.claimed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(marks).toHaveLength(0);
  });

  it("mark devuelve false (lease perdido) -> se avisa con el id y se cuenta", async () => {
    metaReply(200, { messages: [{ id: "wamid.X" }] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { asDb } = setup({ markReturns: false });
    const r = await drainAgentNotifications(asDb);
    expect(r.lostLease).toBe(1);
    expect(warn.mock.calls.flat().join(" ")).toContain("7");
  });

  it("el aviso va al agente del DEAL aunque el contacto tenga otro dueno (Policy C)", async () => {
    metaReply(200, { messages: [{ id: "wamid.X" }] });
    const other = { id: "agent-contacto", phone: "+18095550777", full_name: "Otro Agente", email: "otro@test.local" };
    const { db, asDb, marks } = setup({ contact: { agent_id: other.id } as Partial<TemplateContact> });
    db.tables.agents.push(other);
    await drainAgentNotifications(asDb);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).to).toBe("+18095550199");
    expect(marks[0].p_agent_id).toBe(AGENT.id);
    expect(sendAgentEmail.mock.calls.map((c) => c[0].to)).toEqual([AGENT.email]);
  });

  it("mark con error -> se cuenta en markErrors y el resultado lleva error (no 'ok' silencioso)", async () => {
    metaReply(200, { messages: [{ id: "wamid.X" }] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({
      tables: { deals: [DEAL], contacts: [{ ...CONTACT } as Record<string, unknown>], agents: [AGENT] },
      rpc: {
        claim_agent_lead_notifications: () => ({ data: [claimedRow()], error: null }),
        mark_agent_lead_notification: () => ({ data: null, error: { code: "57014", message: "timeout" } }),
      },
    });
    const r = await drainAgentNotifications(db as unknown as Db);
    expect(r.markErrors).toBe(1);
    expect(r.error).toContain("mark");
  });

  it("una fila que lanza (respuestas del formulario malformadas, correo que rechaza) no corta el lote y se marca", async () => {
    metaReply(200, { messages: [{ id: "wamid.X" }] });
    sendAgentEmail.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { asDb, marks } = setup({
      claimed: [claimedRow({ id: 7 }), claimedRow({ id: 8 })],
      contact: { lead_form_answers: { fields: { no: "es un array" } } as unknown as TemplateContact["lead_form_answers"] },
    });
    const r = await drainAgentNotifications(asDb);
    expect(marks.map((m) => m.p_id)).toEqual([7, 8]);
    // El WhatsApp salio: se marca enviado aunque el correo de respaldo lanzara.
    expect(marks.every((m) => m.p_ok === true && m.p_email_sent === false)).toBe(true);
    expect(r.sent).toBe(2);
  });

  it.each([["1X10 (como en prod)", "18095550199"], ["10 digitos", "8095550199"]])(
    "telefono del agente %s -> to en E.164 +18095550199", async (_n, phone) => {
      metaReply(200, { messages: [{ id: "wamid.X" }] });
      const { asDb } = setup({ agent: { phone } });
      await drainAgentNotifications(asDb);
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).to).toBe("+18095550199");
    });

  it("200 con message_status retenido (held_for_quality_assessment) -> cuenta enviado y deja aviso en el log", async () => {
    metaReply(200, { messages: [{ id: "wamid.X", message_status: "held_for_quality_assessment" }] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { asDb } = setup();
    expect((await drainAgentNotifications(asDb)).sent).toBe(1);
    expect(warn.mock.calls.flat().join(" ")).toContain("held_for_quality_assessment");
  });

  it("telefono del agente que no es un numero (menos de 8 digitos) -> agent_phone_invalid sin peticion a Meta", async () => {
    const { asDb, marks } = setup({ agent: { phone: "ext 12" } });
    await drainAgentNotifications(asDb);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(marks[0].p_error).toBe("agent_phone_invalid");
  });

  it("deal inexistente -> failed deal_not_found, sin envio", async () => {
    const { asDb, marks } = setup({ claimed: [claimedRow({ deal_id: "otro" })] });
    expect((await drainAgentNotifications(asDb)).failed).toBe(1);
    expect(marks[0]).toMatchObject({ p_ok: false, p_error: "deal_not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("META_ACCESS_TOKEN ausente -> failed meta_not_configured, sin envio", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "");
    const { asDb, marks } = setup();
    expect((await drainAgentNotifications(asDb)).failed).toBe(1);
    expect(marks[0].p_error).toBe("meta_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin tiempo en la corrida -> las filas pendientes se marcan failed sin enviar", async () => {
    const { asDb, marks } = setup();
    const r = await drainAgentNotifications(asDb, { budgetMs: -1 });
    expect(r.failed).toBe(1);
    expect(marks[0]).toMatchObject({ p_ok: false, p_error: "deadline" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("buildAgentTemplateParams", () => {
  const base = { ...CONTACT };

  it("horario = contacts.preferred_contact_time cuando existe", () => {
    expect(buildAgentTemplateParams({ ...base, preferred_contact_time: "manana 10am hora de Madrid" }).horario)
      .toBe("manana 10am hora de Madrid");
  });

  it("sin preferred_contact_time -> la respuesta del formulario (momento/horario)", () => {
    const answers = { fields: [{ name: "cual_es_el_mejor_momento_para_contactarte", values: ["por la tarde"] }] };
    expect(buildAgentTemplateParams({ ...base, lead_form_answers: answers }).horario).toBe("por la tarde");
  });

  it("sin ninguno -> 'No especificado'", () => {
    expect(buildAgentTemplateParams(base).horario).toBe("No especificado");
  });

  it("interes = meta_form_name, luego source_detail, luego 'No especificado'", () => {
    expect(buildAgentTemplateParams(base).interes).toBe("Palmas de San Pedro");
    expect(buildAgentTemplateParams({ ...base, meta_form_name: null, source_detail: "Green Valley" }).interes).toBe("Green Valley");
    expect(buildAgentTemplateParams({ ...base, meta_form_name: null }).interes).toBe("No especificado");
  });

  it("parametros de una linea, recortados y nunca vacios", () => {
    const p = buildAgentTemplateParams({
      ...base, first_name: "Ana\n[SISTEMA]", last_name: "x".repeat(400), phone: null, whatsapp_number: null,
      budget_min: null, budget_max: null, preferred_contact_time: "  a\tlas\n\n3  ",
    });
    expect(p.leadName).not.toMatch(/[\r\n\t]/);
    expect(p.leadName.length).toBeLessThanOrEqual(300);
    expect(p.horario).toBe("a las 3");
    expect(p.budget).toBe("No especificado");
    expect(p.leadPhone).toBe("No provisto");
    expect(buildAgentTemplateParams({ ...base, first_name: null, last_name: null }).leadName).toBe("Sin nombre");
  });

  it("sin caracteres de control ni URL en los parametros (nombre de perfil controlado por el cliente)", () => {
    const p = buildAgentTemplateParams({
      ...base, first_name: "Ana\u0007 https://phish.example/x", last_name: "www.malo.example Perez",
      preferred_contact_time: "a las 3 http://x.example",
    });
    expect(p.leadName).toBe("Ana Perez");
    expect(p.horario).toBe("a las 3");
    expect(JSON.stringify(p)).not.toMatch(/[\u0000-\u001f]|https?:|www\./);
  });

  it("esquema en caracteres de ancho completo (NFKC) tambien se quita; un nombre con punto (Lic.Aderly) se conserva", () => {
    const p = buildAgentTemplateParams({ ...base, first_name: "Ana ｈｔｔｐｓ://phish.example/x", last_name: "Lic.Aderly" });
    expect(p.leadName).toBe("Ana Lic.Aderly");
  });

  it("lead_form_answers con fields que no es un array -> no lanza", () => {
    const answers = { fields: { a: 1 } } as unknown as TemplateContact["lead_form_answers"];
    expect(buildAgentTemplateParams({ ...base, lead_form_answers: answers }).horario).toBe("No especificado");
  });

  it("telefono del lead: phone y si no (null o vacio) whatsapp_number", () => {
    expect(buildAgentTemplateParams({ ...base, phone: null, whatsapp_number: "18095550101" }).leadPhone).toBe("18095550101");
    expect(buildAgentTemplateParams({ ...base, phone: "", whatsapp_number: "18095550101" }).leadPhone).toBe("18095550101");
  });

  it("recortar no deja medio emoji (surrogate suelto)", () => {
    const p = buildAgentTemplateParams({ ...base, first_name: "x".repeat(299) + "\u{1F600}", last_name: null });
    expect(JSON.stringify(p.leadName)).not.toMatch(/\\ud8[0-9a-f]{2}"/i);
    expect(p.leadName).toBe("x".repeat(299));
  });
});

describe("drainTimeNotifications (D14)", () => {
  function timeSetup(o: { rows?: Record<string, unknown>[]; agent?: Partial<typeof AGENT> } = {}) {
    const db = fakeDb({
      tables: {
        agent_time_notifications: o.rows ?? [
          { id: 1, deal_id: DEAL.id, preferred_contact_time: "manana a las 10", created_at: "2026-10-25T20:00:00Z",
            attempts: 0, email_sent_at: null, last_error: null },
        ],
        deals: [DEAL],
        contacts: [{ ...CONTACT } as Record<string, unknown>],
        agents: [{ ...AGENT, ...o.agent }],
      },
    });
    return { db, asDb: db as unknown as Db };
  }

  it("1 correo al agente del DEAL con la hora y el enlace; email_sent_at relleno; 0 peticiones a Meta", async () => {
    const { db, asDb } = timeSetup();
    const r = await drainTimeNotifications(asDb);
    expect(r).toMatchObject({ sent: 1, failed: 0 });
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
    const mail = sendAgentEmail.mock.calls[0][0];
    expect(mail.to).toBe(AGENT.email);
    expect(mail.subject).toBe("[CRM] Hora preferida de Maria");
    expect(mail.text).toContain("manana a las 10");
    expect(mail.text).toContain("/dashboard/pipeline/deal-1");
    expect(db.tables.agent_time_notifications[0].email_sent_at).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envio fallido -> attempts+1, sin email_sent_at, last_error; se reintenta con backoff (no al minuto)", async () => {
    sendAgentEmail.mockResolvedValue(false);
    const { db, asDb } = timeSetup();
    const T0 = Date.parse("2026-10-25T20:00:30Z");
    expect((await drainTimeNotifications(asDb, { now: T0 })).failed).toBe(1);
    const row = db.tables.agent_time_notifications[0];
    expect(row).toMatchObject({ attempts: 1, email_sent_at: null, last_error: "send_failed" });
    sendAgentEmail.mockResolvedValue(true);
    // attempts=1 -> espera 1 min desde created_at (20:00:00): a las 20:00:50 aun no toca.
    expect((await drainTimeNotifications(asDb, { now: Date.parse("2026-10-25T20:00:50Z") })).claimed).toBe(0);
    expect((await drainTimeNotifications(asDb, { now: Date.parse("2026-10-25T20:01:10Z") })).sent).toBe(1);
    expect(row.attempts).toBe(2);
  });

  it("error al LEER el deal o el agente -> reintentable (no se descarta con un motivo falso)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({
      tables: {
        agent_time_notifications: [{ id: 1, deal_id: DEAL.id, preferred_contact_time: "x", created_at: "2026-10-25T20:00:00Z",
          attempts: 0, email_sent_at: null, last_error: null }],
        deals: [DEAL], contacts: [{ ...CONTACT } as Record<string, unknown>], agents: [AGENT],
      },
      fail: ({ table, op }) => (table === "deals" && op === "select" ? { code: "57014", message: "timeout" } : null),
    });
    const r = await drainTimeNotifications(db as unknown as Db);
    expect(r.failed).toBe(1);
    expect(db.tables.agent_time_notifications[0]).toMatchObject({ attempts: 1, last_error: "read_error deals" });
    expect(sendAgentEmail).not.toHaveBeenCalled();
  });

  it("fila reclamada por otra corrida hace menos de 2 min (arrendamiento) -> no se toca; pasado el plazo, si", async () => {
    const now = Date.parse("2026-10-25T21:00:00Z");
    const leased = (agoMs: number) => [{ id: 1, deal_id: DEAL.id, preferred_contact_time: "x", created_at: "2026-10-25T20:00:00Z",
      attempts: 1, email_sent_at: null, last_error: `sending ${new Date(now - agoMs).toISOString()}` }];
    expect((await drainTimeNotifications(timeSetup({ rows: leased(30_000) }).asDb, { now })).claimed).toBe(0);
    expect((await drainTimeNotifications(timeSetup({ rows: leased(3 * 60_000) }).asDb, { now })).sent).toBe(1);
  });

  it("sin tiempo en la corrida -> no reclama mas filas", async () => {
    const { asDb } = timeSetup();
    expect((await drainTimeNotifications(asDb, { budgetMs: -1 })).claimed).toBe(0);
    expect(sendAgentEmail).not.toHaveBeenCalled();
  });

  it("con 5 intentos ya no se reintenta", async () => {
    const { asDb } = timeSetup({ rows: [{ id: 1, deal_id: DEAL.id, preferred_contact_time: "x", created_at: "2026-10-25T20:00:00Z",
      attempts: 5, email_sent_at: null, last_error: "send_failed" }] });
    expect((await drainTimeNotifications(asDb)).claimed).toBe(0);
    expect(sendAgentEmail).not.toHaveBeenCalled();
  });

  it("agente sin email -> last_error agent_without_email y sin reintento infinito", async () => {
    const { db, asDb } = timeSetup({ agent: { email: null as unknown as string } });
    await drainTimeNotifications(asDb);
    expect(sendAgentEmail).not.toHaveBeenCalled();
    expect(db.tables.agent_time_notifications[0]).toMatchObject({ last_error: "agent_without_email", attempts: 5 });
    await drainTimeNotifications(asDb);
    expect(sendAgentEmail).not.toHaveBeenCalled();
  });

  it("dos corridas solapadas -> 1 solo correo (reclamo condicionado a attempts)", async () => {
    const { asDb } = timeSetup();
    await Promise.all([drainTimeNotifications(asDb), drainTimeNotifications(asDb)]);
    expect(sendAgentEmail).toHaveBeenCalledTimes(1);
  });

  it("la hora y el nombre del cliente llegan al correo sin enlaces (mismo saneo que la plantilla)", async () => {
    const { db, asDb } = timeSetup({ rows: [{ id: 1, deal_id: DEAL.id, preferred_contact_time: "a las 10, ver https://phish.example/x",
      created_at: "2026-10-25T20:00:00Z", attempts: 0, email_sent_at: null, last_error: null }] });
    (db.tables.contacts[0] as Record<string, unknown>).first_name = "Ana www.malo.example";
    await drainTimeNotifications(asDb);
    const mail = sendAgentEmail.mock.calls[0][0];
    expect(mail.subject).toBe("[CRM] Hora preferida de Ana");
    expect(mail.text).toContain("a las 10, ver");
    expect(mail.text).not.toMatch(/phish|malo\.example/);
  });

  it("nombre del cliente con saltos de linea -> asunto de una linea", async () => {
    const { db, asDb } = timeSetup();
    (db.tables.contacts[0] as Record<string, unknown>).first_name = "Ana\r\nBcc: x@y.z";
    await drainTimeNotifications(asDb);
    expect(sendAgentEmail.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
  });
});
