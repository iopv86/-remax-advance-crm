"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  User,
  Phone,
  MessageCircle,
  Mail,
  Shield,
  Calendar,
  TrendingUp,
  CheckSquare,
  Users,
  Briefcase,
  Edit3,
  Save,
  X,
} from "lucide-react";

interface Agent {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp_number: string | null;
  role: string;
  avatar_url: string | null;
  is_active: boolean;
  max_leads_per_week: number | null;
  created_at: string;
}

interface Stats {
  totalContacts: number;
  totalDeals: number;
  dealsWon: number;
  pendingTasks: number;
}

const T = {
  bg: "#0e0e0e",
  card: "#1c1b1b",
  cardBorder: "rgba(201,150,58,0.12)",
  primary: "#f5bd5d",
  primaryContainer: "#c9963a",
  onSurface: "#e5e2e1",
  onSurfaceVariant: "#d3c4b1",
  stone500: "#78716c",
  gold: "#C9963A",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  agent: "Agente",
  viewer: "Visualizador",
};

const ROLE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  admin:   { bg: "rgba(239,68,68,0.12)",   color: "#f87171", border: "rgba(239,68,68,0.25)" },
  manager: { bg: "rgba(201,150,58,0.15)",  color: "#f5bd5d", border: "rgba(201,150,58,0.3)" },
  agent:   { bg: "rgba(59,130,246,0.12)",  color: "#60a5fa", border: "rgba(59,130,246,0.25)" },
  viewer:  { bg: "rgba(120,113,108,0.15)", color: "#a8a29e", border: "rgba(120,113,108,0.3)" },
};

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 16,
      padding: "24px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <p style={{
          fontFamily: "Manrope, sans-serif",
          fontWeight: 800,
          fontSize: 32,
          letterSpacing: "-0.02em",
          color: T.onSurface,
          lineHeight: 1,
        }}>
          {value}
        </p>
        <p style={{
          fontSize: 11,
          fontWeight: 600,
          color: T.stone500,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginTop: 6,
        }}>
          {label}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: "rgba(201,150,58,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={16} color={T.gold} />
      </div>
      <div>
        <p style={{ fontSize: 10, fontWeight: 600, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {label}
        </p>
        <p style={{ fontSize: 14, fontWeight: 500, color: T.onSurface, marginTop: 2 }}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export function ProfileClient({ agent, stats }: { agent: Agent | null; stats: Stats }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(agent?.full_name ?? "");
  const [phone, setPhone] = useState(agent?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(agent?.whatsapp_number ?? "");

  const initials = fullName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const role = agent?.role ?? "agent";
  const roleBadge = ROLE_COLORS[role] ?? ROLE_COLORS.agent;
  const memberSince = agent?.created_at
    ? new Date(agent.created_at).toLocaleDateString("es-DO", { month: "long", year: "numeric" })
    : "—";

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("agents")
      .update({ full_name: fullName, phone: phone || null, whatsapp_number: whatsapp || null })
      .eq("id", agent.id);
    setSaving(false);
    if (error) {
      toast.error("Error al guardar");
    } else {
      toast.success("Perfil actualizado");
      setEditing(false);
    }
  }

  function handleCancel() {
    setFullName(agent?.full_name ?? "");
    setPhone(agent?.phone ?? "");
    setWhatsapp(agent?.whatsapp_number ?? "");
    setEditing(false);
  }

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.onSurface }}>
      {/* Header strip */}
      <div style={{
        background: "linear-gradient(135deg, rgba(201,150,58,0.06) 0%, rgba(14,14,14,0) 60%)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        padding: "32px 40px 0",
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 24 }}>
          Mi Perfil
        </p>

        {/* Avatar + name + role */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 28, paddingBottom: 32 }}>
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: `linear-gradient(135deg, ${T.primary}, ${T.primaryContainer})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 800,
              color: "#281900",
              fontFamily: "Manrope, sans-serif",
              boxShadow: "0 0 0 3px rgba(201,150,58,0.2), 0 20px 40px rgba(0,0,0,0.4)",
            }}>
              {initials}
            </div>
            {/* Active indicator */}
            <div style={{
              position: "absolute",
              bottom: 6,
              right: 6,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: agent?.is_active ? "#10b981" : "#78716c",
              border: "2px solid #0e0e0e",
            }} />
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 800,
                fontSize: 28,
                letterSpacing: "-0.03em",
                color: T.onSurface,
              }}>
                {agent?.full_name ?? "Sin nombre"}
              </h1>
              <span style={{
                padding: "4px 12px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: roleBadge.bg,
                color: roleBadge.color,
                border: `1px solid ${roleBadge.border}`,
              }}>
                {ROLE_LABELS[role] ?? role}
              </span>
            </div>
            <p style={{ fontSize: 14, color: T.stone500, marginTop: 6 }}>
              {agent?.email}
            </p>
            <p style={{ fontSize: 12, color: T.stone500, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={12} />
              Miembro desde {memberSince}
            </p>
          </div>

          {/* Edit button */}
          <div style={{ paddingBottom: 4 }}>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  borderRadius: 12,
                  background: "rgba(201,150,58,0.1)",
                  border: "1px solid rgba(201,150,58,0.25)",
                  color: T.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,150,58,0.18)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,150,58,0.1)"; }}
              >
                <Edit3 size={14} />
                Editar perfil
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 20px",
                    borderRadius: 12,
                    background: T.primaryContainer,
                    border: "none",
                    color: "#281900",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  <Save size={14} />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: T.stone500,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "36px 40px", display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          <StatCard icon={Users}      label="Clientes"        value={stats.totalContacts} color={T.primary} />
          <StatCard icon={Briefcase}  label="Deals activos"   value={stats.totalDeals}    color="#60a5fa" />
          <StatCard icon={TrendingUp} label="Deals ganados"   value={stats.dealsWon}      color="#10b981" />
          <StatCard icon={CheckSquare} label="Tareas pendientes" value={stats.pendingTasks} color="#f87171" />
        </div>

        {/* Two columns: info + edit */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }}>

          {/* Left: contact info */}
          <div style={{
            background: T.card,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 20,
            padding: "28px 28px 8px",
          }}>
            <p style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: T.stone500,
              marginBottom: 4,
            }}>
              Información de contacto
            </p>

            <InfoRow icon={Mail}          label="Email"      value={agent?.email ?? ""} />
            <InfoRow icon={Phone}         label="Teléfono"   value={agent?.phone ?? ""} />
            <InfoRow icon={MessageCircle} label="WhatsApp"   value={agent?.whatsapp_number ?? ""} />
            <InfoRow icon={Shield}        label="Rol"        value={ROLE_LABELS[role] ?? role} />
            <InfoRow icon={User}          label="Max leads / semana" value={agent?.max_leads_per_week ? String(agent.max_leads_per_week) : "Sin límite"} />
            <div style={{ height: 16 }} />
          </div>

          {/* Right: edit form (visible only when editing) or activity */}
          <div>
            {editing ? (
              <div style={{
                background: T.card,
                border: "1px solid rgba(201,150,58,0.25)",
                borderRadius: 20,
                padding: 28,
              }}>
                <p style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: T.primary,
                  marginBottom: 24,
                }}>
                  Editar información
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {/* Full name */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
                      Nombre completo
                    </label>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: "10px 14px",
                        fontSize: 14,
                        color: T.onSurface,
                        outline: "none",
                        boxSizing: "border-box",
                        transition: "border 0.15s",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "rgba(201,150,58,0.5)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
                      Teléfono
                    </label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 809 000 0000"
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: "10px 14px",
                        fontSize: 14,
                        color: T.onSurface,
                        outline: "none",
                        boxSizing: "border-box",
                        transition: "border 0.15s",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "rgba(201,150,58,0.5)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
                    />
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
                      WhatsApp
                    </label>
                    <input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+1 809 000 0000"
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: "10px 14px",
                        fontSize: 14,
                        color: T.onSurface,
                        outline: "none",
                        boxSizing: "border-box",
                        transition: "border 0.15s",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "rgba(201,150,58,0.5)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Account info card */
              <div style={{
                background: "linear-gradient(135deg, rgba(201,150,58,0.05), rgba(14,14,14,0))",
                border: `1px solid ${T.cardBorder}`,
                borderRadius: 20,
                padding: 28,
              }}>
                <p style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: T.stone500,
                  marginBottom: 20,
                }}>
                  Estado de la cuenta
                </p>

                {/* Active status */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  borderRadius: 12,
                  background: agent?.is_active
                    ? "rgba(16,185,129,0.08)"
                    : "rgba(120,113,108,0.08)",
                  border: `1px solid ${agent?.is_active ? "rgba(16,185,129,0.2)" : "rgba(120,113,108,0.2)"}`,
                  marginBottom: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: agent?.is_active ? "#10b981" : "#78716c",
                    }} />
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: agent?.is_active ? "#34d399" : "#a8a29e",
                    }}>
                      {agent?.is_active ? "Cuenta activa" : "Cuenta inactiva"}
                    </span>
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <a
                    href="https://calendar.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 16px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      textDecoration: "none",
                      color: T.onSurfaceVariant,
                      fontSize: 13,
                      fontWeight: 500,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.03)"; }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.primary, fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
                      calendar_today
                    </span>
                    Abrir Google Calendar
                  </a>

                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 16px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      textDecoration: "none",
                      color: T.onSurfaceVariant,
                      fontSize: 13,
                      fontWeight: 500,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.03)"; }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.primary, fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
                      mail
                    </span>
                    Abrir Gmail
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
