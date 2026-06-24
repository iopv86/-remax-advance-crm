import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { DealDetailClient } from "./deal-detail-client";
import type { Deal, DealStage, Task, DealParty, DealInstallment } from "@/lib/types";
import type { DealActivity } from "./deal-activity";

interface StageHistoryEntry {
  id: string;
  from_stage: DealStage | null;
  to_stage: DealStage;
  changed_by: string | null;
  changed_by_system: boolean;
  notes: string | null;
  created_at: string;
  agent?: { full_name: string | null } | null;
}

export default async function DealDetailPage({
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

  const [dealResult, historyResult, tasksResult, activitiesResult, partiesResult, installmentsResult] = await Promise.all([
    supabase
      .from("deals")
      .select(
        `id, contact_id, property_id, agent_id, stage, deal_value, currency,
         commission_percentage, commission_value, expected_close_date,
         actual_close_date, lost_reason, notes, priority, created_at, updated_at,
         contact:contacts(id, first_name, last_name, email, phone,
           property_types, operation_type, condition, desired_amenities, bedrooms,
           timeline, purpose, payment_method, preferred_locations,
           meta_campaign_id, meta_campaign_name, meta_adset_id, meta_adset_name,
           meta_ad_id, meta_ad_name, meta_form_name, meta_platform),
         property:properties(id, title, city, sector, price, currency),
         agent:agents(id, full_name, email)`
      )
      .eq("id", deal_id)
      .single(),

    supabase
      .from("deal_stage_history")
      .select(
        `id, from_stage, to_stage, changed_by, changed_by_system, notes, created_at,
         agent:agents!deal_stage_history_changed_by_fkey(full_name)`
      )
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("tasks")
      .select("id, title, description, due_date, priority, status, completed_at, created_at")
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("activities")
      .select("id, contact_id, deal_id, agent_id, activity_type, title, description, scheduled_at, completed_at, duration_minutes, is_automated, created_at")
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: false })
      .limit(100),

    // PII parties (co-buyer / referrer). RLS returns [] to agents who don't own
    // this deal; only owner + admin/manager reach this page anyway (gate below).
    supabase
      .from("deal_parties")
      .select("id, deal_id, party_type, full_name, phone, relationship, notes, created_at, updated_at")
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: true }),

    // Payment plan installments. RLS returns [] to agents who don't own this deal.
    supabase
      .from("deal_installments")
      .select("id, deal_id, kind, label, amount, currency, due_date, status, paid_date, sort_order, notes, created_at, updated_at")
      .eq("deal_id", deal_id)
      .order("sort_order", { ascending: true }),
  ]);

  if (dealResult.error || !dealResult.data) notFound();

  const session = await getSessionAgent();
  if (!isPrivileged(session.role) && dealResult.data.agent_id !== session.agentId) notFound();

  return (
    <DealDetailClient
      deal={dealResult.data as unknown as Deal & { property?: { id: string; title: string; city?: string; sector?: string } | null }}
      history={(historyResult.data ?? []) as unknown as StageHistoryEntry[]}
      initialTasks={(tasksResult.data ?? []) as unknown as Task[]}
      initialActivities={(activitiesResult.data ?? []) as unknown as DealActivity[]}
      parties={(partiesResult.data ?? []) as unknown as DealParty[]}
      installments={(installmentsResult.data ?? []) as unknown as DealInstallment[]}
      today={new Date().toISOString().slice(0, 10)}
      agentId={session.agentId}
    />
  );
}
