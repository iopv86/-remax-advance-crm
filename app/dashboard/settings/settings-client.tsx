"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { InviteAgentDialog } from "@/components/invite-agent-dialog";
import { createClient } from "@/lib/supabase/client";
import type { Agent } from "@/lib/types";
import {
  Users,
  User,
  Link2,
  Bell,
  Bot,
  CheckCircle2,
  XCircle,
  Copy,
  ChevronRight,
  Search,
} from "lucide-react";

// Bot is used in TabIntegraciones (Railway card)

// ── Types ───────────────────────────────────────────

type Tab = "equipo" | "perfil" | "integraciones" | "notificaciones";

interface Props {
  agents: Agent[];
  currentAgent: Agent | null;
  currentUser: { email?: string; id: string } | null;
}

// ── Design tokens ───────────────────────────────────

const GLASS_CARD: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.04)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(201, 150, 58, 0.15)",
};

const GOLD = "#C9963A";
const GOLD_LIGHT = "#f5bd5d";

// ── Nav config ──────────────────────────────────────

const NAV_GROUPS: {
  label: string;
  items: { key: Tab; name: string }[];
}[] = [
  {
    label: "CUENTA",
    items: [
      { key: "perfil", name: "Perfil" },
    ],
  },
  {
    label: "NOTIFICACIONES",
    items: [
      { key: "notificaciones", name: "Alertas Email / Push" },
    ],
  },
  {
    label: "INTEGRACIONES",
    items: [
      { key: "integraciones", name: "WhatsApp" },
    ],
  },
  {
    label: "EQUIPO",
    items: [
      { key: "equipo", name: "Agentes" },
    ],
  },
];

// ── Sub-components ──────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agente",
};

function RoleBadge({ role }: { role: string }) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
  const styles: Record<string, React.CSSProperties> = {
    admin: { ...base, background: "rgba(201,150,58,0.12)", color: GOLD, border: "1px solid rgba(201,150,58,0.25)" },
    manager: { ...base, background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" },
    agent: { ...base, background: "rgba(255,255,255,0.06)", color: "#9899A8", border: "1px solid rgba(255,255,255,0.08)" },
  };
  return <span style={styles[role] ?? styles.agent}>{ROLE_LABELS[role] ?? role}</span>;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{
        fontSize: "10px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        ...(active
          ? { background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }
          : { background: "rgba(255,255,255,0.05)", color: "#545567", border: "1px solid rgba(255,255,255,0.08)" }),
      }}
    >
      {active ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function InitialAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "rgba(201,150,58,0.15)",
        color: GOLD,
        border: "1px solid rgba(201,150,58,0.2)",
      }}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ── Content header ──────────────────────────────────

function ContentHeader({ section, title }: { section: string; title: string }) {
  return (
    <header className="flex justify-between items-end mb-10">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "#9899A8" }}>
          <span>Configuración</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span style={{ color: GOLD }}>{section}</span>
        </div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "Manrope, var(--font-manrope), sans-serif", color: "#e3e1ea" }}
        >
          {title}
        </h1>
      </div>
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full"
        style={{ background: "#292a30", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Search className="w-4 h-4" style={{ color: "#9899A8" }} />
        <input
          className="bg-transparent border-none focus:outline-none text-sm w-44"
          placeholder="Buscar ajustes..."
          style={{ color: "#e3e1ea" }}
        />
      </div>
    </header>
  );
}

// ── TabEquipo ───────────────────────────────────────

