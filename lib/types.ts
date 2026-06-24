export type LeadClassification = "hot" | "warm" | "cold" | "unqualified";
export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "nurturing" | "archived";
export type LeadSource = "ctwa_ad" | "lead_form" | "referral" | "walk_in" | "website" | "social_media" | "other";
export type DealStage = "nuevo_sin_contactar" | "lead_captured" | "qualified" | "contacted" | "showing_scheduled" | "showing_done" | "offer_made" | "negotiation" | "promesa_de_venta" | "financiamiento" | "contract" | "due_diligence" | "closed_won" | "closed_lost";
export type PropertyType = "apartment" | "penthouse" | "villa" | "house" | "land" | "commercial" | "apart_hotel" | "farm";
export type CurrencyType = "USD" | "DOP";
export type AgentRole = "admin" | "manager" | "agent";

export interface Agent {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: AgentRole;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  agent_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  whatsapp_number?: string;
  source?: LeadSource;
  lead_score?: number;
  lead_status?: LeadStatus;
  lead_classification?: LeadClassification;
  budget_min?: number;
  budget_max?: number;
  budget_currency?: CurrencyType;
  preferred_locations?: string[];
  property_type_interest?: PropertyType | null; // legacy scalar (auto-synced mirror of property_types; retired in 1C)
  property_types?: PropertyType[] | null;       // canonical multi-select (migration 0015)
  operation_type?: "buy" | "sell" | "rent" | null;
  condition?: "ready" | "under_construction" | "any" | null;
  desired_amenities?: string[];                 // property has_* keys (migration 0006 vocabulary)
  bedrooms?: number | null;                     // desired bedrooms (DB column wired CRM-side in 1A)
  purpose?: string;
  payment_method?: string;
  timeline?: string;
  last_activity_at?: string;
  created_at: string;
  meta_campaign_id?: string | null;
  meta_lead_id?: string | null;
  ai_summary?: string | null;
  agent_notes?: string | null;
  // B-16: full-page editor + lead-form capture (migration 0013)
  decision_maker?: string | null;
  linked_property_id?: string | null;
  lead_form_answers?: LeadFormAnswers | null;
  source_detail?: string | null;
  // Joined
  agent?: Agent;
}

/** Lossless capture of a Meta Lead Form submission (contacts.lead_form_answers). */
export interface LeadFormAnswer {
  name: string;
  label: string;
  values: string[];
}

export interface LeadFormAnswers {
  lead_id?: string;
  form_id?: string | null;
  captured_at?: string;
  fields: LeadFormAnswer[];
}

export interface Deal {
  id: string;
  contact_id: string;
  property_id?: string;
  agent_id: string;
  stage: DealStage;
  previous_stage?: DealStage;
  deal_value?: number;
  currency?: CurrencyType;
  commission_percentage?: number;
  commission_value?: number;
  expected_close_date?: string;
  actual_close_date?: string;
  stage_entered_at?: string;
  lost_reason?: string;
  lost_detail?: string;
  won_notes?: string;
  notes?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  created_at: string;
  updated_at?: string;
  contact?: Contact;
  agent?: Agent;
}

export interface Property {
  id: string;
  agent_id: string;
  title: string;
  description?: string;
  property_type: PropertyType;
  transaction_type: "sale" | "rent";
  price?: number;
  price_max?: number;
  currency?: CurrencyType;
  city?: string;
  sector?: string;
  bedrooms?: number;
  bathrooms?: number;
  area_m2?: number;
  images?: string[];
  status: "active" | "reserved" | "sold" | "rented" | "inactive";
  is_project?: boolean;
  is_exclusive?: boolean;
  is_featured?: boolean;
  lot_area_m2?: number;
  total_floors?: number;
  commission_pct?: number;
  separation_fee?: number;
  guarantee_months?: number;
  // Amenity booleans (migration 0006)
  has_pool?: boolean;
  has_gym?: boolean;
  has_terrace?: boolean;
  has_security?: boolean;
  has_elevator?: boolean;
  has_covered_parking?: boolean;
  has_generator?: boolean;
  has_storage?: boolean;
  has_laundry?: boolean;
  has_furnished?: boolean;
  has_balcony?: boolean;
  has_staff_quarters?: boolean;
  has_solar_panels?: boolean;
  has_jacuzzi?: boolean;
  has_ocean_view?: boolean;
  has_city_view?: boolean;
  has_club_house?: boolean;
  has_kids_area?: boolean;
  created_at: string;
}

