export type LeadClassification = "hot" | "warm" | "cold" | "unqualified";
export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "nurturing" | "archived";
export type LeadSource = "ctwa_ad" | "lead_form" | "referral" | "walk_in" | "website" | "social_media" | "other";
export type DealStage = "lead_captured" | "qualified" | "contacted" | "showing_scheduled" | "showing_done" | "offer_made" | "negotiation" | "promesa_de_venta" | "financiamiento" | "contract" | "due_diligence" | "closed_won" | "closed_lost";
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
  property_type_interest?: PropertyType;
  purpose?: string;
  payment_method?: string;
  timeline?: string;
  last_activity_at?: string;
  created_at: string;
  // Joined
  agent?: Agent;
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
  currency?: CurrencyType;
  location_city?: string;
  location_sector?: string;
  bedrooms?: number;
  bathrooms?: number;
  area_m2?: number;
  images?: string[];
  status: "active" | "reserved" | "sold" | "rented" | "inactive";
  created_at: string;
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
}

export const STAGE_LABELS: Record<DealStage, string> = {
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
