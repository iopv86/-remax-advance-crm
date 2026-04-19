import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { ProposalsClient } from "./proposals-client";

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ProposalRow {
  id: string;
  slug: string;
  title: string | null;
  message: string | null;
  contact_name: string | null;
  property_ids: string[];
  view_count: number;
  created_at: string;
  property_views: { property_id: string | null; event_type: string }[];
}

export default async function ProposalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await service
    .from("agents")
    .select("id")
    .eq("email", user.email!)
    .single();

  if (!agent) return <ProposalsClient proposals={[]} />;

  const { data: proposals } = await service
    .from("property_proposals")
    .select("id, slug, title, message, contact_name, property_ids, view_count, created_at")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!proposals?.length) return <ProposalsClient proposals={[]} />;

  // Fetch view events for all proposals
  const proposalIds = proposals.map((p) => p.id);
  const { data: views } = await service
    .from("proposal_views")
    .select("proposal_id, property_id, event_type")
    .in("proposal_id", proposalIds);

  const viewsByProposal = new Map<string, { property_id: string | null; event_type: string }[]>();
  for (const v of views ?? []) {
    const arr = viewsByProposal.get(v.proposal_id) ?? [];
    arr.push({ property_id: v.property_id, event_type: v.event_type });
    viewsByProposal.set(v.proposal_id, arr);
  }

  const rows: ProposalRow[] = proposals.map((p) => ({
    ...p,
    property_ids: p.property_ids as string[],
    property_views: viewsByProposal.get(p.id) ?? [],
  }));

  return <ProposalsClient proposals={rows} />;
}
