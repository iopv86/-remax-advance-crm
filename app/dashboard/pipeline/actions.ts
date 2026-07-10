"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { notifyAgentTemplate } from "@/lib/meta-leads";
import { redirect } from "next/navigation";
import type {
  DealPartyInput, DealPartyType,
  DealInstallmentInput, DealInstallmentKind, DealInstallmentStatus,
  CurrencyType,
} from "@/lib/types";

async function getAgentId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent) redirect("/login");
  return agent.id as string;
}

// ─── WhatsApp alert to the assigned agent on manual deal creation ─────────────
// The Meta poller and Ava already notify the agent on their own intake paths;
// manual creation in the CRM did not. Fires the approved template so a manually
// created + assigned lead reaches the agent's phone too. Fire-and-forget: never
// blocks the create flow, and the in-app bell (trg_notify_deal_assigned) covers
// regardless. Server-only so the Meta token never reaches the browser.
//
// Access control: the deal is read with the USER-scoped client so RLS
// (deals: agent_id = auth.uid() OR is_admin_or_manager()) rejects the read for a
// caller with no legitimate access — no IDOR via an arbitrary dealId. The
// service-role client is used only AFTER that check, to look up the assigned
// agent's phone (which the caller's own RLS may not expose). A notify-once guard
// (agent_notified_at) makes it idempotent and blocks send-spam on the paid
// WhatsApp template over the number shared with Ava.
export async function notifyAgentNewLead(dealId: string): Promise<void> {
  try {
    if (!UUID_RE.test(dealId)) return;
    // Silent auth — this is a background side-effect, never redirect the user.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;
    const { data: caller } = await supabase
      .from("agents").select("id").eq("email", user.email).maybeSingle();
    if (!caller) return;
    const creatorAgentId = caller.id as string;

    // RLS-scoped read: null if the caller cannot see this deal.
    const { data: deal } = await supabase
      .from("deals")
      .select("agent_id, contact_id, agent_notified_at")
      .eq("id", dealId)
      .maybeSingle();
    if (!deal?.agent_id) return;
    // Don't WhatsApp yourself; only a cross-assignment alerts.
    if (deal.agent_id === creatorAgentId) return;
    // Notify-once: idempotent + anti-spam.
    if (deal.agent_notified_at) return;

    // Claim the send first so concurrent/duplicate calls short-circuit above.
    await supabase
      .from("deals")
      .update({ agent_notified_at: new Date().toISOString() })
      .eq("id", dealId);

    // Post-authorization: service-role lookup for the agent phone + contact PII.
    const admin = adminClient();
    const { data: agent } = await admin
      .from("agents")
      .select("phone")
      .eq("id", deal.agent_id)
      .maybeSingle();
    if (!agent?.phone) return;

    const { data: contact } = deal.contact_id
      ? await admin
          .from("contacts")
          .select("first_name, last_name, phone")
          .eq("id", deal.contact_id)
          .maybeSingle()
      : { data: null };
    const leadName = contact
      ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
      : "";
    const leadPhone = (contact?.phone as string | null) ?? null;

    notifyAgentTemplate(agent.phone as string, leadName, leadPhone);
  } catch (err) {
    console.error("[actions] notifyAgentNewLead error:", (err as Error).message);
  }
}

