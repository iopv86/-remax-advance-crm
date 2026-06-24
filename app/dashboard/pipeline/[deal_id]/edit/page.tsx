import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import type { Deal, DealParty, DealInstallment } from "@/lib/types";
import { DealEditForm } from "./deal-edit-form";

export default async function DealEditPage({
  params,
}: {
  params: Promise<{ deal_id: string }>;
}) {
  const { deal_id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const session = await getSessionAgent();
  const privileged = isPrivileged(session.role);

  // Non-privileged agents only pick from their own contacts (defense-in-depth
  // alongside RLS); admins/managers see all.
  let contactsQuery = supabase
    .from("contacts")
    .select("id, first_name, last_name, agent_id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!privileged) contactsQuery = contactsQuery.eq("agent_id", session.agentId);

  const [{ data: deal }, { data: contacts }, { data: properties }, { data: parties }, { data: installments }] =
    await Promise.all([
      supabase
        .from("deals")
        .select(
          `id, contact_id, property_id, agent_id, stage, deal_value, currency,
           commission_percentage, commission_value, expected_close_date,
           actual_close_date, notes, priority, created_at`
        )
        .eq("id", deal_id)
        .single(),
      contactsQuery,
      supabase
        .from("properties")
        .select("id, title, city, sector")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(300),
      // PII parties — RLS returns [] to agents who don't own this deal.
      supabase
        .from("deal_parties")
        .select("id, deal_id, party_type, full_name, phone, relationship, notes, created_at, updated_at")
        .eq("deal_id", deal_id)
        .order("created_at", { ascending: true }),
      // Payment plan installments — RLS returns [] to agents who don't own this deal.
      supabase
        .from("deal_installments")
        .select("id, deal_id, kind, label, amount, currency, due_date, status, paid_date, sort_order, notes, created_at, updated_at")
        .eq("deal_id", deal_id)
        .order("sort_order", { ascending: true }),
    ]);

  if (!deal) notFound();
  if (!privileged && deal.agent_id !== session.agentId) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 20px" }}>
      <DealEditForm
        deal={deal as Deal}
        contacts={(contacts ?? []) as { id: string; first_name: string | null; last_name: string | null; agent_id: string | null }[]}
        properties={(properties ?? []) as { id: string; title: string; city: string | null; sector: string | null }[]}
        initialParties={(parties ?? []) as DealParty[]}
        initialInstallments={(installments ?? []) as DealInstallment[]}
        currentAgentId={session.agentId}
      />
    </div>
  );
}
