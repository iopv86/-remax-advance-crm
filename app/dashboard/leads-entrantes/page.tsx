import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { LeadsEntrantesClient, type IncomingLead, type AgentSummary } from "./leads-entrantes-client";

// Leads en etapa de holding (nuevo_sin_contactar): asignados pero no trabajados.
// Da visibilidad de "qué entró, quién lo tiene y qué hizo" sin contaminar el pipeline.
export default async function LeadsEntrantesPage() {
  const supabase = await createClient();
  const session = await getSessionAgent();
  const privileged = isPrivileged(session.role);

  let dealsQuery = supabase
    .from("deals")
    .select(
      "id, contact_id, agent_id, stage_entered_at, created_at, " +
        "contact:contacts(first_name, last_name, phone, source, lead_classification, assigned_at), " +
        "agent:agents(full_name)"
    )
    .eq("stage", "nuevo_sin_contactar")
    .order("stage_entered_at", { ascending: true }); // más antiguos primero (peor aging)

  if (!privileged) dealsQuery = dealsQuery.eq("agent_id", session.agentId);

  const { data: dealsRaw } = await dealsQuery;

  type DealRow = {
    id: string;
    contact_id: string;
    agent_id: string;
    stage_entered_at: string | null;
    created_at: string;
    contact: {
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      source: string | null;
      lead_classification: string | null;
      assigned_at: string | null;
    } | null;
    agent: { full_name: string | null } | null;
  };
  const deals = (dealsRaw as unknown as DealRow[]) ?? [];

  // First human touch per contact: earliest non-automated activity.
  const contactIds = deals.map((d) => d.contact_id);
  const firstTouch: Record<string, string> = {};
  if (contactIds.length > 0) {
    const { data: acts } = await supabase
      .from("activities")
      .select("contact_id, created_at, is_automated")
      .in("contact_id", contactIds)
      .eq("is_automated", false)
      .order("created_at", { ascending: true });
    for (const a of (acts ?? []) as Array<{ contact_id: string; created_at: string }>) {
      if (!firstTouch[a.contact_id]) firstTouch[a.contact_id] = a.created_at;
    }
  }

  const now = Date.now();
  const leads: IncomingLead[] = deals.map((d) => {
    const assignedAt = d.contact?.assigned_at ?? d.stage_entered_at ?? d.created_at;
    const enteredAt = d.stage_entered_at ?? d.created_at;
    const touchAt = firstTouch[d.contact_id] ?? null;
    const agingHours = Math.max(0, (now - new Date(enteredAt).getTime()) / 3_600_000);
    const firstTouchHours =
      touchAt && assignedAt
        ? Math.max(0, (new Date(touchAt).getTime() - new Date(assignedAt).getTime()) / 3_600_000)
        : null;
    const name = `${d.contact?.first_name ?? ""} ${d.contact?.last_name ?? ""}`.trim() || "Sin nombre";
    return {
      dealId: d.id,
      contactId: d.contact_id,
      agentId: d.agent_id,
      agentName: d.agent?.full_name ?? "Sin agente",
      name,
      phone: d.contact?.phone ?? null,
      source: d.contact?.source ?? null,
      classification: d.contact?.lead_classification ?? null,
      assignedAt,
      agingHours,
      touched: touchAt !== null,
      firstTouchHours,
    };
  });

  // Per-agent summary (privileged sees all agents; agent sees only itself).
  const byAgent: Record<string, AgentSummary> = {};
  for (const l of leads) {
    if (!byAgent[l.agentId]) {
      byAgent[l.agentId] = { agentId: l.agentId, agentName: l.agentName, assigned: 0, untouched: 0, touched: 0 };
    }
    const s = byAgent[l.agentId];
    s.assigned++;
    if (l.touched) s.touched++;
    else s.untouched++;
  }
  const summaries = Object.values(byAgent).sort((a, b) => b.untouched - a.untouched);

  return (
    <LeadsEntrantesClient
      leads={leads}
      summaries={summaries}
      privileged={privileged}
    />
  );
}
