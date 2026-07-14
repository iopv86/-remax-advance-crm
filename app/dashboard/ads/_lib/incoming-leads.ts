import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrivileged, type SessionAgent } from "@/lib/supabase/get-session-agent";

// Shared types for the Leads Entrantes tab. Imported with `import type` on the
// client so no server code is pulled into the browser bundle.
export interface IncomingLead {
  dealId: string;
  contactId: string;
  agentId: string;
  agentName: string;
  name: string;
  phone: string | null;
  source: string | null;
  classification: string | null;
  assignedAt: string;
  agingHours: number;
  touched: boolean;
  firstTouchHours: number | null;
}

export interface AgentSummary {
  agentId: string;
  agentName: string;
  assigned: number;
  untouched: number;
  touched: number;
}

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

// Leads en etapa de holding (nuevo_sin_contactar): asignados pero no trabajados.
// Da visibilidad de "qué entró, quién lo tiene y qué hizo" sin contaminar el pipeline.
// Solo admin/manager acceden a /dashboard/ads; el filtro por agent_id se conserva
// como defensa en profundidad (paridad con la ruta original).
export async function getIncomingLeads(
  supabase: SupabaseClient,
  session: SessionAgent
): Promise<{ leads: IncomingLead[]; summaries: AgentSummary[] }> {
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

  return { leads, summaries };
}
