import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
const DB = { marker: "db" };
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => DB }));
const order: string[] = [];
const sweep = vi.fn();
const drain = vi.fn();
const time = vi.fn();
const alert = vi.fn();
const track = (name: string, fn: (...a: unknown[]) => unknown) => (...a: unknown[]) => { order.push(name); return fn(...a); };
vi.mock("@/lib/prefilled-sweep", () => ({ assignStalePrefilledContacts: (...a: unknown[]) => track("sweep", sweep)(...a) }));
vi.mock("@/lib/agent-notifications", () => ({
  drainAgentNotifications: (...a: unknown[]) => track("drain", drain)(...a),
  drainTimeNotifications: (...a: unknown[]) => track("time", time)(...a),
}));
vi.mock("@/lib/match-alerts", () => ({ sendGroupedMatchAlerts: (...a: unknown[]) => track("alert", alert)(...a) }));

import { GET } from "@/app/api/cron/agent-notifications/route";

const req = (auth?: string) => new Request("https://x/api/cron/agent-notifications", { headers: auth ? { authorization: auth } : {} });
const ok = () => GET(req("Bearer s3cr3t"));

beforeEach(() => {
  order.length = 0;
  vi.stubEnv("CRON_SECRET", "s3cr3t");
  vi.stubEnv("LEAD_ALERT_EMAIL", "alertas@test.local");
  sweep.mockResolvedValue({ candidates: 1, swept: 1, sweptNoAgent: 0, errors: 0 });
  drain.mockResolvedValue({ claimed: 2, sent: 1, failed: 1, dead: 0, lostLease: 0, markErrors: 0 });
  time.mockResolvedValue({ claimed: 1, sent: 1, failed: 0 });
  alert.mockResolvedValue({ ok: true, reason: "nothing_to_alert", events: 0, dead: 0, time: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("GET /api/cron/agent-notifications", () => {
  it("sin cabecera -> 401 y no ejecuta nada", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(order).toEqual([]);
  });

  it("secreto equivocado -> 401", async () => {
    expect((await GET(req("Bearer otro"))).status).toBe(401);
  });

  it("CRON_SECRET ausente en el entorno -> 401 aunque llegue 'Bearer '", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
  });

  it("con el secreto -> 200 con todos los contadores", async () => {
    const res = await ok();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true, swept: 1, sweptNoAgent: 0, sweepErrors: 0, claimed: 2, sent: 1, failed: 1, dead: 0, lostLease: 0,
      markErrors: 0, timeEmailsSent: 1, timeEmailsFailed: 0, alertOk: true, alertReason: "nothing_to_alert", errors: [],
    });
  });

  it("orden sweep -> drain -> time -> alert, con el cliente, limites y LEAD_ALERT_EMAIL", async () => {
    await ok();
    expect(order).toEqual(["sweep", "drain", "time", "alert"]);
    expect(sweep).toHaveBeenCalledWith(DB);
    expect(drain).toHaveBeenCalledWith(DB, { limit: 5 });
    expect(time).toHaveBeenCalledWith(DB, { limit: 20 });
    expect(alert).toHaveBeenCalledWith(DB, { to: "alertas@test.local" });
  });

  it("una etapa que lanza se informa y las siguientes corren igual", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    drain.mockRejectedValue(new Error("boom"));
    const body = await (await ok()).json();
    expect(body.ok).toBe(false);
    expect(body.errors).toEqual(["drain threw"]);
    expect(order).toEqual(["sweep", "drain", "time", "alert"]);
  });

  it("el error devuelto por una etapa (claim, mark) tambien se informa", async () => {
    drain.mockResolvedValue({ claimed: 0, sent: 0, failed: 0, dead: 0, lostLease: 0, markErrors: 0, error: "claim: 57014" });
    expect(await (await ok()).json()).toMatchObject({ ok: false, errors: ["drain: claim: 57014"] });
  });

  it("alerta que no salio (send_failed, LEAD_ALERT_EMAIL ausente) -> ok false", async () => {
    alert.mockResolvedValue({ ok: false, reason: "send_failed", events: 3, dead: 0, time: 0 });
    expect(await (await ok()).json()).toMatchObject({ ok: false, alertOk: false, errors: ["alert: send_failed"] });
  });

  it("filas del barrido con error -> ok false", async () => {
    sweep.mockResolvedValue({ candidates: 2, swept: 1, sweptNoAgent: 0, errors: 1 });
    expect(await (await ok()).json()).toMatchObject({ ok: false, sweepErrors: 1, errors: ["sweep: 1 fila(s) con error"] });
  });

  it("cooldown y nada que alertar no son errores", async () => {
    alert.mockResolvedValue({ ok: true, reason: "cooldown", events: 0, dead: 0, time: 0 });
    expect((await (await ok()).json()).ok).toBe(true);
  });
});
