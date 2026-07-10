// Unified commission calculation — the single source of truth used by every
// screen (deal detail, reports, agents, campaign attribution, KPI views mirror
// this same expression). Commission is MANUAL per deal: the agent enters
// `deals.commission_percentage` in the deal editor (new deals default to 3.0
// via the DB column default, and it is fully editable). If an absolute
// `commission_value` is set it wins; otherwise the amount derives from the
// entered percentage. There is NO hardcoded fallback percentage — an unset
// percentage yields 0 (never a magic number), so all screens agree.
export interface CommissionInput {
  commission_value?: number | null;
  deal_value?: number | null;
  commission_percentage?: number | null;
}

export function computeCommission(deal: CommissionInput): number {
  if (deal.commission_value != null) return deal.commission_value;
  return ((deal.deal_value ?? 0) * (deal.commission_percentage ?? 0)) / 100;
}
