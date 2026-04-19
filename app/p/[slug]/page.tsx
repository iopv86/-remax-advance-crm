import { notFound } from "next/navigation";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Property } from "@/lib/types";
import { ProposalPublicClient } from "./proposal-public-client";

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Agent {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
}

export interface ProposalData {
  id: string;
  slug: string;
  title: string | null;
  message: string | null;
  contact_name: string | null;
  agent: Agent;
  properties: Property[];
}

export default async function ProposalPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!/^[a-z0-9]{6,20}$/.test(slug)) notFound();

  const { data: proposal } = await service
    .from("property_proposals")
    .select("id, slug, title, message, contact_name, property_ids, agent_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!proposal) notFound();

  const [agentResult, propertiesResult] = await Promise.all([
    service
      .from("agents")
      .select("id, full_name, email, phone, avatar_url")
      .eq("id", proposal.agent_id)
      .single(),
    service
      .from("properties")
      .select("*")
      .in("id", proposal.property_ids as string[]),
  ]);

  if (agentResult.error || !agentResult.data) notFound();

  // Preserve original property order from the proposal
  const propMap = new Map(
    (propertiesResult.data ?? []).map((p) => [p.id, p])
  );
  const properties = (proposal.property_ids as string[])
    .map((id) => propMap.get(id))
    .filter(Boolean) as Property[];

  const data: ProposalData = {
    id: proposal.id,
    slug: proposal.slug,
    title: proposal.title,
    message: proposal.message,
    contact_name: proposal.contact_name,
    agent: agentResult.data as Agent,
    properties,
  };

  return <ProposalPublicClient data={data} />;
}
