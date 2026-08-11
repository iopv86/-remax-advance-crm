import { adminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof adminClient>;

/**
 * Outcomes that mean the lead is accounted for in the CRM. Anything else is a gap.
 *
 * "backfilled" covers the leads that were already ingested before this ledger
 * existed (seeded from contacts.meta_lead_id at deploy time). Without it the
 * first audit would report every pre-existing lead as missing, and an alert that
 * cries wolf on day one is an alert nobody reads on day thirty.
 */
export const HEALTHY_OUTCOMES = [
  "new_contact",
  "existing_contact_new_deal",
  "already_in_pipeline",
  "race_winner",
  "backfilled",
] as const;

export interface LeadIngestEvent {
  leadId: string;
  formId?: string | null;
  createdTime?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  agentId?: string | null;
  outcome: string;
  source: "poll" | "webhook" | "audit";
}

/**
 * Records what happened to one Meta lead. NEVER throws.
 *
 * The observer must not be able to break the thing it observes: a ledger write
 * failure has to degrade into a missing ledger row (which the reconciler then
 * reports as a gap) rather than into a lost lead. That trade is deliberate --
 * it swaps a silent false negative for a loud false positive.
 */
export async function recordLeadIngest(db: Db, e: LeadIngestEvent): Promise<void> {
  try {
    // Build the payload omitting null/undefined fields. PostgREST's
    // ON CONFLICT DO UPDATE only touches columns present in the payload, so a
    // later re-processing (e.g. "already_in_pipeline" on the 15-minute overlap)
    // cannot null out the contact_id recorded on first ingest.
    const payload: Record<string, unknown> = {
      lead_id: e.leadId,
      outcome: e.outcome,
      source: e.source,
      last_seen_at: new Date().toISOString(),
    };
    if (e.formId) payload.form_id = e.formId;
    if (e.createdTime) payload.created_time = e.createdTime;
    if (e.contactId) payload.contact_id = e.contactId;
    if (e.dealId) payload.deal_id = e.dealId;
    if (e.agentId) payload.agent_id = e.agentId;

    const { error } = await db
      .from("meta_lead_ingest")
      .upsert(payload, { onConflict: "lead_id" });
    if (error) console.error("[lead-ledger] upsert failed:", error.message);
  } catch (err) {
    console.error("[lead-ledger] unexpected:", (err as Error).message);
  }
}
