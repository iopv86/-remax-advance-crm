import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { DashboardClient } from "./dashboard-client";

// ─── Data types ──────────────────────────────────────────────────────────────
export interface KPIData {
  revenueMth: number;
  revenuePrev: number;
  activeDeals: number;
  pipelineValue: number;
  newContactsMth: number;
  newContactsPrev: number;
  conversionRate: number;
  conversionPrev: number;
  tasksDueToday: number;
  tasksOverdue: number;
}

export interface PipelineStageData {
  stage: string;
  label: string;
  count: number;
  value: number;
}

export interface RevenuePoint {
  month: string;    // e.g. "Ene"
  value: number;
}

export interface ActivityItem {
  id: string;
  type: "contact" | "deal";
  name: string;
  action: string;
  ts: string;
  source?: string;
  stage?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  overdue: boolean;
  contactName: string | null;
  contactPhone: string | null;
}

export interface DashboardData {
  session: { agentId: string; fullName: string; role: string };
  kpi: KPIData;
  pipeline: PipelineStageData[];
  revenue6m: RevenuePoint[];
  activity: ActivityItem[];
  tasks: TaskItem[];
}

const STAGE_LABELS: Record<string, string> = {
  lead_captured:      "Lead",
  qualified:          "Calificado",
  contacted:          "Contactado",
  showing_scheduled:  "Visita agendada",
  showing_done:       "Visita realizada",
  offer_made:         "Oferta",
  negotiation:        "Negociación",
  promesa_de_venta:   "Promesa",
  financiamiento:     "Financiamiento",
  contract:           "Contrato",
  due_diligence:      "Due diligence",
  closed_won:         "Cerrado/Ganado",
};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthRange(offsetMonths: number): { start: string; end: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
  return { start, end };
}

