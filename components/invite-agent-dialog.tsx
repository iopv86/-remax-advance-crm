"use client";

import { useState, useTransition } from "react";
import { X, UserPlus, Phone, MessageCircle, Mail, User, Shield } from "lucide-react";
import { inviteAgent } from "@/app/dashboard/settings/actions";

interface Props {
  open: boolean;
  onClose: () => void;
}

type AgentRole = "admin" | "manager" | "agent" | "viewer";

const ROLES: { value: AgentRole; label: string; description: string; color: string }[] = [
  { value: "admin",   label: "Administrador", description: "Acceso total al sistema",          color: "#f87171" },
  { value: "manager", label: "Gerente",        description: "Ve todos los datos del equipo",   color: "#f5bd5d" },
  { value: "agent",   label: "Agente",         description: "Solo sus propios clientes/deals", color: "#60a5fa" },
  { value: "viewer",  label: "Visualizador",   description: "Solo lectura, sin editar",        color: "#a8a29e" },
];

const T = {
  bg: "#141418",
  border: "rgba(201,150,58,0.15)",
  muted: "rgba(255,255,255,0.3)",
  surface: "rgba(255,255,255,0.04)",
  gold: "#C9963A",
  goldLight: "#f5bd5d",
  onSurface: "#e5e2e1",
};

function Field({
  label, icon: Icon, children,
}: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: T.muted,
        marginBottom: 8,
      }}>
        <Icon size={11} />
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value, onChange, placeholder, type = "text", required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      style={{
        width: "100%",
        background: T.surface,
        border: `1px solid rgba(255,255,255,0.08)`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 14,
        color: T.onSurface,
        outline: "none",
        boxSizing: "border-box",
        transition: "border 0.15s",
      }}
      onFocus={(e) => { e.target.style.borderColor = "rgba(201,150,58,0.5)"; }}
      onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; }}
    />
  );
}

export function InviteAgentDialog({ open, onClose }: Props) {
  const [email, setEmail]       = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole]         = useState<AgentRole>("agent");
  const [phone, setPhone]       = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [maxLeads, setMaxLeads] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmail(""); setFullName(""); setRole("agent");
    setPhone(""); setWhatsapp(""); setMaxLeads("");
    setError(null); setSuccess(false);
  }

  function handleClose() { reset(); onClose(); }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteAgent({
        email,
        fullName,
        role,
        phone: phone || undefined,
        whatsappNumber: whatsapp || undefined,
        maxLeadsPerWeek: maxLeads ? parseInt(maxLeads, 10) : undefined,
      });
      if (result.ok) {
        setSuccess(true);
        setTimeout(() => { reset(); onClose(); }, 1800);
      } else {
        setError(result.error ?? "Error desconocido");
      }
    });
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 520,
        maxHeight: "90vh",
        overflowY: "auto",
        borderRadius: 24,
        padding: "32px 32px 28px",
        background: T.bg,
        border: T.border,
        boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,150,58,0.12)",
      }}>
        {/* Close */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "rgba(255,255,255,0.05)",
            border: "none",
            color: T.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "rgba(201,150,58,0.1)",
            border: "1px solid rgba(201,150,58,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <UserPlus size={20} color={T.gold} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: T.onSurface, fontFamily: "Manrope, sans-serif" }}>
              Invitar agente
            </h2>
            <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              Se enviará un correo de activación
            </p>
          </div>
        </div>

        {success ? (
          <div style={{
            textAlign: "center",
            padding: "32px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}>
              ✓
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#34d399" }}>Invitación enviada</p>
            <p style={{ fontSize: 12, color: T.muted }}>{email}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Name + Email */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Nombre completo" icon={User}>
                <TextInput value={fullName} onChange={setFullName} placeholder="Ana García" required />
              </Field>
              <Field label="Correo electrónico" icon={Mail}>
                <TextInput value={email} onChange={setEmail} placeholder="ana@advance.com" type="email" required />
              </Field>
            </div>

            {/* Role selector */}
            <Field label="Rol en el sistema" icon={Shield}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: role === r.value ? `${r.color}14` : T.surface,
                      border: `1px solid ${role === r.value ? `${r.color}40` : "rgba(255,255,255,0.07)"}`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, color: role === r.value ? r.color : T.onSurface }}>
                      {r.label}
                    </p>
                    <p style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                      {r.description}
                    </p>
                  </button>
                ))}
              </div>
            </Field>

            {/* Phone + WhatsApp */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Teléfono" icon={Phone}>
                <TextInput value={phone} onChange={setPhone} placeholder="+1 809 000 0000" />
              </Field>
              <Field label="WhatsApp" icon={MessageCircle}>
                <TextInput value={whatsapp} onChange={setWhatsapp} placeholder="+1 809 000 0000" />
              </Field>
            </div>

            {/* Max leads */}
            <Field label="Máx. leads por semana (opcional)" icon={UserPlus}>
              <TextInput
                value={maxLeads}
                onChange={setMaxLeads}
                placeholder="Ej. 20 (dejar vacío = sin límite)"
                type="number"
              />
            </Field>

            {error && (
              <p style={{ fontSize: 13, color: "#f87171", padding: "8px 12px", background: "rgba(248,113,113,0.08)", borderRadius: 8, border: "1px solid rgba(248,113,113,0.15)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                background: isPending ? "rgba(201,150,58,0.5)" : `linear-gradient(135deg, ${T.goldLight}, ${T.gold})`,
                border: "none",
                color: "#281900",
                fontSize: 14,
                fontWeight: 700,
                cursor: isPending ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "opacity 0.15s",
              }}
            >
              <UserPlus size={16} />
              {isPending ? "Enviando invitación..." : "Enviar invitación"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
