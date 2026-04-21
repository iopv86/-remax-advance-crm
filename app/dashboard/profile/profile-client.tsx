"use client";

import { useState, useRef } from "react";
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
  Camera,
} from "lucide-react";

// Inline SVG social icons
function IconInstagram({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}
function IconFacebook({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );
}
function IconLinkedin({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect x="2" y="9" width="4" height="12"/>
      <circle cx="4" cy="4" r="2"/>
    </svg>
  );
}
function IconTiktok({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9.02a8.16 8.16 0 0 0 4.77 1.52V7.1a4.85 4.85 0 0 1-1-.41z"/>
    </svg>
  );
}

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
  instagram_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  tiktok_url: string | null;
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

const SOCIAL_META = [
  { key: "instagram_url", label: "Instagram", icon: IconInstagram, color: "#e1306c", prefix: "instagram.com/", urlBase: "https://instagram.com/", placeholder: "tu_usuario" },
  { key: "facebook_url",  label: "Facebook",  icon: IconFacebook,  color: "#1877f2", prefix: "facebook.com/",  urlBase: "https://facebook.com/",  placeholder: "tu.perfil" },
  { key: "linkedin_url",  label: "LinkedIn",  icon: IconLinkedin,  color: "#0a66c2", prefix: "linkedin.com/in/", urlBase: "https://linkedin.com/in/", placeholder: "tu-perfil" },
  { key: "tiktok_url",    label: "TikTok",    icon: IconTiktok,    color: "#fe2c55", prefix: "tiktok.com/@",    urlBase: "https://tiktok.com/@",    placeholder: "tu_usuario" },
] as const;

// Strip full URLs down to just the username when loading from DB (handles legacy full-URL data)
function toUsername(val: string | null | undefined): string {
  if (!val) return "";
  return val
    .replace(/^https?:\/\/(www\.)?/, "")  // strip protocol + optional www
    .replace(/^(instagram|facebook|linkedin|tiktok)\.com\/(in\/|@)?/, "")  // strip domain + path prefix
    .replace(/\/$/, "");  // strip trailing slash
}

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

function InfoRow({ icon: Icon, label, value, href, iconColor }: {
  icon: React.ElementType;
  label: string;
  value: string;
  href?: string;
  iconColor?: string;
}) {
  const inner = (
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
        background: iconColor ? `${iconColor}15` : "rgba(201,150,58,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={16} color={iconColor ?? T.gold} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {label}
        </p>
        <p style={{
          fontSize: 14,
          fontWeight: 500,
          color: href ? T.primary : T.onSurface,
          marginTop: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {value || "—"}
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </a>
    );
  }
  return inner;
}

function inputStyle(focused: boolean = false) {
  return {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${focused ? "rgba(201,150,58,0.5)" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    color: T.onSurface,
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border 0.15s",
  };
}

export function ProfileClient({ agent, stats }: { agent: Agent | null; stats: Stats }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit fields
  const [fullName, setFullName]   = useState(agent?.full_name ?? "");
  const [phone, setPhone]         = useState(agent?.phone ?? "");
  const [whatsapp, setWhatsapp]   = useState(agent?.whatsapp_number ?? "");
  const [instagram, setInstagram] = useState(toUsername(agent?.instagram_url));
  const [facebook, setFacebook]   = useState(toUsername(agent?.facebook_url));
  const [linkedin, setLinkedin]   = useState(toUsername(agent?.linkedin_url));
  const [tiktok, setTiktok]       = useState(toUsername(agent?.tiktok_url));

  // Avatar display (optimistic update after upload)
  const [avatarUrl, setAvatarUrl] = useState(agent?.avatar_url ?? null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ─── Avatar upload ────────────────────────────────────────────────────────

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !agent) return;

    setUploadingAvatar(true);
    const supabase = createClient();

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${agent.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error("Error al subir imagen");
      setUploadingAvatar(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("agents")
      .update({ avatar_url: publicUrl })
      .eq("id", agent.id);

    setUploadingAvatar(false);

    if (updateError) {
      toast.error("Error al guardar foto");
    } else {
      setAvatarUrl(publicUrl + `?t=${Date.now()}`);
      toast.success("Foto de perfil actualizada");
    }
  }

  // ─── Save profile ─────────────────────────────────────────────────────────

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("agents")
      .update({
        full_name:      fullName,
        phone:          phone || null,
        whatsapp_number: whatsapp || null,
        instagram_url:  toUsername(instagram) || null,
        facebook_url:   toUsername(facebook) || null,
        linkedin_url:   toUsername(linkedin) || null,
        tiktok_url:     toUsername(tiktok) || null,
      })
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
    setInstagram(toUsername(agent?.instagram_url));
    setFacebook(toUsername(agent?.facebook_url));
    setLinkedin(toUsername(agent?.linkedin_url));
    setTiktok(toUsername(agent?.tiktok_url));
    setEditing(false);
  }

  const socialValues: Record<string, string> = {
    instagram_url: instagram,
    facebook_url:  facebook,
    linkedin_url:  linkedin,
    tiktok_url:    tiktok,
  };

  const hasSocial = [agent?.instagram_url, agent?.facebook_url, agent?.linkedin_url, agent?.tiktok_url].some(Boolean);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.onSurface }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={handleAvatarChange}
      />

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
          {/* Avatar with upload overlay */}
          <div
            style={{ position: "relative", flexShrink: 0, cursor: "pointer" }}
            onClick={() => fileInputRef.current?.click()}
            title="Cambiar foto de perfil"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={agent?.full_name}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 24,
                  objectFit: "cover",
                  boxShadow: "0 0 0 3px rgba(201,150,58,0.2), 0 20px 40px rgba(0,0,0,0.4)",
                  display: "block",
                }}
              />
            ) : (
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
            )}

            {/* Upload overlay */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: 24,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              opacity: uploadingAvatar ? 1 : 0,
              transition: "opacity 0.2s",
            }}
              onMouseEnter={(e) => { if (!uploadingAvatar) (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { if (!uploadingAvatar) (e.currentTarget as HTMLDivElement).style.opacity = "0"; }}
            >
              <Camera size={20} color="#fff" />
              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {uploadingAvatar ? "Subiendo..." : "Cambiar"}
              </span>
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
              zIndex: 1,
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
          <StatCard icon={Users}       label="Clientes"           value={stats.totalContacts} color={T.primary} />
          <StatCard icon={Briefcase}   label="Deals activos"      value={stats.totalDeals}    color="#60a5fa" />
          <StatCard icon={TrendingUp}  label="Deals ganados"      value={stats.dealsWon}      color="#10b981" />
          <StatCard icon={CheckSquare} label="Tareas pendientes"  value={stats.pendingTasks}  color="#f87171" />
        </div>

        {/* Two columns: info + edit/account */}
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

            {/* Social links (view mode) */}
            {hasSocial && (
              <>
                <p style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: T.stone500,
                  marginTop: 20,
                  marginBottom: 4,
                }}>
                  Redes sociales
                </p>
                {SOCIAL_META.map(({ key, label, icon, color, prefix, urlBase }) => {
                  const raw = (agent as unknown as Record<string, string | null>)[key];
                  const username = toUsername(raw);
                  if (!username) return null;
                  return (
                    <InfoRow
                      key={key}
                      icon={icon}
                      label={label}
                      value={prefix + username}
                      href={urlBase + username}
                      iconColor={color}
                    />
                  );
                })}
              </>
            )}

            <div style={{ height: 16 }} />
          </div>

          {/* Right: edit form or account card */}
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
                      style={inputStyle()}
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
                      style={inputStyle()}
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
                      style={inputStyle()}
                      onFocus={(e) => { e.target.style.borderColor = "rgba(201,150,58,0.5)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
                    />
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 18 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: T.stone500, marginBottom: 16 }}>
                      Redes sociales
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {SOCIAL_META.map(({ key, label, icon: Icon, color, prefix, placeholder }) => (
                        <div key={key}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: T.stone500, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <Icon size={12} color={color} />
                            {label}
                          </label>
                          <div style={{ display: "flex", alignItems: "center", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.04)" }}>
                            <span style={{ padding: "10px 10px 10px 14px", fontSize: 12, color: T.stone500, whiteSpace: "nowrap", borderRight: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                              {prefix}
                            </span>
                            <input
                              value={socialValues[key]}
                              onChange={(e) => {
                                if (key === "instagram_url") setInstagram(e.target.value);
                                else if (key === "facebook_url") setFacebook(e.target.value);
                                else if (key === "linkedin_url") setLinkedin(e.target.value);
                                else if (key === "tiktok_url") setTiktok(e.target.value);
                              }}
                              placeholder={placeholder}
                              style={{ ...inputStyle(), border: "none", borderRadius: 0, background: "transparent", flex: 1 }}
                              onFocus={(e) => { (e.target.closest("div") as HTMLElement).style.borderColor = `${color}80`; }}
                              onBlur={(e) => {
                                (e.target.closest("div") as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)";
                                const v = toUsername(e.target.value);
                                if (key === "instagram_url") setInstagram(v);
                                else if (key === "facebook_url") setFacebook(v);
                                else if (key === "linkedin_url") setLinkedin(v);
                                else if (key === "tiktok_url") setTiktok(v);
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
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
