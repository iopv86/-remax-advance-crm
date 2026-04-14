import { createClient } from "@/lib/supabase/server";
import { User, Shield, Bot, Palette } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AvaConfigForm } from "./ava-config-form";

const DEFAULT_AVA_CONFIG = {
  ava_name: "Ava",
  agency_name: "Advance Estate",
  agency_tagline: "República Dominicana",
  ava_markets:
    "Santo Domingo: Piantini, Naco, Evaristo Morales, La Esperilla, Bella Vista\nSantiago: Jardines Metropolitanos, Los Jardines\nPunta Cana: Cap Cana, Bávaro\nCosta Norte: Las Terrenas, Samaná",
  ava_custom_instructions: "",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: agent }, { data: avaRows }] = await Promise.all([
    supabase
      .from("agents")
      .select("*")
      .eq("email", user?.email ?? "")
      .single(),
    supabase
      .from("agency_config")
      .select("key, value")
      .in("key", ["ava_name", "agency_name", "agency_tagline", "ava_markets", "ava_custom_instructions"]),
  ]);

  const avaMap = Object.fromEntries((avaRows ?? []).map((r) => [r.key, r.value ?? ""]));
  const avaConfig = {
    ava_name: avaMap.ava_name || DEFAULT_AVA_CONFIG.ava_name,
    agency_name: avaMap.agency_name || DEFAULT_AVA_CONFIG.agency_name,
    agency_tagline: avaMap.agency_tagline || DEFAULT_AVA_CONFIG.agency_tagline,
    ava_markets: avaMap.ava_markets || DEFAULT_AVA_CONFIG.ava_markets,
    ava_custom_instructions: avaMap.ava_custom_instructions || "",
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
            Sistema
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: "-0.02em",
              color: "var(--foreground)",
              lineHeight: 1.1,
            }}
          >
            Configuración
          </h1>
        </div>
      </div>

      <div className="p-7 animate-fade-up-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          {/* Profile card */}
          <div className="card-glow p-6 space-y-5">
            <div className="flex items-center gap-2 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <User className="w-4 h-4" style={{ color: "var(--red)" }} />
              <h2 className="font-sans font-semibold text-sm text-foreground">Mi perfil</h2>
            </div>

            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--red-muted)" }}
              >
                <span
                  className="font-display font-semibold text-2xl"
                  style={{ color: "var(--red)" }}
                >
                  {agent?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div>
                <p className="font-sans font-semibold text-foreground">{agent?.full_name ?? "—"}</p>
                <p className="font-sans text-sm text-muted-foreground mt-0.5">{user?.email}</p>
                {agent?.role && (
                  <span
                    className="inline-flex mt-1.5 px-2 py-0.5 rounded text-xs font-sans font-medium"
                    style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                  >
                    {agent.role === "admin" ? "Administrador" : agent.role === "manager" ? "Manager" : "Agente"}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {agent?.phone && (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-sans text-muted-foreground">Teléfono</span>
                  <span className="font-mono text-foreground">{agent.phone}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm">
                <span className="font-sans text-muted-foreground">Estado</span>
                <span
                  className="inline-flex px-2 py-0.5 rounded text-xs font-sans font-semibold"
                  style={
                    agent?.is_active
                      ? { background: "oklch(0.58 0.14 145 / 10%)", color: "oklch(0.4 0.14 145)" }
                      : { background: "var(--secondary)", color: "var(--muted-foreground)" }
                  }
                >
                  {agent?.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
          </div>

          {/* Appearance card */}
          <div className="card-glow p-6 space-y-5">
            <div className="flex items-center gap-2 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <Palette className="w-4 h-4" style={{ color: "var(--violet)" }} />
              <h2 className="font-sans font-semibold text-sm text-foreground">Apariencia</h2>
            </div>

            <div className="space-y-3">
              <p className="font-sans text-xs text-muted-foreground">
                Elige entre el tema luminoso editorial o el premium oscuro.
                Tu preferencia se guarda en este navegador.
              </p>
              <ThemeToggle />
            </div>
          </div>

          {/* Integrations card */}
          <div className="card-glow p-6 space-y-5">
            <div className="flex items-center gap-2 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <Shield className="w-4 h-4" style={{ color: "var(--teal)" }} />
              <h2 className="font-sans font-semibold text-sm text-foreground">Integraciones activas</h2>
            </div>

            <div className="space-y-1">
              {[
                { label: "WhatsApp Cloud API", status: true, icon: "💬" },
                { label: "GPT-4o (Ava Railway + CRM)", status: true, icon: "🤖" },
                { label: "Supabase PostgreSQL", status: true, icon: "🗄️" },
              ].map(({ label, status, icon }) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2.5"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span className="font-sans text-sm text-foreground flex items-center gap-2">
                    <span>{icon}</span>
                    {label}
                  </span>
                  <span
                    className="inline-flex px-2 py-0.5 rounded text-[10px] font-sans font-semibold"
                    style={
                      status
                        ? { background: "oklch(0.58 0.14 145 / 10%)", color: "oklch(0.4 0.14 145)" }
                        : { background: "var(--secondary)", color: "var(--muted-foreground)" }
                    }
                  >
                    {status ? "Activo" : "Inactivo"}
                  </span>
                </div>
              ))}
            </div>

            {/* Ava endpoint info */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-3.5 h-3.5" style={{ color: "var(--red)" }} />
                <p className="font-sans text-xs text-muted-foreground uppercase tracking-widest">Endpoint Ava CRM</p>
              </div>
              <code
                className="block font-mono text-xs p-3 rounded-lg break-all"
                style={{ background: "var(--secondary)", color: "var(--teal)", border: "1px solid var(--border)" }}
              >
                POST /api/ava
              </code>
            </div>
          </div>

          {/* Ava config card — spans full width */}
          <div className="card-glow p-6 space-y-5 lg:col-span-2">
            <div className="flex items-center gap-2 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <Bot className="w-4 h-4" style={{ color: "var(--red)" }} />
              <h2 className="font-sans font-semibold text-sm text-foreground">Configuración de Ava</h2>
              <span
                className="ml-auto inline-flex px-2 py-0.5 rounded text-[10px] font-sans font-semibold"
                style={{ background: "oklch(0.58 0.14 145 / 10%)", color: "oklch(0.4 0.14 145)" }}
              >
                Sincronizado con Supabase
              </span>
            </div>
            <p className="font-sans text-xs text-muted-foreground">
              Estos valores se aplican al endpoint <code className="font-mono">/api/ava</code> del CRM en tiempo real.
              Para aplicar cambios al agente Railway, actualiza también <code className="font-mono">config/prompts.yaml</code>.
            </p>
            <AvaConfigForm initial={avaConfig} />
          </div>
        </div>
      </div>
    </div>
  );
}