// ─── Deal parties (Co-comprador / Referidor) — migration 0018 ─────────────────
// Replaces the party set for a deal: co-buyers + referrers. Authorization is
// enforced by RLS (deal_parties policies delegate to the parent deal's
// owning-agent/admin-manager rule). MUST use the user-scoped client below — never
// the service-role client, which bypasses RLS.
const MAX_PARTIES = 10; // UI sends ≤2; cap direct callers
const MAX_FIELD_LEN = 300;
const VALID_TYPES: readonly DealPartyType[] = ["co_buyer", "referrer"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanField(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (t.length === 0) return null;
  return t.slice(0, MAX_FIELD_LEN);
}

// Keep only URL-safe phone characters so tel:/wa.me hrefs can't be hijacked
// (e.g. "809?text=spam"). Allows digits, +, spaces, dashes, parentheses.
function cleanPhone(v: string | null | undefined): string | null {
  const t = cleanField(v);
  if (t === null) return null;
  const safe = t.replace(/[^0-9+()\-\s]/g, "").trim();
  return safe.length > 0 ? safe : null;
}

export async function saveDealParties(
  dealId: string,
  parties: DealPartyInput[],
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  await getAgentId(); // ensures an authenticated agent session (redirects otherwise)

  // Validate the id shape before any DB op so a bad value can't leak a raw
  // Postgres "invalid input syntax for type uuid" message to the client.
  if (!UUID_RE.test(dealId)) {
    return { success: false, error: "ID de oportunidad inválido" };
  }

  if (!Array.isArray(parties) || parties.length > MAX_PARTIES) {
    return { success: false, error: "Cantidad de partes inválida" };
  }

  // Reject unknown party types before they reach the DB (input is untrusted).
  for (const p of parties) {
    if (!VALID_TYPES.includes(p.party_type)) {
      return { success: false, error: "Tipo de parte inválido" };
    }
  }

  // Drop rows with no name (an opened-but-empty party becomes no row).
  const rows = parties
    .map((p) => ({
      party_type: p.party_type,
      full_name: cleanField(p.full_name),
      phone: cleanPhone(p.phone),
      relationship: cleanField(p.relationship),
      notes: cleanField(p.notes),
    }))
    .filter((p) => p.full_name !== null);

  // Replace-the-set: delete existing parties for this deal, then insert the new set.
  // RLS gates both ops to the owning agent / admin-manager of the parent deal.
  const { error: delError } = await supabase
    .from("deal_parties")
    .delete()
    .eq("deal_id", dealId);
  if (delError) return { success: false, error: delError.message };

  if (rows.length === 0) return { success: true };

  const insertRows = rows.map((p) => ({
    deal_id: dealId,
    party_type: p.party_type,
    full_name: p.full_name as string,
    phone: p.phone,
    relationship: p.relationship,
    notes: p.notes,
  }));

  const { error: insError } = await supabase
    .from("deal_parties")
    .insert(insertRows);
  if (insError) return { success: false, error: insError.message };

  return { success: true };
}

// ─── Deal installments (Plan de pagos) — migration 0019 ───────────────────────
// Replaces the installment set for a deal (delete-then-insert). One currency per
// plan, inherited from the deal — every row is forced to it. Authorization is
// enforced by RLS (deal_installments policies delegate to the parent deal's
// owning-agent/admin-manager edit rule). MUST use the user-scoped client — never
// the service-role client, which bypasses RLS.
const MAX_INSTALLMENTS = 60; // UI rarely exceeds ~24; cap direct callers
const MAX_AMOUNT = 100_000_000_000; // matches CHECK deal_installments_amount_max
const VALID_KINDS: readonly DealInstallmentKind[] = ["reserva", "inicial", "saldo", "otro"];
const VALID_STATUSES: readonly DealInstallmentStatus[] = ["pendiente", "pagada"];
const VALID_CURRENCIES: readonly CurrencyType[] = ["USD", "DOP"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100; // scale 2, matches numeric(14,2)
}

// Accept only a real calendar date in YYYY-MM-DD; reject malformed/impossible
// values before they reach the DB (untrusted input).
function cleanDate(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (t.length === 0) return null;
  if (!DATE_RE.test(t)) return null;
  const d = new Date(t + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== t) return null; // catches 2026-02-30 etc.
  return t;
}

export async function saveDealInstallments(
  dealId: string,
  currency: CurrencyType,
  installments: DealInstallmentInput[],
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  await getAgentId(); // ensures an authenticated agent session (redirects otherwise)

  if (!UUID_RE.test(dealId)) {
    return { success: false, error: "ID de oportunidad inválido" };
  }
  if (!VALID_CURRENCIES.includes(currency)) {
    return { success: false, error: "Moneda inválida" };
  }
  if (!Array.isArray(installments) || installments.length > MAX_INSTALLMENTS) {
    return { success: false, error: "Cantidad de cuotas inválida" };
  }

  // Validate + normalize each row. A row with no/invalid amount is dropped (an
  // opened-but-empty cuota becomes no row). kind/status allowlisted; currency
  // forced to the plan currency; paid_date cleared unless status='pagada'.
  const rows: Array<{
    deal_id: string;
    kind: DealInstallmentKind;
    label: string | null;
    amount: number;
    currency: CurrencyType;
    due_date: string | null;
    status: DealInstallmentStatus;
    paid_date: string | null;
    notes: string | null;
    sort_order: number;
  }> = [];

  let order = 0;
  for (const it of installments) {
    if (!VALID_KINDS.includes(it.kind)) {
      return { success: false, error: "Tipo de cuota inválido" };
    }
    if (!VALID_STATUSES.includes(it.status)) {
      return { success: false, error: "Estado de cuota inválido" };
    }
    const amount = cleanAmount(it.amount);
    if (amount === null) continue; // drop empty/invalid-amount rows
    rows.push({
      deal_id: dealId,
      kind: it.kind,
      label: cleanField(it.label),
      amount,
      currency, // forced — one currency per plan
      due_date: cleanDate(it.due_date),
      status: it.status,
      paid_date: it.status === "pagada" ? cleanDate(it.paid_date) : null,
      notes: cleanField(it.notes),
      sort_order: order++,
    });
  }

  // Replace-the-set: delete existing installments, then insert the new ordered
  // set. RLS gates both ops to the owning agent / admin-manager of the deal.
  const { error: delError } = await supabase
    .from("deal_installments")
    .delete()
    .eq("deal_id", dealId);
  if (delError) {
    console.error("[saveDealInstallments] delete error:", delError);
    return { success: false, error: "No se pudo guardar el plan de pagos" };
  }

  if (rows.length === 0) return { success: true };

  const { error: insError } = await supabase
    .from("deal_installments")
    .insert(rows);
  if (insError) {
    console.error("[saveDealInstallments] insert error:", insError);
    return { success: false, error: "No se pudo guardar el plan de pagos" };
  }

  return { success: true };
}
