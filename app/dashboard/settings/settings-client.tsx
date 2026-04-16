"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AvaConfigForm } from "./ava-config-form";
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
  ChevronRight,
} from "lucide-react";

type Tab = "equipo" | "perfil" | "integraciones" | "notificaciones" | "ava";

interface Props {
  agents: Agent[];
  currentAgent: Agent | null;
  currentUser: { email?: string; id: string } | null;
  avaConfig: {
    ava_name: string;
    agency_name: string;
    agency_tagline: string;
    ava_markets: string;
    ava_custom_instructions: string;
  };
}

const TAB_META: { key: Tab; label: string; icon: React.ReactNode; group: string }[] = [
  { key: "equipo", label: "Equipo", icon: <Users className="w-3.5 h-3.5" />, group: "ORGANIZACIÓN" },
  { key: "perfil", label: "Perfil", icon: <User className="w-3.5 h-3.5" />, group: "CUENTA" },
  { key: "integraciones", label: "Integraciones", icon: <Link2 className="w-3.5 h-3.5" />, group: "SISTEMA" },
  { key: "notificaciones", label: "Notificaciones", icon: <Bell className="w-3.5 h-3.5" />, group: "SISTEMA" },
  { key: "ava", label: "Ava IA", icon: <Bot className="w-3.5 h-3.5" />, group: "SISTEMA" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agente",
};

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, React.CSSProperties> = {
    admin: { background: "var(--amber-muted)", color: "var(--amber)", border: "1px solid var(--border)" },
    manager: { background: "var(--blue-muted)", color: "var(--blue)", border: "1px solid var(--border)" },
    agent: { background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)" },
  };
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={styles[role] ?? styles.agent}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
      style={
        active
          ? { background: "var(--emerald-muted)", color: "var(--emerald)" }
          : { background: "var(--secondary)", color: "var(--muted-foreground)" }
      }
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
        background: "var(--amber-muted)",
        color: "var(--amber)",
      }}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ── Tab content components ─────────────────────────