export default async function DashboardPage() {
  const session = await getSessionAgent();
  const supabase = await createClient();
  const privileged = isPrivileged(session.role);

  const mth = monthRange(0);
  const prev = monthRange(-1);
  const today = new Date().toISOString().split("T")[0];

  // ─── Helper: apply agent scope ────────────────────────────────────────────
  function agentScope<T extends object>(query: T): T {
    if (privileged) return query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (query as any).eq("agent_id", session.agentId) as T;
  }

  // ─── Revenue this month / last month (closed_won deals) ───────────────────
  const [revenueThisQ, revenuePrevQ] = await Promise.all([
    agentScope(
      supabase
        .from("deals")
        .select("deal_value")
        .eq("stage", "closed_won")
        .gte("actual_close_date", mth.start)
        .lte("actual_close_date", mth.end)
    ),
    agentScope(
      supabase
        .from("deals")
        .select("deal_value")
        .eq("stage", "closed_won")
        .gte("actual_close_date", prev.start)
        .lte("actual_close_date", prev.end)
    ),
  ]);

  const revenueMth  = (revenueThisQ.data ?? []).reduce((s, d) => s + (d.deal_value ?? 0), 0);
  const revenuePrev = (revenuePrevQ.data ?? []).reduce((s, d) => s + (d.deal_value ?? 0), 0);

  // ─── Active deals + pipeline value ────────────────────────────────────────
  const activeDealsQ = await agentScope(
    supabase
      .from("deals")
      .select("deal_value, stage")
      .not("stage", "in", '("closed_won","closed_lost")')
  );

  const activeDeals  = (activeDealsQ.data ?? []).length;
  const pipelineValue = (activeDealsQ.data ?? []).reduce((s, d) => s + (d.deal_value ?? 0), 0);

  // ─── New contacts this month / last month ─────────────────────────────────
  const [contactsMthQ, contactsPrevQ] = await Promise.all([
    agentScope(
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", mth.start)
        .lte("created_at", mth.end)
    ),
    agentScope(
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", prev.start)
        .lte("created_at", prev.end)
    ),
  ]);

  const newContactsMth  = contactsMthQ.count ?? 0;
  const newContactsPrev = contactsPrevQ.count ?? 0;

  // ─── Conversion rate (won / total closed this month) ──────────────────────
  const closedMthQ = await agentScope(
    supabase
      .from("deals")
      .select("stage", { count: "exact", head: false })
      .in("stage", ["closed_won", "closed_lost"])
      .gte("actual_close_date", mth.start)
      .lte("actual_close_date", mth.end)
  );

  const closedPrevQ = await agentScope(
    supabase
      .from("deals")
      .select("stage")
      .in("stage", ["closed_won", "closed_lost"])
      .gte("actual_close_date", prev.start)
      .lte("actual_close_date", prev.end)
  );

  const closedMthData = closedMthQ.data ?? [];
  const wonMth   = closedMthData.filter((d) => d.stage === "closed_won").length;
  const totalMth = closedMthData.length;
  const convRate = totalMth > 0 ? Math.round((wonMth / totalMth) * 1000) / 10 : 0;

  const closedPrevData = closedPrevQ.data ?? [];
  const wonPrev   = closedPrevData.filter((d) => d.stage === "closed_won").length;
  const totalPrev = closedPrevData.length;
  const convPrev = totalPrev > 0 ? Math.round((wonPrev / totalPrev) * 1000) / 10 : 0;

  // ─── Tasks due today + overdue ────────────────────────────────────────────
  const tasksQ = await agentScope(
    supabase
      .from("tasks")
      .select("id, title, due_date, priority, status, contact:contacts(first_name, last_name, phone)")
      .eq("status", "pending")
      .lte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(10)
  );

  const allTasks = tasksQ.data ?? [];
  const tasksDueToday = allTasks.filter((t) => t.due_date === today).length;
  const tasksOverdue  = allTasks.filter((t) => t.due_date && t.due_date < today).length;

  const tasks: TaskItem[] = allTasks.map((t) => {
    const c = t.contact as { first_name?: string; last_name?: string; phone?: string } | null;
    return {
      id: t.id,
      title: t.title,
      dueDate: t.due_date ?? null,
      priority: t.priority as TaskItem["priority"],
      overdue: !!t.due_date && t.due_date < today,
      contactName: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || null : null,
      contactPhone: c?.phone ?? null,
    };
  });

  // ─── Recent activity (last 10 contacts + deals) ───────────────────────────
  const [recentContactsQ, recentDealsQ] = await Promise.all([
    agentScope(
      supabase
        .from("contacts")
        .select("id, first_name, last_name, source, created_at")
        .order("created_at", { ascending: false })
        .limit(10)
    ),
    agentScope(
      supabase
        .from("deals")
        .select("id, stage, updated_at, contact:contacts(first_name, last_name)")
        .order("updated_at", { ascending: false })
        .limit(10)
    ),
  ]);

  const activityItems: ActivityItem[] = [
    ...(recentContactsQ.data ?? []).map((c) => ({
      id: `c-${c.id}`,
      type: "contact" as const,
      name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Sin nombre",
      action: "Nuevo contacto",
      ts: c.created_at,
      source: c.source ?? undefined,
    })),
    ...(recentDealsQ.data ?? []).map((d) => {
      const c = d.contact as { first_name?: string; last_name?: string } | null;
      return {
        id: `d-${d.id}`,
        type: "deal" as const,
        name: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Sin nombre" : "Sin contacto",
        action: `Deal: ${STAGE_LABELS[d.stage] ?? d.stage}`,
        ts: d.updated_at ?? "",
        stage: d.stage,
      };
    }),
  ]
    .sort((a, b) => (b.ts > a.ts ? 1 : -1))
    .slice(0, 10);

  // ─── Pipeline stage breakdown ──────────────────────────────────────────────
  const allActiveQ = await agentScope(
    supabase
      .from("deals")
      .select("stage, deal_value")
      .not("stage", "in", '("closed_lost")')
  );

  const stageMap: Record<string, { count: number; value: number }> = {};
  for (const d of allActiveQ.data ?? []) {
    const s = d.stage ?? "lead_captured";
    if (!stageMap[s]) stageMap[s] = { count: 0, value: 0 };
    stageMap[s].count++;
    stageMap[s].value += d.deal_value ?? 0;
  }

  const STAGE_ORDER = [
    "lead_captured", "qualified", "contacted", "showing_scheduled", "showing_done",
    "offer_made", "negotiation", "promesa_de_venta", "financiamiento", "contract",
    "due_diligence", "closed_won",
  ];

  const pipeline: PipelineStageData[] = STAGE_ORDER.filter((s) => stageMap[s]?.count > 0).map((s) => ({
    stage: s,
    label: STAGE_LABELS[s] ?? s,
    count: stageMap[s]?.count ?? 0,
    value: stageMap[s]?.value ?? 0,
  }));

  // ─── Revenue last 6 months ────────────────────────────────────────────────
  const revenue6mPromises = Array.from({ length: 6 }, (_, i) => {
    const offset = -(5 - i);
    const range = monthRange(offset);
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const label = MONTH_NAMES[d.getMonth()];
    return agentScope(
      supabase
        .from("deals")
        .select("deal_value")
        .eq("stage", "closed_won")
        .gte("actual_close_date", range.start)
        .lte("actual_close_date", range.end)
    ).then((q) => ({
      month: label,
      value: (q.data ?? []).reduce((s, x) => s + (x.deal_value ?? 0), 0),
    }));
  });

  const revenue6m: RevenuePoint[] = await Promise.all(revenue6mPromises);

  const data: DashboardData = {
    session: { agentId: session.agentId, fullName: session.fullName, role: session.role },
    kpi: {
      revenueMth, revenuePrev, activeDeals, pipelineValue,
      newContactsMth, newContactsPrev, conversionRate: convRate, conversionPrev: convPrev,
      tasksDueToday, tasksOverdue,
    },
    pipeline,
    revenue6m,
    activity: activityItems,
    tasks,
  };

  return <DashboardClient data={data} />;
}
