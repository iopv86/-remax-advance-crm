export type LeadClassification = "hot" | "warm" | "cold" | "unqualified";
export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "nurturing" | "archived";
export type LeadSource = "ctwa_ad" | "lead_form" | "referral" | "walk_in" | "website" | "social_media" | "other";
export type DealStage = "lead_captured" | "qualified" | "contacted" | "showing_scheduled" | "showing_done" | "offer_made" | "negotiation" | "contract" | "closed_won" | "closed_lost";
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
  deal_value?: number;
  currency?: CurrencyType;
  commission_percentage?: number;
  expected_close_date?: string;
  actual_close_date?: string;
  lost_reason?: string;
  notes?: string;
  created_at: string;
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
  contract: "Contrato firmado",
  closed_won: "Cerrado/Ganado",
  closed_lost: "Cerrado/Perdido",
};

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
