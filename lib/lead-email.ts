/**
 * Body and subject for the "new lead assigned" email sent to an agent.
 *
 * Deliberately dependency-free so it can be exercised standalone, without a
 * server, a database or an outbound send -- the content is the part worth
 * testing, and testing it must not put mail in a real agent's inbox.
 *
 * This email is REDUNDANCY, not a replacement: the WhatsApp template remains the
 * primary channel. The two fail for unrelated reasons (WhatsApp: expired token,
 * template rejected by Meta, 24h window; email: deliverability), which is the
 * only thing that makes a second channel worth having.
 */

/** Fields that reach the message. Everything here is optional in practice. */
export interface LeadEmailInput {
  agentName: string | null;
  leadName: string;
  leadPhone: string | null;
  budgetDisplay: string;
  interes: string;
  horario: string;
  link: string;
}

const PLACEHOLDER = "No especificado";

/**
 * One normalizer for every dynamic value.
 *
 * Strips CR/LF first: a lead-supplied name containing a newline could otherwise
 * inject a line into the subject header. Then folds accents and drops anything
 * outside printable ASCII -- which also removes the emoji that Facebook display
 * names routinely carry, and which the project forbids in stored content.
 */
function clean(v: string | null | undefined, max: number): string {
  if (!v) return "";
  return v
    .replace(/[\r\n]+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export { clean as cleanEmailValue };

/** Deep link to the record. Both routes are real; falls back to the dashboard. */
export function crmLeadLink(
  appUrl: string,
  dealId: string | null,
  contactId: string | null,
): string {
  const base = appUrl.replace(/\/+$/, "");
  if (dealId) return `${base}/dashboard/pipeline/${dealId}`;
  if (contactId) return `${base}/dashboard/contacts/${contactId}`;
  return `${base}/dashboard`;
}

export function buildLeadEmail(i: LeadEmailInput): { subject: string; text: string } {
  const leadName = clean(i.leadName, 120) || "Sin nombre";
  const first = clean(i.agentName, 60).split(" ")[0] || "";
  const phone = clean(i.leadPhone, 40) || "No provisto";
  const budget = clean(i.budgetDisplay, 60) || PLACEHOLDER;
  const interes = clean(i.interes, 120) || PLACEHOLDER;
  const horario = clean(i.horario, 80) || PLACEHOLDER;
  const link = clean(i.link, 300);

  const subject = `Nuevo lead asignado: ${leadName}`.slice(0, 160);

  const text = [
    first ? `Hola ${first},` : "Hola,",
    "",
    "Se te asigno un nuevo lead de Meta (Facebook / Instagram).",
    "",
    `Nombre:      ${leadName}`,
    `Telefono:    ${phone}`,
    `Presupuesto: ${budget}`,
    `Interes:     ${interes}`,
    `Contactar:   ${horario}`,
    "",
    `Abrir en el CRM: ${link}`,
    "",
    "Este correo se envia ademas del mensaje de WhatsApp, como respaldo.",
    "Si ya atendiste este lead, ignoralo.",
  ].join("\n");

  return { subject, text };
}
