import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { STAGE_LABELS } from "@/lib/types";
import type { Deal, Task, Message, DealStage, LeadClassification } from "@/lib/types";
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

function getClassificationStyle(c?: string) {
  switch (c) {
    case "hot":
      return { bg: "#ecfdf5", color: "#059669", border: "#a7f3d0", label: "Lead Caliente" };
    case "warm":
      return { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa", label: "Warm Lead" };
    case "cold":
      return { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe", label: "Lead Frío" };
    default:
      return { bg: "#f8fafc", color: "#475569", border: "#e2e8f0", label: "Sin clasificar" };
  }
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, agent:agents(full_name, email)")
    .eq("id", id)
    .single();

  if (!contact) notFound();

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

  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, content, is_automated, created_at")
    .eq("contact_id", id)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: true })
    .limit(100);

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
            style={{ color: "#64748b" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Contactos
          </Link>
          <span style={{ color: "#d1d5db" }}>/</span>
          <h2
            className="font-bold tracking-tight text-lg"
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              color: "#1C1917",
            }}
          >
            Detalle de Contacto
          </h2>
          {/* Tabs */}
          <nav className="hidden md:flex gap-6 ml-8">
            {["Resumen", "Actividad", "Documentos", "WhatsApp"].map((tab, i) => (
              <span
                key={tab}
                className="pb-4 text-sm font-medium cursor-pointer transition-colors"
                style={
                  i === 0
                    ? { color: "#e11d48", borderBottom: "2px solid #e11d48" }
                    : { color: "#6b7280" }
                }
              >
                {tab}
              </span>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors hover:bg-stone-50"
            style={{ border: "1px solid #e5e7eb", color: "#374151" }}
          >
            Exportar
          </button>
          <button
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all hover:brightness-95"
            style={{ background: "#e11d48" }}
          >
            Editar
          </button>
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
                  background: "var(--red-muted)",
                  color: "#e11d48",
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
                  color: "#1C1917",
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
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all hover:bg-stone-50"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    <span className="text-[10px] font-bold text-stone-500 uppercase">WhatsApp</span>
                  </a>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all hover:bg-stone-50"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <svg className="w-5 h-5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                    </svg>
                    <span className="text-[10px] font-bold text-stone-500 uppercase">Llamar</span>
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all hover:bg-stone-50"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span className="text-[10px] font-bold text-stone-500 uppercase">Email</span>
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
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#94a3b8" }}>
                      Pipeline Stage
                    </p>
                    <span className="text-sm font-bold" style={{ color: "#e11d48" }}>
                      {STAGE_LABELS[topDeal.stage]}
                    </span>
                  </div>
                </div>
                {topDeal.deal_value != null && (
                  <div>
                    <p className="text-xs font-medium text-stone-500">Valor Estimado</p>
                    <p
                      className="text-lg font-extrabold"
                      style={{
                        fontFamily: "var(--font-manrope), Manrope, sans-serif",
                        color: "#1C1917",
                      }}
                    >
                      {topDeal.currency ?? "RD$"} {topDeal.deal_value.toLocaleString()}
                    </p>
                  </div>
                )}
                {topDeal.expected_close_date && (
                  <p className="text-xs text-stone-400 mt-2">
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
              <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
                <p
                  className="font-bold text-sm mb-3"
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "#1C1917" }}
                >
                  Info Personal
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {contact.phone && (
                    <div>
                      <p className="text-xs text-stone-500">Celular</p>
                      <p className="text-sm font-semibold text-stone-900">{contact.phone}</p>
                    </div>
                  )}
                  {contact.email && (
                    <div>
                      <p className="text-xs text-stone-500">Email</p>
                      <p className="text-sm font-semibold text-stone-900 truncate">{contact.email}</p>
                    </div>
                  )}
                  {contact.lead_status && (
                    <div>
                      <p className="text-xs text-stone-500">Estado</p>
                      <p className="text-sm font-semibold text-stone-900">
                        {STATUS_LABELS[contact.lead_status] ?? contact.lead_status}
                      </p>
                    </div>
                  )}
                  {contact.source && (
                    <div>
                      <p className="text-xs text-stone-500">Origen</p>
                      <p className="text-sm font-semibold text-stone-900 capitalize">{contact.source.replace(/_/g, " ")}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Budget */}
              {(contact.budget_min || contact.budget_max) && (
                <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
                  <p
                    className="font-bold text-sm mb-3"
                    style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "#1C1917" }}
                  >
                    Presupuesto
                  </p>
                  <p className="text-sm font-semibold text-stone-900">
                    {contact.budget_currency ?? "USD"}{" "}
                    {contact.budget_min ? contact.budget_min.toLocaleString() : ""}
                    {contact.budget_min && contact.budget_max ? " – " : ""}
                    {contact.budget_max ? contact.budget_max.toLocaleString() : ""}
                  </p>
                </div>
              )}

              {/* Tasks */}
              {(tasks?.length ?? 0) > 0 && (
                <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
                  <p
                    className="font-bold text-sm mb-3"
                    style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "#1C1917" }}
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
                              task.status === "completed" ? "#10b981" :
                              task.status === "in_progress" ? "#3b82f6" : "#94a3b8",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-stone-900 leading-snug">{task.title}</p>
                          {task.due_date && (
                            <p className="text-[10px] text-stone-400">
                              {format(new Date(task.due_date), "d MMM yyyy", { locale: es })}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[10px] font-bold uppercase shrink-0 px-1.5 py-0.5 rounded"
                          style={{
                            background: task.priority === "urgent" ? "#fef2f2" : "#f8fafc",
                            color: task.priority === "urgent" ? "#dc2626" : "#64748b",
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
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "#1C1917" }}
                >
                  Actividad Reciente
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "var(--red-muted)" }}
                    >
                      <svg className="w-3.5 h-3.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-900">Contacto creado</p>
                      <p className="text-[10px] text-stone-400">
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
                        <p className="text-xs font-bold text-stone-900">Deal en {STAGE_LABELS[topDeal.stage]}</p>
                        <p className="text-[10px] text-stone-400">
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

        {/* RIGHT PANE: WhatsApp Chat (65%) */}
        <section className="flex flex-col" style={{ width: "65%", background: "var(--card)" }}>
          {contact.phone ? (
            <ContactWhatsApp
              contactId={id}
              phone={contact.phone}
              initialMessages={(messages ?? []) as unknown as Message[]}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center" style={{ color: "#94a3b8" }}>
              <svg className="w-12 h-12 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <p className="text-sm font-medium">Sin número de WhatsApp</p>
              <p className="text-xs mt-1">Edita el contacto para agregar un número</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
