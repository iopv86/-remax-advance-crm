import { createClient } from "@/lib/supabase/server";
import { Settings, User, Shield, Bot, Palette } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("email", user?.email ?? "")
    .single();

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
              fontFamily: "var(--font-playfair),Georgia,serif",
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
                { label: "Claude claude-sonnet-4-6 (Ava Railway)", status: true, icon: "🤖" },
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
        </div>
      </div>
    </div>
  );
}
