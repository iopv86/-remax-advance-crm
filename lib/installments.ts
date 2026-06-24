import type { DealInstallment, DealInstallmentDerivedStatus } from "@/lib/types";

/**
 * Presentation status of an installment. "vencida" is NOT a DB value — it is
 * derived here so we never need a cron to flip pending→overdue as dates pass.
 * `today` (YYYY-MM-DD) is passed in (not read from `new Date()`) so the server
 * render and client hydration agree on "now" and avoid timezone drift.
 */
export function deriveInstallmentStatus(
  i: Pick<DealInstallment, "status" | "due_date">,
  today: string,
): DealInstallmentDerivedStatus {
  if (i.status === "pagada") return "pagada";
  if (i.due_date && i.due_date < today) return "vencida";
  return "pendiente";
}
