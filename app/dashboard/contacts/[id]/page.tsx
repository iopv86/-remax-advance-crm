import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import { notFound } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { STAGE_LABELS } from "@/lib/types";
import type { Deal, Task, Message, DealStage, LeadClassification } from "@/lib/types";
import { ContactActions } from "./contact-actions";
import { ContactWhatsApp } from "./contact-whatsapp";
import { ContactDocuments } from "./contact-documents";
import type { ContactDocument } from "./contact-documents";
import { ContactActivity } from "./contact-activity";
import type { ContactActivity as ContactActivityType } from "./contact-activity";
import { ContactEditButton } from "./contact-edit-button";
import { MatchedProperties } from "./matched-properties";
import { getMatchedProperties } from "@/lib/properties/matching";

type ContactTab = "resumen" | "actividad" | "documentos" | "whatsapp";

const TABS: { key: ContactTab; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "actividad", label: "Actividad" },
  { key: "documentos", label: "Documentos" },
  { key: "whatsapp", label: "WhatsApp" },
];

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  unqualified: "No calificado",
  nurturing: "Nutriendo",
  archived: "Archivado",
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
  offer_made: "#C9963A",
  negotiation: "#C9963A",
  promesa_de_venta: "#C9963A",
  financiamiento: "#7c3aed",
  contract: "#7c3aed",
  due_diligence: "#0d9488",
  closed_won: "var(--emerald)",
  closed_lost: "#94a3b8",
};

