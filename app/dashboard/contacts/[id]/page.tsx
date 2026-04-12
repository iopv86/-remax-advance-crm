import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Mail, Phone, Calendar, DollarSign, Flag } from "lucide-react";
import Link from "next/link";
import { STAGE_LABELS, CLASSIFICATION_LABELS } from "@/lib/types";
import type { Deal, Task, Message, DealStage, LeadClassification } from "@/lib/types";
// Message import kept for ContactWhatsApp prop typing
import { ContactActions } from "./contact-actions";
import { ContactWhatsApp } from "./contact-whatsapp";

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  unqualified: "No calificado",
  nurturing: "Nutriendo",
  archived: "Archivado",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-slate-500 bg-slate-50 border-slate-200",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

const STAGE_ACCENT: Record<DealStage, string> = {
  lead_captured: "#94a3b8",
  qualified: "#2563eb",
  contacted: "#2563eb",
  showing_scheduled: "#d97706",
  showing_done: "#d97706",
  offer_made: "#e11d48",
  negotiation: "#e11d48",
  contract: "#7c3aed",
  closed_won: "#10b981",
  closed_lost: "#94a3b8",
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch contact
  const { data: contact } = await supabase
    .from("contacts")
    .select("*, agent:agents(full_name, email)")
    .eq("id", id)
    .single();

  if (!contact) notFound();

  // Fetch deals for this contact
  const { data: deals } = await supabase
    .from("deals")
    .select("id, stage, deal_value, currency, expected_close_date, notes, created_at")
    .eq("contact_id", id)
    .order("created_at", { ascending: false });

  // Fetch tasks for this contact
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, priority, status, due_date, created_at")
    .eq("contact_id", id)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });

  // Fetch WhatsApp messages for this contact
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, content, is_automated, created_at")
    .eq("contact_id", id)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: true })
    .limit(100);

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Sin nombre";
  const initials = (contact.first_name?.[0] ?? contact.last_name?.[0] ?? "?").toUpperCase();
  const classification = contact.lead_classification as LeadClassification | undefined;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/contacts"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Contactos
          </Link>
          <span className="text-muted-foreground/40 text-xs">/</span>
          <span className="text-xs font-medium text-foreground">{fullName}</span>
        </div>
      </div>

      <div className="p-7 space-y-6 animate-fade-up-1">
        {/* ── Contact card ───────────────────────────────────────────────── */}
        <div className="card-base p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center font-sans font-bold text-xl shrink-0 text-rose-700"
              style={{ background: "rgba(225,29,72,0.08)", outline: "2px solid rgba(225,29,72,0.18)", outlineOffset: "2px" }}
            >
              {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1
                  style={{
                    fontFamily: "var(--font-playfair),Georgia,serif",
                    fontWeight: 700,
                    fontSize: 24,
                    letterSpacing: "-0.02em",
                    color: "var(--foreground)",
                    lineHeight: 1.1,
                  }}
                >
                  {fullName}
                </h1>
                {classification && (
                  <span
                    className={
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-sans font-semibold border " +
                      (classification === "hot" ? "badge-hot" :
                       classification === "warm" ? "badge-warm" :
                       classification === "cold" ? "badge-cold" : "badge-unqualified")
                    }
                  >
                    {CLASSIFICATION_LABELS[classification]}
                  </span>
                )}
                {contact.lead_status && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium border border-slate-200 bg-slate-50 text-slate-600">
                    {STATUS_LABELS[contact.lead_status] ?? contact.lead_status}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-4 mt-2 text-sm">
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-1.5 text-foreground hover:text-rose-600 transition-colors font-sans"
                  >
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors font-sans text-xs"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {contact.email}
                  </a>
                )}
                <span className="flex items-center gap-1.5 text-muted-foreground font-sans text-xs">
                  <Calendar className="h-3.5 w-3.5" />
                  Creado {formatDistanceToNow(new Date(contact.created_at), { addSuffix: true, locale: es })}
                </span>
              </div>

              {(contact.budget_min || contact.budget_max) && (
                <p className="mt-2 text-xs font-sans text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" />
                  Presupuesto:{" "}
                  {contact.budget_min ? `$${contact.budget_min.toLocaleString()}` : ""}
                  {contact.budget_min && contact.budget_max ? " – " : ""}
                  {contact.budget_max ? `$${contact.budget_max.toLocaleString()}` : ""}
                  {" "}{contact.budget_currency ?? "USD"}
                </p>
              )}
            </div>

            {/* Lead score */}
            {contact.lead_score != null && (
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground font-sans mb-0.5">Score</p>
                <p
                  className="font-mono text-2xl font-bold"
                  style={{
                    color: contact.lead_score >= 8 ? "var(--red)"
                         : contact.lead_score >= 5 ? "var(--amber)"
                         : contact.lead_score >= 2 ? "var(--teal)"
                         : "var(--muted-foreground)",
                  }}
                >
                  {contact.lead_score}<span className="text-sm text-muted-foreground font-normal">/10</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Two-column layout ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Deals ──────────────────────────────────────────────────── */}
          <div className="card-base p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-sans font-semibold text-sm text-foreground">
                Oportunidades <span className="text-muted-foreground font-normal ml-1">({deals?.length ?? 0})</span>
              </h2>
              <ContactActions contactId={id} contactName={fullName} type="deal" />
            </div>
            <div className="space-y-2">
              {(deals?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center font-sans">Sin oportunidades</p>
              )}
              {((deals ?? []) as unknown as Deal[]).map((deal) => {
                const accent = STAGE_ACCENT[deal.stage];
                return (
                  <div
                    key={deal.id}
                    className="rounded-xl border p-3 space-y-1.5"
                    style={{ borderColor: `${accent}30`, background: `${accent}08` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-xs font-sans font-semibold"
                        style={{ color: accent }}
                      >
                        {STAGE_LABELS[deal.stage]}
                      </span>
                      {deal.deal_value != null && (
                        <span className="font-mono text-xs font-bold" style={{ color: "oklch(0.5 0.16 145)" }}>
                          ${deal.deal_value.toLocaleString()} {deal.currency ?? "USD"}
                        </span>
                      )}
                    </div>
                    {deal.expected_close_date && (
                      <p className="text-[10px] text-muted-foreground font-sans">
                        Cierre esperado: {format(new Date(deal.expected_close_date), "d MMM yyyy", { locale: es })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Tasks ──────────────────────────────────────────────────── */}
          <div className="card-base p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-sans font-semibold text-sm text-foreground">
                Seguimientos <span className="text-muted-foreground font-normal ml-1">({tasks?.length ?? 0})</span>
              </h2>
              <ContactActions contactId={id} contactName={fullName} type="task" />
            </div>
            <div className="space-y-2">
              {(tasks?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center font-sans">Sin seguimientos</p>
              )}
              {((tasks ?? []) as unknown as Task[]).map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border p-3 space-y-1"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-sans text-xs font-medium text-foreground leading-snug flex-1">{task.title}</p>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border shrink-0 ${PRIORITY_COLORS[task.priority] ?? ""}`}
                    >
                      <Flag className="h-2.5 w-2.5" />
                      {PRIORITY_LABELS[task.priority] ?? task.priority}
                    </span>
                  </div>
                  {task.due_date && (
                    <p className="text-[10px] text-muted-foreground font-sans">
                      Vence: {format(new Date(task.due_date), "d MMM yyyy", { locale: es })}
                    </p>
                  )}
                  <span className={`inline-block mt-0.5 text-[10px] font-sans px-1.5 py-0.5 rounded-full ${task.status === "completed" ? "bg-emerald-50 text-emerald-700" : task.status === "in_progress" ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-600"}`}>
                    {task.status === "pending" ? "Pendiente" : task.status === "in_progress" ? "En curso" : task.status === "completed" ? "Completado" : "Cancelado"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── WhatsApp conversation (realtime) ───────────────────────── */}
        {contact.phone && (
          <div className="card-base p-5">
            <div className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#25D366]" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <h2 className="font-sans font-semibold text-sm text-foreground">
                Conversación WhatsApp
              </h2>
            </div>
            <ContactWhatsApp
              contactId={id}
              phone={contact.phone}
              initialMessages={(messages ?? []) as unknown as Message[]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