function TabEquipo({ agents, onInvite }: { agents: Agent[]; onInvite: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: "var(--muted-foreground)" }}>
            Organización
          </p>
          <h2
            className="text-2xl font-bold"
            style={{
              fontFamily: "var(--font-display, var(--font-manrope))",
              color: "var(--foreground)",
              letterSpacing: "-0.02em",
            }}
          >
            Equipo
          </h2>
        </div>
        <button
          onClick={onInvite}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          + Invitar agente
        </button>
      </div>

      <div
        className="card-glow rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <table className="w-full text-left border-collapse">
          <thead>
            <tr
              className="text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ background: "rgba(255,255,255,0.03)", color: "var(--muted-foreground)" }}
            >
              <th className="px-6 py-4">Agente</th>
              <th className="px-6 py-4">Rol</th>
              <th className="px-6 py-4">Teléfono</th>
              <th className="px-6 py-4">Estado</th>
              <th className="px-6 py-4">Ingreso</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Sin agentes registrados.
                </td>
              </tr>
            ) : (
              agents.map((a) => (
                <tr
                  key={a.id}
                  className="transition-colors"
                  style={{ borderTop: "1px solid var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <InitialAvatar name={a.full_name} size={36} />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                          {a.full_name}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                          {a.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <RoleBadge role={a.role} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs" style={{ color: "var(--foreground)" }}>
                      {a.phone ?? "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge active={a.is_active} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {new Date(a.created_at).toLocaleDateString("es-DO")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      className="text-xs font-medium transition-colors"
                      style={{ color: "var(--muted-foreground)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--primary)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)")}
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

function TabPerfil({
  currentAgent,
  currentUser,
}: {
  currentAgent: Agent | null;
  currentUser: Props["currentUser"];
}) {
  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: "var(--muted-foreground)" }}>
          Cuenta
        </p>
        <h2
          className="text-2xl font-bold"
          style={{
            fontFamily: "var(--font-display, var(--font-manrope))",
            color: "var(--foreground)",
            letterSpacing: "-0.02em",
          }}
        >
          Perfil
        </h2>
      </div>

      <div className="card-glow rounded-xl p-6 space-y-6">
        {/* Avatar + identity */}
        <div className="flex items-center gap-5">
          <InitialAvatar name={currentAgent?.full_name ?? currentUser?.email ?? "?"} size={56} />
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--foreground)" }}>
              {currentAgent?.full_name ?? "—"}
            </p>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {currentUser?.email}
            </p>
            {currentAgent?.role && (
              <div className="mt-1.5">
                <RoleBadge role={currentAgent.role} />
              </div>
            )}
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-3" style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
          {currentAgent?.phone && (
            <div className="flex justify-between text-sm py-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted-foreground)" }}>Teléfono</span>
              <span className="font-mono" style={{ color: "var(--foreground)" }}>{currentAgent.phone}</span>
            </div>
          )}
          <div className="flex justify-between text-sm py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--muted-foreground)" }}>Estado</span>
            <StatusBadge active={currentAgent?.is_active ?? true} />
          </div>
          <div className="flex justify-between text-sm py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--muted-foreground)" }}>ID de usuario</span>
            <span className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
              {currentUser?.id?.slice(0, 8)}…
            </span>
          </div>
        </div>

        {/* Appearance */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted-foreground)" }}>
            Apariencia
          </p>
          <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
            Elige entre el tema luminoso editorial o el premium oscuro.
          </p>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function TabIntegraciones() {
  const integrations = [
    {
      name: "WhatsApp Business",
      description: "Canal principal de comunicación con leads.",
      status: "connected" as const,
      icon: "💬",
      detail: "Conectado vía Cloud API",
    },
    {
      name: "Railway — Ava",
      description: "Agente de IA desplegado en Railway con FastAPI.",
      status: "connected" as const,
      icon: "🚂",
      detail: "https://remax-advance-ava-production.up.railway.app",
    },
    {
      name: "Supabase PostgreSQL",
      description: "Base de datos principal del CRM.",
      status: "connected" as const,
      icon: "🗄️",
      detail: "Siempre activo",
    },
    {
      name: "Meta Ads",
      description: "Importación directa de leads desde Facebook/Instagram.",
      status: "disconnected" as const,
      icon: "📢",
      detail: "Sin configurar",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: "var(--muted-foreground)" }}>
          Sistema
        </p>
        <h2
          className="text-2xl font-bold"
          style={{
            fontFamily: "var(--font-display, var(--font-manrope))",
            color: "var(--foreground)",
            letterSpacing: "-0.02em",
          }}
        >
          Integraciones
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {integrations.map((intg) => (
          <div
            key={intg.name}
            className="card-glow rounded-xl p-5 flex flex-col gap-4 transition-all"
            style={{ border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{
                    background: intg.status === "connected" ? "var(--emerald-muted)" : "var(--secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {intg.icon}
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{intg.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{intg.description}</p>
                </div>
              </div>
              <span
                className="flex-shrink-0 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                style={
                  intg.status === "connected"
                    ? { background: "var(--emerald-muted)", color: "var(--emerald)", border: "1px solid var(--border)" }
                    : { background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
                }
              >
                {intg.status === "connected" ? "Activo" : "Inactivo"}
              </span>
            </div>
            <div
              className="rounded-lg px-3 py-2 font-mono text-xs"
              style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}
            >
              {intg.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
    <div className="max-w-xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: "var(--muted-foreground)" }}>
          Sistema
        </p>
        <h2
          className="text-2xl font-bold"
          style={{
            fontFamily: "var(--font-display, var(--font-manrope))",
            color: "var(--foreground)",
            letterSpacing: "-0.02em",
          }}
        >
          Notificaciones
        </h2>
      </div>

      <div className="card-glow rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {toggles.map((t, idx) => {
          const value = prefs[t.key] ?? NOTIFICATION_DEFAULTS[t.key] ?? false;
          return (
            <div
              key={t.key}
              className="flex items-center justify-between px-6 py-5"
              style={idx > 0 ? { borderTop: "1px solid var(--border)" } : {}}
            >
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)" }}>{t.label}</p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t.description}</p>
              </div>
              <button
                onClick={() => handleToggle(t.key, !value)}
                className="relative rounded-full transition-all flex-shrink-0 ml-6"
                style={{
                  width: 44,
                  height: 24,
                  background: value ? "var(--primary)" : "var(--secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  className="absolute top-1 rounded-full transition-all"
                  style={{
                    width: 16,
                    height: 16,
                    background: value ? "var(--primary-foreground)" : "var(--muted-foreground)",
                    left: value ? 24 : 4,
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabAva({ avaConfig }: { avaConfig: Props["avaConfig"] }) {
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: "var(--muted-foreground)" }}>
          Asistente
        </p>
        <h2
          className="text-2xl font-bold"
          style={{
            fontFamily: "var(--font-display, var(--font-manrope))",
            color: "var(--foreground)",
            letterSpacing: "-0.02em",
          }}
        >
          Configuración de Ava
        </h2>
      </div>
      <div className="card-glow rounded-xl p-6 max-w-2xl" style={{ border: "1px solid var(--border)" }}>
        <p className="text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>
          Estos valores se aplican al endpoint <code className="font-mono">/api/ava</code> del CRM en tiempo real.
        </p>
        <AvaConfigForm initial={avaConfig} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────

const GROUPS: Record<string, Tab[]> = {
  ORGANIZACIÓN: ["equipo"],
  CUENTA: ["perfil"],
  SISTEMA: ["integraciones", "notificaciones", "ava"],
};

export function SettingsClient({ agents, currentAgent, currentUser, avaConfig }: Props) {
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
    <div className="flex min-h-screen" style={{ background: "var(--background)" }}>
      {/* ── Left nav ── */}
      <nav
        className="flex flex-col flex-shrink-0 py-8 px-5"
        style={{
          width: 220,
          background: "var(--card)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <h2
          className="text-base font-bold mb-8 uppercase tracking-wider"
          style={{
            fontFamily: "var(--font-display, var(--font-manrope))",
            color: "var(--foreground)",
          }}
        >
          Configuración
        </h2>

        <div className="space-y-6 flex-1">
          {Object.entries(GROUPS).map(([group, tabs]) => (
            <div key={group}>
              <p
                className="text-[10px] font-bold tracking-[0.2em] mb-2 pl-2"
                style={{ color: "var(--muted-foreground)", opacity: 0.5 }}
              >
                {group}
              </p>
              <ul className="space-y-0.5">
                {tabs.map((tab) => {
                  const meta = TAB_META.find((m) => m.key === tab)!;
                  const isActive = activeTab === tab;
                  return (
                    <li key={tab}>
                      <button
                        onClick={() => navigate(tab)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors"
                        style={
                          isActive
                            ? {
                                color: "var(--primary)",
                                background: "var(--accent)",
                                borderRight: "2px solid var(--primary)",
                              }
                            : {
                                color: "var(--muted-foreground)",
                              }
                        }
                      >
                        {meta.icon}
                        {meta.label}
                        {isActive && (
                          <ChevronRight className="w-3 h-3 ml-auto" style={{ color: "var(--primary)" }} />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="flex-1 p-8 overflow-y-auto animate-fade-up">
        <InviteAgentDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
        {activeTab === "equipo" && <TabEquipo agents={agents} onInvite={() => setInviteOpen(true)} />}
        {activeTab === "perfil" && <TabPerfil currentAgent={currentAgent} currentUser={currentUser} />}
        {activeTab === "integraciones" && <TabIntegraciones />}
        {activeTab === "notificaciones" && <TabNotificaciones userId={currentUser?.id ?? ""} />}
        {activeTab === "ava" && <TabAva avaConfig={avaConfig} />}
      </main>
    </div>
  );
}