function getClassificationStyle(c?: string) {
  switch (c) {
    case "hot":
      return { bg: "rgba(16,185,129,0.12)", color: "#10b981", border: "rgba(16,185,129,0.25)", label: "Lead Caliente" };
    case "warm":
      return { bg: "rgba(251,146,60,0.12)", color: "#fb923c", border: "rgba(251,146,60,0.25)", label: "Warm Lead" };
    case "cold":
      return { bg: "rgba(129,140,248,0.12)", color: "#818cf8", border: "rgba(129,140,248,0.25)", label: "Lead Frío" };
    default:
      return { bg: "var(--glass-bg)", color: "var(--muted-foreground)", border: "var(--glass-border-md)", label: "Sin clasificar" };
  }
}

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const activeTab: ContactTab =
    rawTab === "actividad" || rawTab === "documentos" || rawTab === "whatsapp"
      ? rawTab
      : "resumen";
  const supabase = await createClient();
  const session = await getSessionAgent();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, agent:agents(full_name, email)")
    .eq("id", id)
    .single();

  if (!contact) notFound();
  if (!isPrivileged(session.role) && contact.agent_id !== session.agentId) notFound();

  const { data: deals } = await supabase
    .from("deals")
    .select("id, stage, deal_value, currency, expected_close_date, notes, created_at")
    .eq("contact_id", id)
    .order("created_at", { ascending: false });

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, priority, status, due_date, created_at")
    .eq("contact_id", id)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });

  const { data: contactActivities } = await supabase
    .from("activities")
    .select("id, contact_id, deal_id, agent_id, activity_type, title, description, scheduled_at, completed_at, duration_minutes, is_automated, created_at")
    .eq("contact_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: contactDocs } = await supabase
    .from("contact_documents")
    .select("id, contact_id, agent_id, name, doc_type, file_url, file_size, mime_type, created_at")
    .eq("contact_id", id)
    .order("created_at", { ascending: false });

  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, content, is_automated, created_at")
    .eq("contact_id", id)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: true })
    .limit(100);

  const matchedProperties = await getMatchedProperties(id);
  const hasBudget = !!(contact.budget_min || contact.budget_max);

  const fullName =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Sin nombre";
  const initials =
    [contact.first_name?.[0], contact.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?";

  const classification = contact.lead_classification as LeadClassification | undefined;
  const classStyle = getClassificationStyle(classification);

  // Top deal (most recent active)
  const topDeal = (deals ?? []).find((d) => d.stage !== "closed_lost") as Deal | undefined;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "100vh", background: "var(--background)" }}
    >
      {/* ── Top nav bar ──────────────────────────────────────────────────── */}
      <header
        className="flex justify-between items-center shrink-0 px-8"
        style={{
          height: 64,
          background: "var(--card)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/contacts"
            className="flex items-center gap-1.5 text-xs font-medium transition-colors"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Contactos
          </Link>
          <span style={{ color: "var(--muted-foreground)" }}>/</span>
          <h2
            className="font-bold tracking-tight text-lg"
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              color: "var(--foreground)",
            }}
          >
            Detalle de Contacto
          </h2>
          {/* Tabs */}
          <nav className="hidden md:flex gap-6 ml-8">
            {TABS.map(({ key, label }) => {
              const isActive = activeTab === key;
              return (
                <Link
                  key={key}
                  href={`/dashboard/contacts/${id}?tab=${key}`}
                  className="pb-4 text-sm font-medium transition-colors"
                  style={
                    isActive
                      ? { color: "var(--primary)", borderBottom: "2px solid var(--primary)" }
                      : { color: "var(--muted-foreground)" }
                  }
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ border: "1px solid var(--glass-border-md)", color: "var(--muted-foreground)" }}
          >
            Exportar
          </button>
          <ContactEditButton contact={contact} />
        </div>
      </header>

      {/* ── Two-pane layout ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANE: Contact Profile (35%) */}
        <section
          className="overflow-y-auto"
          style={{
            width: "35%",
            background: "var(--background)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <div className="p-8">
            {/* Profile Header */}
            <div className="flex flex-col items-center text-center mb-8">
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center text-3xl font-extrabold mb-4 border"
                style={{
                  background: "rgba(201, 150, 58, 0.1)",
                  color: "var(--primary)",
                  border: "1px solid var(--border)",
                  fontFamily: "var(--font-manrope), Manrope, sans-serif",
                }}
              >
                {initials}
              </div>

              <h3
                className="text-2xl font-bold mb-1"
                style={{
                  fontFamily: "var(--font-manrope), Manrope, sans-serif",
                  color: "var(--foreground)",
                }}
              >
                {fullName}
              </h3>

              <div
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border"
                style={{
                  background: classStyle.bg,
                  color: classStyle.color,
                  borderColor: classStyle.border,
                }}
              >
                {classStyle.label}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 w-full mt-4">
                {contact.phone && (
                  <a
                    href={`https://wa.me/${contact.phone.replace(/[\s\-+().]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all hover:bg-white/5"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase" style={{ color: "var(--muted-foreground)" }}>WhatsApp</span>
                  </a>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all hover:bg-white/5"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <svg className="w-5 h-5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase" style={{ color: "var(--muted-foreground)" }}>Llamar</span>
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all hover:bg-white/5"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase" style={{ color: "var(--muted-foreground)" }}>Email</span>
                  </a>
                )}
              </div>
            </div>

            {/* Top Deal card */}
            {topDeal && (
              <div
                className="rounded-2xl p-5 mb-8 border"
                style={{ background: "var(--card)", borderColor: "var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>
                      Pipeline Stage
                    </p>
                    <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>
                      {STAGE_LABELS[topDeal.stage]}
                    </span>
                  </div>
                </div>
                {topDeal.deal_value != null && (
                  <div>
                    <p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Valor Estimado</p>
                    <p
                      className="text-lg font-extrabold"
                      style={{
                        fontFamily: "var(--font-manrope), Manrope, sans-serif",
                        color: "var(--foreground)",
                      }}
                    >
                      {topDeal.currency ?? "RD$"} {topDeal.deal_value.toLocaleString()}
                    </p>
                  </div>
                )}
                {topDeal.expected_close_date && (
                  <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                    Cierre: {format(new Date(topDeal.expected_close_date), "d MMM yyyy", { locale: es })}
                  </p>
                )}
              </div>
            )}

            {/* Add deal/task actions */}
            <div className="flex gap-2 mb-6">
              <ContactActions contactId={id} contactName={fullName} type="deal" />
              <ContactActions contactId={id} contactName={fullName} type="task" />
            </div>

            {/* Accordions */}
            <div className="space-y-4">
              {/* Personal Info */}
              <div style={{ borderBottom: "1px solid var(--glass-border)", paddingBottom: 16 }}>
                <p
                  className="font-bold text-sm mb-3"
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "var(--foreground)" }}
                >
                  Info Personal
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {contact.phone && (
                    <div>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Celular</p>
                      <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{contact.phone}</p>
                    </div>
                  )}
                  {contact.email && (
                    <div>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Email</p>
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>{contact.email}</p>
                    </div>
                  )}
                  {contact.lead_status && (
                    <div>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Estado</p>
                      <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {STATUS_LABELS[contact.lead_status] ?? contact.lead_status}
                      </p>
                    </div>
                  )}
                  {contact.source && (
                    <div>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Origen</p>
                      <p className="text-sm font-semibold capitalize" style={{ color: "var(--foreground)" }}>{contact.source.replace(/_/g, " ")}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Budget */}
              {(contact.budget_min || contact.budget_max) && (
                <div style={{ borderBottom: "1px solid var(--glass-border)", paddingBottom: 16 }}>
                  <p
                    className="font-bold text-sm mb-3"
                    style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "var(--foreground)" }}
                  >
                    Presupuesto
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    {contact.budget_currency ?? "USD"}{" "}
                    {contact.budget_min ? contact.budget_min.toLocaleString() : ""}
                    {contact.budget_min && contact.budget_max ? " – " : ""}
                    {contact.budget_max ? contact.budget_max.toLocaleString() : ""}
                  </p>
                </div>
              )}

              {/* Tasks */}
              {(tasks?.length ?? 0) > 0 && (
                <div style={{ borderBottom: "1px solid var(--glass-border)", paddingBottom: 16 }}>
                  <p
                    className="font-bold text-sm mb-3"
                    style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "var(--foreground)" }}
                  >
                    Seguimientos ({tasks?.length})
                  </p>
                  <div className="space-y-2">
                    {(tasks ?? []).slice(0, 3).map((task) => (
                      <div key={task.id} className="flex items-start gap-2">
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{
                            background:
                              task.status === "completed" ? "var(--emerald)" :
                              task.status === "in_progress" ? "var(--blue, #3b82f6)" : "#94a3b8",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-snug" style={{ color: "var(--foreground)" }}>{task.title}</p>
                          {task.due_date && (
                            <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                              {format(new Date(task.due_date), "d MMM yyyy", { locale: es })}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[10px] font-bold uppercase shrink-0 px-1.5 py-0.5 rounded"
                          style={{
                            background: task.priority === "urgent" ? "rgba(239,68,68,0.15)" : "var(--glass-bg-md)",
                            color: task.priority === "urgent" ? "#f87171" : "var(--muted-foreground)",
                          }}
                        >
                          {PRIORITY_LABELS[task.priority] ?? task.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity */}
              <div>
                <p
                  className="font-bold text-sm mb-3"
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "var(--foreground)" }}
                >
                  Actividad Reciente
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "rgba(201, 150, 58, 0.1)" }}
                    >
                      <svg className="w-3.5 h-3.5 text-[#C9963A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold" style={{ color: "var(--foreground)" }}>Contacto creado</p>
                      <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                        {formatDistanceToNow(new Date(contact.created_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                  </div>
                  {topDeal && (
                    <div className="flex gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: "var(--emerald-muted)" }}
                      >
                        <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold" style={{ color: "var(--foreground)" }}>Deal en {STAGE_LABELS[topDeal.stage]}</p>
                        <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                          {formatDistanceToNow(new Date(topDeal.created_at), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT PANE: Tab content (65%) */}
        <section className="flex flex-col overflow-y-auto" style={{ width: "65%", background: "var(--card)" }}>
          {/* WhatsApp tab */}
          {activeTab === "whatsapp" && (
            contact.phone ? (
              <ContactWhatsApp
                contactId={id}
                phone={contact.phone}
                initialMessages={(messages ?? []) as unknown as Message[]}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12" style={{ color: "var(--muted-foreground)" }}>
                <svg className="w-12 h-12 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <p className="text-sm font-medium">Sin número de WhatsApp</p>
                <p className="text-xs mt-1">Edita el contacto para agregar un número</p>
              </div>
            )
          )}

          {/* Resumen tab — deals overview */}
          {activeTab === "resumen" && (
            <div className="p-8 space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                Tratos
              </h3>
              {(deals ?? []).length === 0 ? (
                <div className="flex flex-col items-center py-16" style={{ color: "var(--muted-foreground)" }}>
                  <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-sm">Sin tratos registrados.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(deals as unknown as Deal[]).map((d) => (
                    <div
                      key={d.id}
                      className="p-4 rounded-xl border"
                      style={{ background: "var(--background)", borderColor: "var(--border)" }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span
                          className="text-sm font-bold"
                          style={{ color: STAGE_ACCENT[d.stage] ?? "#94a3b8" }}
                        >
                          {STAGE_LABELS[d.stage]}
                        </span>
                        {d.deal_value != null && (
                          <span className="text-sm font-extrabold" style={{ color: "var(--foreground)", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                            {d.currency ?? "RD$"} {d.deal_value.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {d.expected_close_date && (
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          Cierre: {format(new Date(d.expected_close_date), "d MMM yyyy", { locale: es })}
                        </p>
                      )}
                      {d.notes && (
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted-foreground)" }}>{d.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <MatchedProperties matches={matchedProperties} hasBudget={hasBudget} />
            </div>
          )}

          {/* Actividad tab */}
          {activeTab === "actividad" && (
            <ContactActivity
              contactId={id}
              agentId={session.agentId}
              initialActivities={(contactActivities ?? []) as ContactActivityType[]}
            />
          )}

          {/* Documentos tab */}
          {activeTab === "documentos" && (
            <ContactDocuments
              contactId={id}
              agentId={session.agentId}
              initialDocs={(contactDocs ?? []) as ContactDocument[]}
            />
          )}
        </section>
      </div>
    </div>
  );
}