function TabEquipo({ agents, onInvite }: { agents: Agent[]; onInvite: () => void }) {
  return (
    <div>
      <ContentHeader section="Equipo" title="Agentes y Accesos" />

      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-lg" style={{ color: "#e3e1ea", fontFamily: "Manrope, sans-serif" }}>
          Equipo activo
        </h3>
        <button
          onClick={onInvite}
          className="px-4 py-2 rounded-lg text-sm font-bold transition-all hover:opacity-90"
          style={{
            background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
            color: "#1a1200",
          }}
        >
          + AGREGAR AGENTE
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden" style={GLASS_CARD}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr
              style={{
                background: "rgba(41,42,48,0.5)",
                fontSize: "10px",
                fontWeight: 700,
                color: "#9899A8",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              <th className="px-6 py-4">Agente</th>
              <th className="px-6 py-4">Rol</th>
              <th className="px-6 py-4">Teléfono</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Ingreso</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-sm"
                  style={{ color: "#545567" }}
                >
                  Sin agentes registrados.
                </td>
              </tr>
            ) : (
              agents.map((a) => (
                <tr
                  key={a.id}
                  className="transition-colors"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <InitialAvatar name={a.full_name} size={36} />
                      <div>
                        <p className="text-sm font-bold" style={{ color: "#e3e1ea" }}>
                          {a.full_name}
                        </p>
                        <p style={{ fontSize: "11px", color: "#9899A8" }}>{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <RoleBadge role={a.role} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs" style={{ color: "#e3e1ea" }}>
                      {a.phone ?? "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge active={a.is_active} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs" style={{ color: "#9899A8" }}>
                      {new Date(a.created_at).toLocaleDateString("es-DO")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      className="text-xs font-medium transition-colors"
                      style={{ color: "#545567" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = GOLD_LIGHT)}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#545567")}
                    >
                      ···
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TabPerfil ───────────────────────────────────────

function TabPerfil({
  currentAgent,
  currentUser,
}: {
  currentAgent: Agent | null;
  currentUser: Props["currentUser"];
}) {
  return (
    <div>
      <ContentHeader section="Cuenta" title="Perfil" />

      <div className="max-w-xl">
        <div className="rounded-2xl p-6 space-y-6" style={GLASS_CARD}>
          <div className="flex items-center gap-5">
            <InitialAvatar name={currentAgent?.full_name ?? currentUser?.email ?? "?"} size={56} />
            <div>
              <p className="font-semibold text-base" style={{ color: "#e3e1ea" }}>
                {currentAgent?.full_name ?? "—"}
              </p>
              <p className="text-sm" style={{ color: "#9899A8" }}>{currentUser?.email}</p>
              {currentAgent?.role && (
                <div className="mt-1.5">
                  <RoleBadge role={currentAgent.role} />
                </div>
              )}
            </div>
          </div>

          <div
            className="space-y-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1.5rem" }}
          >
            {currentAgent?.phone && (
              <div
                className="flex justify-between text-sm py-2"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span style={{ color: "#9899A8" }}>Teléfono</span>
                <span className="font-mono" style={{ color: "#e3e1ea" }}>{currentAgent.phone}</span>
              </div>
            )}
            <div
              className="flex justify-between text-sm py-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span style={{ color: "#9899A8" }}>Estado</span>
              <StatusBadge active={currentAgent?.is_active ?? true} />
            </div>
            <div
              className="flex justify-between text-sm py-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span style={{ color: "#9899A8" }}>ID de usuario</span>
              <span className="font-mono text-xs" style={{ color: "#545567" }}>
                {currentUser?.id?.slice(0, 8)}…
              </span>
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1.5rem" }}>
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "#9899A8" }}
            >
              Apariencia
            </p>
            <p className="text-xs mb-3" style={{ color: "#545567" }}>
              Elige entre el tema luminoso editorial o el premium oscuro.
            </p>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TabIntegraciones ─────────────────────────────────

function TabIntegraciones() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText("ae_live_8832_placeholder");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const integrations = [
    {
      name: "WhatsApp Business",
      description: "Canal principal de comunicación con leads.",
      status: "connected" as const,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      iconBg: "rgba(37,211,102,0.1)",
      iconBorder: "rgba(37,211,102,0.2)",
      iconColor: "#25d366",
      badge: "ACTIVO",
      badgeStyle: {
        background: "rgba(52,211,153,0.1)",
        color: "#34d399",
        border: "1px solid rgba(52,211,153,0.2)",
      } as React.CSSProperties,
      detail: (
        <div
          className="flex items-center justify-between rounded-xl p-4"
          style={{ background: "#1a1b22", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span className="font-mono text-sm" style={{ color: "#9899A8" }}>
            +1 (809) 000-0000
          </span>
          <button
            className="text-xs font-bold uppercase tracking-widest transition-colors"
            style={{ color: "#545567" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#ef4444")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#545567")}
          >
            Desconectar
          </button>
        </div>
      ),
    },
    {
      name: "Meta Ads",
      description: "Importación directa de leads desde Facebook/Instagram.",
      status: "disconnected" as const,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      iconBg: "#34343b",
      iconBorder: "rgba(255,255,255,0.06)",
      iconColor: "#9899A8",
      badge: "INACTIVO",
      badgeStyle: {
        background: "rgba(255,255,255,0.04)",
        color: "#545567",
        border: "1px solid rgba(255,255,255,0.08)",
      } as React.CSSProperties,
      detail: (
        <button
          className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 flex items-center justify-center gap-2"
          style={{
            background: `linear-gradient(135deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
            color: "#1a1200",
          }}
        >
          <Link2 className="w-4 h-4" />
          CONECTAR CUENTA
        </button>
      ),
    },
    {
      name: "Railway — Ava",
      description: "Agente de IA desplegado en Railway con FastAPI.",
      status: "connected" as const,
      icon: <Bot className="w-7 h-7" />,
      iconBg: "rgba(201,150,58,0.1)",
      iconBorder: "rgba(201,150,58,0.2)",
      iconColor: GOLD_LIGHT,
      badge: "ACTIVO",
      badgeStyle: {
        background: "rgba(52,211,153,0.1)",
        color: "#34d399",
        border: "1px solid rgba(52,211,153,0.2)",
      } as React.CSSProperties,
      detail: (
        <div
          className="rounded-xl px-4 py-3 font-mono text-xs truncate"
          style={{ background: "#1a1b22", color: "#9899A8", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          https://remax-advance-ava-production.up.railway.app
        </div>
      ),
    },
    {
      name: "Supabase PostgreSQL",
      description: "Base de datos principal del CRM.",
      status: "connected" as const,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
          <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.101 12.911.769 14.145 1.827 14.145h10.05l.023 8.819c.015.986 1.26 1.41 1.874.637l9.262-11.649c.663-.86-.005-2.095-1.063-2.095H11.923l-.023-8.82z" />
        </svg>
      ),
      iconBg: "rgba(62,207,142,0.1)",
      iconBorder: "rgba(62,207,142,0.2)",
      iconColor: "#3ecf8e",
      badge: "ACTIVO",
      badgeStyle: {
        background: "rgba(52,211,153,0.1)",
        color: "#34d399",
        border: "1px solid rgba(52,211,153,0.2)",
      } as React.CSSProperties,
      detail: (
        <div
          className="rounded-xl px-4 py-3 text-xs"
          style={{ background: "#1a1b22", color: "#9899A8", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          Siempre activo — managed cloud
        </div>
      ),
    },
  ];

  return (
    <div>
      <ContentHeader section="Integraciones" title="Integraciones — WhatsApp Business" />

      {/* Cards grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {integrations.map((intg) => (
          <div
            key={intg.name}
            className="rounded-2xl p-6 flex flex-col gap-6 transition-all duration-300 cursor-default"
            style={GLASS_CARD}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.border = "1px solid rgba(201, 150, 58, 0.4)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(0,0,0,0.5), inset 0 0 10px rgba(201,150,58,0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.border = "1px solid rgba(201, 150, 58, 0.15)";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: intg.iconBg,
                    border: `1px solid ${intg.iconBorder}`,
                    color: intg.iconColor,
                  }}
                >
                  {intg.icon}
                </div>
                <div>
                  <h3 className="font-bold text-base" style={{ color: "#e3e1ea" }}>{intg.name}</h3>
                  <p className="text-sm" style={{ color: "#9899A8" }}>{intg.description}</p>
                </div>
              </div>
              <span
                className="flex-shrink-0 px-3 py-1 rounded-full font-bold uppercase"
                style={{ fontSize: "10px", letterSpacing: "0.08em", ...intg.badgeStyle }}
              >
                {intg.badge}
              </span>
            </div>
            {intg.detail}
          </div>
        ))}
      </section>

      {/* API access */}
      <section className="mb-10">
        <h3
          className="font-bold text-lg mb-6"
          style={{ fontFamily: "Manrope, sans-serif", color: "#e3e1ea" }}
        >
          API &amp; Acceso para Desarrolladores
        </h3>
        <div className="rounded-2xl p-6 flex flex-col gap-4" style={GLASS_CARD}>
          <div className="flex justify-between items-center">
            <label
              className="font-bold uppercase tracking-widest"
              style={{ fontSize: "10px", color: "#9899A8" }}
            >
              Production API Key
            </label>
            <span className="text-xs font-medium" style={{ color: GOLD_LIGHT }}>
              Expira en 42 días
            </span>
          </div>
          <div
            className="flex items-center gap-4 rounded-xl p-4 font-mono text-sm"
            style={{
              background: "#0d0e14",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ color: "#9899A8" }}>ae_live_8832_</span>
            <span className="flex-1 tracking-[0.3em]" style={{ color: "#e3e1ea" }}>
              ••••••••••••••••••••••••
            </span>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg transition-all"
              style={{ color: copied ? "#34d399" : GOLD_LIGHT }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "rgba(201,150,58,0.1)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
              }
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "#545567" }}>
            Use esta clave para integrar el CRM con sistemas externos o portales inmobiliarios de
            terceros. No comparta esta clave en entornos no seguros.
          </p>
        </div>
      </section>
    </div>
  );
}

// ── TabNotificaciones ────────────────────────────────

const NOTIFICATION_DEFAULTS: Record<string, boolean> = {
  email: true,
  whatsapp: false,
  new_lead: true,
  deal_update: true,
};

function TabNotificaciones({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(NOTIFICATION_DEFAULTS);

  useEffect(() => {
    supabase
      .from("notification_preferences")
      .select("key, enabled")
      .eq("agent_id", userId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const loaded: Record<string, boolean> = { ...NOTIFICATION_DEFAULTS };
          for (const row of data) {
            loaded[row.key] = row.enabled;
          }
          setPrefs(loaded);
        }
      });
  }, [userId, supabase]);

  async function handleToggle(key: string, newValue: boolean) {
    const prev = prefs[key];
    setPrefs((p) => ({ ...p, [key]: newValue }));
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ agent_id: userId, key, enabled: newValue }, { onConflict: "agent_id,key" });
    if (error) {
      setPrefs((p) => ({ ...p, [key]: prev }));
      console.error("Error saving preference:", error.message);
    }
  }

  const toggles: { key: string; label: string; description: string }[] = [
    { key: "email", label: "Alertas por Email", description: "Recibe notificaciones de nuevos leads en tu correo." },
    { key: "whatsapp", label: "Alertas por WhatsApp", description: "Notificaciones directas al número del agente." },
    { key: "new_lead", label: "Nuevo lead capturado", description: "Aviso inmediato cuando Ava califica un lead nuevo." },
    { key: "deal_update", label: "Actualización de deal", description: "Cuando un deal cambia de etapa en el pipeline." },
  ];

  return (
    <div>
      <ContentHeader section="Notificaciones" title="Preferencias de Notificación" />

      <div className="max-w-xl">
        <div className="rounded-2xl overflow-hidden" style={GLASS_CARD}>
          {toggles.map((t, idx) => {
            const value = prefs[t.key] ?? NOTIFICATION_DEFAULTS[t.key] ?? false;
            return (
              <div
                key={t.key}
                className="flex items-center justify-between px-6 py-5"
                style={idx > 0 ? { borderTop: "1px solid rgba(255,255,255,0.05)" } : {}}
              >
                <div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: "#e3e1ea" }}>
                    {t.label}
                  </p>
                  <p className="text-xs" style={{ color: "#9899A8" }}>
                    {t.description}
                  </p>
                </div>
                <button
                  onClick={() => handleToggle(t.key, !value)}
                  className="relative rounded-full transition-all flex-shrink-0 ml-6"
                  style={{
                    width: 44,
                    height: 24,
                    background: value ? GOLD : "rgba(255,255,255,0.08)",
                    border: `1px solid ${value ? "rgba(201,150,58,0.4)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  <span
                    className="absolute top-1 rounded-full transition-all"
                    style={{
                      width: 16,
                      height: 16,
                      background: value ? "#1a1200" : "#545567",
                      left: value ? 24 : 4,
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── SettingsClient ───────────────────────────────────

export function SettingsClient({ agents, currentAgent, currentUser }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) || "equipo";
  const [inviteOpen, setInviteOpen] = useState(false);

  function navigate(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#0D0E12" }}>
      {/* ── Settings sub-nav ── */}
      <nav
        className="flex flex-col flex-shrink-0 py-8 px-6"
        style={{
          width: 220,
          background: "#14151C",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <h2
          className="text-base font-bold mb-8 uppercase tracking-wider"
          style={{
            fontFamily: "Manrope, var(--font-manrope), sans-serif",
            color: "#F5F0E8",
          }}
        >
          Configuración
        </h2>

        <div className="flex flex-col gap-8 flex-1">
          {NAV_GROUPS.map(({ label, items }) => (
            <div key={label}>
              <span
                className="block mb-3"
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  color: "rgba(211,196,177,0.4)",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
              <ul className="flex flex-col gap-0.5">
                {items.map(({ key, name }) => {
                  const isActive = activeTab === key;
                  return (
                    <li key={key}>
                      <button
                        onClick={() => navigate(key)}
                        className="w-full text-left text-sm py-1.5 pr-2 transition-colors font-medium"
                        style={
                          isActive
                            ? {
                                color: GOLD_LIGHT,
                                fontWeight: 700,
                                borderRight: `2px solid ${GOLD}`,
                              }
                            : {
                                color: "#d3c4b1",
                              }
                        }
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.color = GOLD_LIGHT;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.color = "#d3c4b1";
                          }
                        }}
                      >
                        {name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* ── Main content ── */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ background: "#0D0E12", padding: "3rem" }}
      >
        <InviteAgentDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
        {activeTab === "equipo" && <TabEquipo agents={agents} onInvite={() => setInviteOpen(true)} />}
        {activeTab === "perfil" && <TabPerfil currentAgent={currentAgent} currentUser={currentUser} />}
        {activeTab === "integraciones" && <TabIntegraciones />}
        {activeTab === "notificaciones" && <TabNotificaciones userId={currentUser?.id ?? ""} />}
      </main>
    </div>
  );
}