// ─── Property owners (Propietarios) — migration 0017 ──────────────────────────
// PII (name + phone) is owner-scoped via RLS: readable/writable only by the
// listing agent of the parent property + admin/manager.
export interface PropertyOwner {
  id: string;
  property_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

// Form/write input — server supplies property_id, is_primary (by position), timestamps.
export interface PropertyOwnerInput {
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

// ─── Deal parties (Co-comprador / Referidor) — migration 0018 ─────────────────
// PII (name + phone) is deal-scoped via RLS: readable/writable only by the owning
// agent of the parent deal + admin/manager.
export type DealPartyType = "co_buyer" | "referrer";

export interface DealParty {
  id: string;
  deal_id: string;
  party_type: DealPartyType;
  full_name: string;
  phone: string | null;
  relationship: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Form/write input — server supplies deal_id, timestamps.
export interface DealPartyInput {
  party_type: DealPartyType;
  full_name: string;
  phone: string | null;
  relationship: string | null;
  notes: string | null;
}

// ─── Deal installments (Plan de pagos) — migration 0019 ───────────────────────
// Deal-scoped via RLS (owner agent + admin/manager). One currency per plan,
// inherited from the deal. "vencida" is DERIVED at read time, never stored.
export type DealInstallmentKind = "reserva" | "inicial" | "saldo" | "otro";
export type DealInstallmentStatus = "pendiente" | "pagada"; // vencida derived

export interface DealInstallment {
  id: string;
  deal_id: string;
  kind: DealInstallmentKind;
  label: string | null;
  amount: number;
  currency: CurrencyType;
  due_date: string | null;   // ISO date (YYYY-MM-DD)
  status: DealInstallmentStatus;
  paid_date: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Form/write input — server supplies deal_id, sort_order (by position), timestamps.
export interface DealInstallmentInput {
  kind: DealInstallmentKind;
  label: string | null;
  amount: number;
  currency: CurrencyType;
  due_date: string | null;
  status: DealInstallmentStatus;
  paid_date: string | null;
  notes: string | null;
}

export const INSTALLMENT_KIND_LABELS: Record<DealInstallmentKind, string> = {
  reserva: "Reserva / Separación",
  inicial: "Inicial",
  saldo: "Saldo a financiamiento",
  otro: "Otro",
};

// Derived presentation status (vencida computed; not a DB value).
export type DealInstallmentDerivedStatus = "pendiente" | "pagada" | "vencida";

export type UnitEstado = "disponible" | "vendido" | "reservado" | "bloqueado";

export interface ProjectUnit {
  id: string;
  property_id: string;
  nombre_unidad: string;
  seccion?: string | null;
  nivel?: number | null;
  habitaciones?: number | null;
  banos?: number | null;
  medios_banos?: number | null;
  estacionamientos?: number | null;
  m2_construido?: number | null;
  m2_extra?: number | null;
  m2_terreno?: number | null;
  m2_parqueo?: number | null;
  precio_venta?: number | null;
  moneda_venta?: CurrencyType | null;
  precio_mantenimiento?: number | null;
  moneda_mantenimiento?: CurrencyType | null;
  precio_separacion?: number | null;
  moneda_separacion?: CurrencyType | null;
  precio_amueblado?: number | null;
  estado: UnitEstado;
  etapa?: string | null;
  notas?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Message {
  id: string;
  contact_id: string;
  agent_id?: string;
  direction: "inbound" | "outbound";
  channel: "whatsapp" | "email" | "sms";
  content: string;
  is_automated: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  agent_id: string;
  contact_id?: string;
  deal_id?: string;
  title: string;
  description?: string;
  due_date?: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  is_automated: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
  updated_at?: string;
  created_at: string;
  contact?: Contact;
  gcal_event_id?: string | null;
  gcal_synced_at?: string | null;
}

export const STAGE_LABELS: Record<DealStage, string> = {
  nuevo_sin_contactar: "Nuevo sin contactar",
  lead_captured: "Lead capturado",
  qualified: "Calificado",
  contacted: "Contactado",
  showing_scheduled: "Visita agendada",
  showing_done: "Visita realizada",
  offer_made: "Oferta presentada",
  negotiation: "En negociación",
  promesa_de_venta: "Promesa de venta",
  financiamiento: "Financiamiento",
  contract: "Contrato firmado",
  due_diligence: "Due diligence",
  closed_won: "Cerrado/Ganado",
  closed_lost: "Cerrado/Perdido",
};

/**
 * Etapas que NO cuentan como pipeline real. Fuente única de verdad para excluir
 * de reportes/KPI/forecast. Usar este set explícito — NUNCA comparación ordinal
 * del enum (ADD VALUE BEFORE cambia enumsortorder y la rompe).
 */
export const NON_COUNTABLE_STAGES: DealStage[] = ["nuevo_sin_contactar"];

/** Orden del kanban (incluye holding stage primero). */
export const PIPELINE_STAGE_ORDER: DealStage[] = [
  "nuevo_sin_contactar",
  "lead_captured",
  "qualified",
  "contacted",
  "showing_scheduled",
  "showing_done",
  "offer_made",
  "negotiation",
  "promesa_de_venta",
  "financiamiento",
  "contract",
  "due_diligence",
  "closed_won",
  "closed_lost",
];

/** Raw row from agent_monthly_kpis view */
export interface AgentKPIView {
  agent_id: string;
  full_name: string;
  deals_closed: number;
  deals_active: number;
  total_revenue: number;
  pipeline_value: number;
  avg_ticket_value: number | null;
  stalled_deals_count: number;
  conversion_rate: number | null;
  task_completion_rate: number | null;
  avg_followup_days: number | null;
  fast_response_rate: number | null;
}

/** Raw row from agent_response_times view */
export interface AgentResponseTimeView {
  agent_id: string;
  full_name: string;
  avg_response_minutes: number | null;
  contacts_responded: number;
  lead_to_contact_rate: number | null;
}

/** Raw row from agent_historical_kpis view */
export interface AgentHistoricalKPIView {
  agent_id: string;
  full_name: string;
  month: string;
  year: number;
  deals_closed: number;
  total_revenue: number;
  total_deals: number;
  avg_ticket_value: number | null;
}

/**
 * Processed type consumed by AgentsClient.
 * Built explicitly from AgentKPIView + AgentResponseTimeView + deal fallback.
 * Never cast to this type — always construct with toAgentKPISummary().
 */
export interface AgentKPISummary {
  id: string;
  name: string;
  role: AgentRole;
  closedDeals: number;
  activeDeals: number;
  revenue: number;
  pipelineValue: number;
  avgTicketValue: number | null;
  stalledDeals: number;
  conversionRate: number | null;
  avgResponseMinutes: number | null;
  leadToContactRate: number | null;
  history: AgentHistoricalKPIView[];
  captacionesObjetivo: number | null;
  facturacionObjetivo: number | null;
  taskCompletionRate: number | null;
  avgFollowupDays: number | null;
  fastResponseRate: number | null;
}

export const CLASSIFICATION_COLORS: Record<LeadClassification, string> = {
  hot: "bg-red-100 text-red-800 border-red-200",
  warm: "bg-orange-100 text-orange-800 border-orange-200",
  cold: "bg-blue-100 text-blue-800 border-blue-200",
  unqualified: "bg-gray-100 text-gray-600 border-gray-200",
};

export const CLASSIFICATION_LABELS: Record<LeadClassification, string> = {
  hot: "🔥 HOT",
  warm: "🟠 WARM",
  cold: "❄️ COLD",
  unqualified: "UNQUALIFIED",
};

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const PRIORITY_COLORS: Record<TaskPriority, { bg: string; text: string; dot: string }> = {
  urgent: { bg: "rgba(239,68,68,0.08)",   text: "#ef4444", dot: "#ef4444" },
  high:   { bg: "rgba(201,150,58,0.08)",  text: "#C9963A", dot: "#C9963A" },
  medium: { bg: "rgba(59,130,246,0.08)",  text: "#3b82f6", dot: "#3b82f6" },
  low:    { bg: "rgba(100,116,139,0.08)", text: "#64748b", dot: "#94a3b8" },
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};
