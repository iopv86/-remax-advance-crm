"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { format, isToday, isTomorrow, isPast, startOfDay, addDays, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, CalendarDays, Clock, MapPin, Phone, Star, ChevronLeft, ChevronRight, MessageSquare, X, Check, Ban } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ShowingStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

interface Showing {
  id: string;
  deal_id?: string;
  property_id: string;
  contact_id: string;
  agent_id: string;
  scheduled_at: string;
  duration_minutes?: number;
  status?: ShowingStatus;
  client_feedback?: string;
  client_interest_level?: number;
  agent_notes?: string;
  meeting_point?: string;
  confirmed_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  created_at: string;
  property?: {
    id: string;
    title: string;
    city?: string;
    sector?: string;
    images?: string[];
    price?: number;
    currency?: string;
    property_type?: string;
  };
  contact?: {
    id: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
}

interface ContactOption {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface PropertyOption {
  id: string;
  title: string;
  city?: string;
  sector?: string;
  property_type?: string;
  price?: number;
  currency?: string;
  images?: string[];
}

interface ScheduleForm {
  property_id: string;
  contact_id: string;
  scheduled_at: string;
  duration_minutes: string;
  meeting_point: string;
  agent_notes: string;
}

const EMPTY_FORM: ScheduleForm = {
  property_id: "",
  contact_id: "",
  scheduled_at: "",
  duration_minutes: "60",
  meeting_point: "",
  agent_notes: "",
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const GOLD = "var(--primary)";
const BG_BODY = "var(--background)";
const BG_SURFACE = "var(--card)";
const BG_ELEVATED = "var(--secondary)";
const TEXT_PRIMARY = "var(--foreground)";
const TEXT_MUTED = "var(--muted-foreground)";
const BORDER_GOLD = "rgba(201,150,58,0.15)";
const BORDER_DIM = "var(--glass-bg-md)";

const STATUS_MAP: Record<ShowingStatus, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Agendada", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  confirmed: { label: "Confirmada", color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  completed: { label: "Realizada", color: "#C9963A", bg: "rgba(201,150,58,0.12)" },
  cancelled: { label: "Cancelada", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  no_show: { label: "No se presentó", color: "var(--muted-foreground)", bg: "rgba(107,114,128,0.12)" },
};

const TYPE_LABELS: Record<string, string> = {
  apartment: "Apto",
  penthouse: "Penthouse",
  villa: "Villa",
  house: "Casa",
  land: "Solar",
  commercial: "Comercial",
  apart_hotel: "Apart-Hotel",
  farm: "Finca",
};

function sanitizePhone(phone: string): string {
  return phone.replace(/[\s\-\+\(\)]/g, "");
}

function contactName(c?: ContactOption | null): string {
  if (!c) return "Sin contacto";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Sin nombre";
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Hoy";
  if (isTomorrow(date)) return "Mañana";
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

// ─── Showing card ─────────────────────────────────────────────────────────────

function ShowingCard({
  showing,
  onConfirm,
  onComplete,
  onCancel,
  onFeedback,
  isPast: past,
}: {
  showing: Showing;
  onConfirm: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onFeedback: (showing: Showing) => void;
  isPast: boolean;
}) {
  const status = showing.status ?? "scheduled";
  const badge = STATUS_MAP[status];
  const dt = new Date(showing.scheduled_at);
  const img = showing.property?.images?.[0];
  const canAct = status === "scheduled" || status === "confirmed";

  return (
    <div
      style={{
        background: BG_ELEVATED,
        border: `1px solid ${status === "confirmed" ? "rgba(16,185,129,0.2)" : BORDER_DIM}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Property image strip */}
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt={showing.property?.title}
          style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
        />
      )}

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {showing.property?.title ?? "Propiedad"}
            </div>
            {(showing.property?.city || showing.property?.sector) && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: TEXT_MUTED }}>
                <MapPin style={{ width: 10, height: 10 }} />
                {[showing.property.sector, showing.property.city].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
          <span style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, flexShrink: 0, letterSpacing: "0.03em" }}>
            {badge.label}
          </span>
        </div>

        {/* Time + contact */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: TEXT_MUTED }}>
            <Clock style={{ width: 12, height: 12, color: GOLD }} />
            <span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>{format(dt, "HH:mm")}</span>
            {showing.duration_minutes && (
              <span style={{ color: TEXT_MUTED }}>· {showing.duration_minutes} min</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: TEXT_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              👤 {contactName(showing.contact)}
            </div>
            {showing.contact?.phone && (
              <a
                href={`https://wa.me/${sanitizePhone(showing.contact.phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "rgba(37,211,102,0.1)", color: "#25D366", fontSize: 11, borderRadius: 6, border: "1px solid rgba(37,211,102,0.2)", textDecoration: "none", flexShrink: 0, marginLeft: 8 }}
              >
                <MessageSquare style={{ width: 10, height: 10 }} />
                WA
              </a>
            )}
          </div>
          {showing.meeting_point && (
            <div style={{ fontSize: 11, color: TEXT_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              📍 {showing.meeting_point}
            </div>
          )}
        </div>

        {/* Interest level (if completed) */}
        {showing.client_interest_level != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: TEXT_MUTED }}>Interés:</span>
            <div style={{ display: "flex", gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  style={{
                    width: 12, height: 12,
                    fill: n <= (showing.client_interest_level ?? 0) ? GOLD : "transparent",
                    color: n <= (showing.client_interest_level ?? 0) ? GOLD : TEXT_MUTED,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {(canAct || status === "completed") && (
          <div style={{ display: "flex", gap: 6, borderTop: `1px solid ${BORDER_DIM}`, paddingTop: 10 }}>
            {status === "scheduled" && (
              <button
                onClick={() => onConfirm(showing.id)}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 0", background: "rgba(16,185,129,0.1)", color: "#10B981", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid rgba(16,185,129,0.2)", cursor: "pointer" }}
              >
                <Check style={{ width: 11, height: 11 }} />
                Confirmar
              </button>
            )}
            {(status === "scheduled" || status === "confirmed") && !past && (
              <button
                onClick={() => onCancel(showing.id)}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 0", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}
              >
                <Ban style={{ width: 11, height: 11 }} />
                Cancelar
              </button>
            )}
            {(status === "scheduled" || status === "confirmed") && past && (
              <button
                onClick={() => onFeedback(showing)}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 0", background: "rgba(201,150,58,0.1)", color: GOLD, fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid rgba(201,150,58,0.2)`, cursor: "pointer" }}
              >
                <Star style={{ width: 11, height: 11 }} />
                Registrar visita
              </button>
            )}
            {status === "completed" && !showing.client_feedback && (
              <button
                onClick={() => onFeedback(showing)}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "6px 0", background: BG_SURFACE, color: TEXT_MUTED, fontSize: 11, fontWeight: 500, borderRadius: 6, border: `1px solid ${BORDER_DIM}`, cursor: "pointer" }}
              >
                Añadir feedback
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Feedback modal ───────────────────────────────────────────────────────────

function FeedbackModal({
  showing,
  onClose,
  onSave,
}: {
  showing: Showing;
  onClose: () => void;
  onSave: (id: string, data: { client_interest_level: number; client_feedback: string; status: ShowingStatus }) => void;
}) {
  const [interest, setInterest] = useState(showing.client_interest_level ?? 3);
  const [feedback, setFeedback] = useState(showing.client_feedback ?? "");
  const [outcome, setOutcome] = useState<"completed" | "no_show">("completed");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(showing.id, { client_interest_level: interest, client_feedback: feedback, status: outcome });
    setSaving(false);
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, background: BG_ELEVATED, border: `1px solid ${BORDER_GOLD}`, borderRadius: 16, padding: 28 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: 0, fontFamily: "Manrope, sans-serif" }}>
            Registrar resultado de visita
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: TEXT_MUTED, cursor: "pointer" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 10 }}>
            Resultado
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["completed", "no_show"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setOutcome(v)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: outcome === v ? (v === "completed" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)") : BG_SURFACE,
                  color: outcome === v ? (v === "completed" ? "#10B981" : "#ef4444") : TEXT_MUTED,
                  border: `1px solid ${outcome === v ? (v === "completed" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)") : BORDER_DIM}`,
                }}
              >
                {v === "completed" ? "✓ Realizada" : "✗ No se presentó"}
              </button>
            ))}
          </div>
        </div>

        {outcome === "completed" && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 10 }}>
              Nivel de interés del cliente
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setInterest(n)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
                >
                  <Star style={{ width: 24, height: 24, fill: n <= interest ? GOLD : "transparent", color: n <= interest ? GOLD : TEXT_MUTED }} />
                </button>
              ))}
              <span style={{ fontSize: 12, color: TEXT_MUTED, alignSelf: "center", marginLeft: 4 }}>
                {["", "Muy bajo", "Bajo", "Medio", "Alto", "Muy alto"][interest]}
              </span>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
            Notas / Feedback
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="¿Cómo fue la visita? ¿Qué comentó el cliente?"
            style={{ width: "100%", background: BG_SURFACE, border: `1px solid ${BORDER_DIM}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: TEXT_PRIMARY, resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ width: "100%", padding: "10px 0", background: GOLD, color: BG_BODY, fontSize: 14, fontWeight: 700, borderRadius: 8, border: "none", cursor: saving ? "wait" : "pointer", fontFamily: "Manrope, sans-serif" }}
        >
          {saving ? "Guardando…" : "Guardar resultado"}
        </button>
      </div>
    </div>
  );
}

// ─── Schedule modal ───────────────────────────────────────────────────────────

function ScheduleModal({
  contacts,
  properties,
  onClose,
  onCreated,
  currentAgentId,
}: {
  contacts: ContactOption[];
  properties: PropertyOption[];
  onClose: () => void;
  onCreated: (showing: Showing) => void;
  currentAgentId: string;
}) {
  const [form, setForm] = useState<ScheduleForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [propSearch, setPropSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");

  const filteredProps = properties.filter((p) =>
    p.title.toLowerCase().includes(propSearch.toLowerCase()) ||
    (p.city ?? "").toLowerCase().includes(propSearch.toLowerCase())
  );
  const filteredContacts = contacts.filter((c) =>
    contactName(c).toLowerCase().includes(contactSearch.toLowerCase()) ||
    (c.phone ?? "").includes(contactSearch)
  );

  function set(field: keyof ScheduleForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.property_id || !form.contact_id || !form.scheduled_at) {
      toast.error("Propiedad, contacto y fecha son obligatorios");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("showings")
      .insert({
        property_id: form.property_id,
        contact_id: form.contact_id,
        agent_id: currentAgentId,
        scheduled_at: form.scheduled_at,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : 60,
        meeting_point: form.meeting_point || null,
        agent_notes: form.agent_notes || null,
        status: "scheduled",
      })
      .select("id, deal_id, property_id, contact_id, agent_id, scheduled_at, duration_minutes, status, client_feedback, client_interest_level, agent_notes, meeting_point, confirmed_at, completed_at, cancelled_at, cancel_reason, created_at")
      .single();

    if (error || !data) {
      toast.error("Error al agendar: " + (error?.message ?? "desconocido"));
      setSaving(false);
      return;
    }

    // Enrich with selected property + contact
    const enriched: Showing = {
      ...data,
      property: properties.find((p) => p.id === form.property_id),
      contact: contacts.find((c) => c.id === form.contact_id),
    };
    toast.success("Visita agendada");
    onCreated(enriched);
    setSaving(false);
    onClose();
  }

  const inputStyle = {
    width: "100%", background: BG_SURFACE, border: `1px solid ${BORDER_DIM}`,
    borderRadius: 8, padding: "9px 12px", fontSize: 13, color: TEXT_PRIMARY,
    outline: "none", boxSizing: "border-box" as const,
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 600 as const, color: TEXT_MUTED,
    textTransform: "uppercase" as const, letterSpacing: "0.08em",
    display: "block", marginBottom: 6,
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, background: BG_ELEVATED, border: `1px solid ${BORDER_GOLD}`, borderRadius: 16, padding: 28 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: 0, fontFamily: "Manrope, sans-serif" }}>
            Agendar visita
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: TEXT_MUTED, cursor: "pointer" }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Property picker */}
          <div>
            <label style={labelStyle}>Propiedad *</label>
            <input
              value={propSearch}
              onChange={(e) => setPropSearch(e.target.value)}
              placeholder="Buscar propiedad…"
              style={{ ...inputStyle, marginBottom: 6 }}
            />
            <select
              value={form.property_id}
              onChange={(e) => set("property_id", e.target.value)}
              style={{ ...inputStyle }}
            >
              <option value="">Seleccionar propiedad…</option>
              {filteredProps.slice(0, 30).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}{p.city ? ` — ${p.city}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Contact picker */}
          <div>
            <label style={labelStyle}>Cliente *</label>
            <input
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Buscar cliente…"
              style={{ ...inputStyle, marginBottom: 6 }}
            />
            <select
              value={form.contact_id}
              onChange={(e) => set("contact_id", e.target.value)}
              style={{ ...inputStyle }}
            >
              <option value="">Seleccionar cliente…</option>
              {filteredContacts.slice(0, 30).map((c) => (
                <option key={c.id} value={c.id}>
                  {contactName(c)}{c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Date + time */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Fecha y hora *</label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => set("scheduled_at", e.target.value)}
                style={{ ...inputStyle }}
              />
            </div>
            <div>
              <label style={labelStyle}>Duración (min)</label>
              <select
                value={form.duration_minutes}
                onChange={(e) => set("duration_minutes", e.target.value)}
                style={{ ...inputStyle }}
              >
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 hora</option>
                <option value="90">1h 30min</option>
                <option value="120">2 horas</option>
              </select>
            </div>
          </div>

          {/* Meeting point */}
          <div>
            <label style={labelStyle}>Punto de encuentro</label>
            <input
              value={form.meeting_point}
              onChange={(e) => set("meeting_point", e.target.value)}
              placeholder="Recepción del edificio, frente a la propiedad…"
              style={{ ...inputStyle }}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notas internas</label>
            <textarea
              value={form.agent_notes}
              onChange={(e) => set("agent_notes", e.target.value)}
              rows={2}
              placeholder="Recordatorios, preferencias del cliente…"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ padding: "11px 0", background: GOLD, color: BG_BODY, fontSize: 14, fontWeight: 700, borderRadius: 8, border: "none", cursor: saving ? "wait" : "pointer", fontFamily: "Manrope, sans-serif" }}
          >
            {saving ? "Agendando…" : "Agendar visita"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VisitasClient({
  initialShowings,
  contacts,
  properties,
  currentAgentId,
  isPrivileged,
}: {
  initialShowings: Showing[];
  contacts: ContactOption[];
  properties: PropertyOption[];
  currentAgentId: string;
  isPrivileged: boolean;
}) {
  const router = useRouter();
  const [showings, setShowings] = useState<Showing[]>(initialShowings);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [feedbackShowing, setFeedbackShowing] = useState<Showing | null>(null);
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");

  const now = new Date();
  const today = startOfDay(now);

  const filtered = useMemo(() => {
    return showings.filter((s) => {
      const dt = new Date(s.scheduled_at);
      if (filter === "upcoming") return dt >= today && s.status !== "cancelled";
      if (filter === "past") return dt < now || s.status === "completed" || s.status === "no_show" || s.status === "cancelled";
      return true;
    });
  }, [showings, filter, today, now]);

  // Group by date
  const groups = useMemo(() => {
    const map = new Map<string, Showing[]>();
    const sorted = [...filtered].sort((a, b) =>
      filter === "past"
        ? new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
        : new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    for (const s of sorted) {
      const key = format(new Date(s.scheduled_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [filtered, filter]);

  // Stats
  const upcomingCount = showings.filter((s) => new Date(s.scheduled_at) >= today && s.status !== "cancelled").length;
  const todayCount = showings.filter((s) => isToday(new Date(s.scheduled_at)) && s.status !== "cancelled").length;
  const completedCount = showings.filter((s) => s.status === "completed").length;

  async function handleConfirm(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("showings")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Error: " + error.message); return; }
    setShowings((prev) => prev.map((s) => s.id === id ? { ...s, status: "confirmed" as ShowingStatus, confirmed_at: new Date().toISOString() } : s));
    toast.success("Visita confirmada");
  }

  async function handleCancel(id: string) {
    const reason = window.prompt("¿Razón de cancelación? (opcional)") ?? "";
    const supabase = createClient();
    const { error } = await supabase
      .from("showings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason || null })
      .eq("id", id);
    if (error) { toast.error("Error: " + error.message); return; }
    setShowings((prev) => prev.map((s) => s.id === id ? { ...s, status: "cancelled" as ShowingStatus } : s));
    toast.success("Visita cancelada");
  }

  async function handleFeedbackSave(id: string, data: { client_interest_level: number; client_feedback: string; status: ShowingStatus }) {
    const supabase = createClient();
    const updates: Record<string, unknown> = {
      status: data.status,
      client_feedback: data.client_feedback || null,
    };
    if (data.status === "completed") {
      updates.client_interest_level = data.client_interest_level;
      updates.completed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("showings").update(updates).eq("id", id);
    if (error) { toast.error("Error: " + error.message); return; }
    setShowings((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } as Showing : s));
    setFeedbackShowing(null);
    toast.success("Resultado guardado");
    router.refresh();
  }

  const filterBtn = (v: typeof filter, label: string) => (
    <button
      onClick={() => setFilter(v)}
      style={{
        padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
        background: filter === v ? GOLD : BG_ELEVATED,
        color: filter === v ? BG_BODY : TEXT_MUTED,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG_BODY }}>
      {/* Sticky header */}
      <header
        className="px-4 md:px-8"
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(13,14,18,0.85)", backdropFilter: "blur(12px)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          height: 88,
          borderBottom: `1px solid ${BORDER_DIM}`,
        }}
      >
        <div>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: 26, fontWeight: 700, color: TEXT_PRIMARY, margin: 0, lineHeight: 1.2 }}>
            Visitas
          </h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "3px 0 0" }}>
            {upcomingCount} pendiente{upcomingCount !== 1 ? "s" : ""} · {todayCount} hoy · {completedCount} realizadas
          </p>
        </div>
        <button
          onClick={() => setScheduleOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 18px", background: GOLD, color: BG_BODY,
            fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: "Manrope, sans-serif",
          }}
        >
          <Plus style={{ width: 15, height: 15 }} />
          Agendar visita
        </button>
      </header>

      <div className="px-4 py-7 pb-16 md:px-8">
        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {filterBtn("upcoming", "Próximas")}
          {filterBtn("past", "Pasadas")}
          {filterBtn("all", "Todas")}
        </div>

        {groups.size === 0 ? (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "80px 0", gap: 14, color: TEXT_MUTED,
            }}
          >
            <CalendarDays style={{ width: 48, height: 48, opacity: 0.2 }} />
            <p style={{ fontSize: 14, margin: 0 }}>
              {filter === "upcoming" ? "No hay visitas agendadas" : "No hay visitas en este período"}
            </p>
            {filter === "upcoming" && (
              <button
                onClick={() => setScheduleOpen(true)}
                style={{ padding: "8px 18px", background: "rgba(201,150,58,0.1)", color: GOLD, fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid rgba(201,150,58,0.2)`, cursor: "pointer" }}
              >
                Agendar primera visita
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {Array.from(groups.entries()).map(([dateKey, dayShowings]) => {
              const date = new Date(dateKey + "T12:00:00");
              return (
                <div key={dateKey}>
                  {/* Day header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div style={{ textAlign: "center", width: 48 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: isToday(date) ? GOLD : TEXT_PRIMARY, fontFamily: "Manrope, sans-serif", lineHeight: 1 }}>
                        {format(date, "d")}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {format(date, "MMM", { locale: es })}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isToday(date) ? GOLD : TEXT_PRIMARY, textTransform: "capitalize" }}>
                        {dayLabel(date)}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_MUTED }}>{dayShowings.length} visita{dayShowings.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ height: 1, flex: 3, background: BORDER_DIM }} />
                  </div>

                  {/* Cards grid */}
                  <div className="pl-0 md:pl-[60px]" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
                    {dayShowings.map((s) => (
                      <ShowingCard
                        key={s.id}
                        showing={s}
                        onConfirm={handleConfirm}
                        onComplete={() => setFeedbackShowing(s)}
                        onCancel={handleCancel}
                        onFeedback={setFeedbackShowing}
                        isPast={isPast(new Date(s.scheduled_at))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {scheduleOpen && (
        <ScheduleModal
          contacts={contacts}
          properties={properties}
          currentAgentId={currentAgentId}
          onClose={() => setScheduleOpen(false)}
          onCreated={(s) => setShowings((prev) => [s, ...prev])}
        />
      )}
      {feedbackShowing && (
        <FeedbackModal
          showing={feedbackShowing}
          onClose={() => setFeedbackShowing(null)}
          onSave={handleFeedbackSave}
        />
      )}
    </div>
  );
}
