"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Bot, Zap, Activity, MessageSquare, Save } from "lucide-react";

interface AvaConfig {
  is_active: boolean;
  custom_instructions: string;
  updated_at: string;
}

interface RecentMessage {
  id: string;
  contact_id: string;
  content: string;
  is_automated: boolean;
  created_at: string;
  contact: { first_name?: string; last_name?: string } | null;
}

interface Props {
  initialConfig: AvaConfig | null;
  recentMessages: RecentMessage[];
}

type Tone = "profesional" | "amigable" | "conciso";

function contactName(contact: RecentMessage["contact"]): string {
  if (!contact) return "Contacto";
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Sin nombre";
}

export function AvaClient({ initialConfig, recentMessages }: Props) {
  const supabase = createClient();

  const [isActive, setIsActive] = useState(initialConfig?.is_active ?? false);
  const [toggling, setToggling] = useState(false);

  const [instructions, setInstructions] = useState(initialConfig?.custom_instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [tone, setTone] = useState<Tone>("profesional");

  async function handleToggle() {
    if (!initialConfig) return;
    setToggling(true);
    const newVal = !isActive;
    setIsActive(newVal); // optimistic
    try {
      await supabase.from("ava_config").update({ is_active: newVal }).eq("id", 1);
    } catch {
      setIsActive(!newVal); // rollback
    } finally {
      setToggling(false);
    }
  }

  async function handleSaveInstructions() {
    if (!initialConfig) return;
    setSaving(true);
    try {
      await supabase
        .from("ava_config")
        .update({ custom_instructions: instructions })
        .eq("id", 1);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const tones: { key: Tone; label: string }[] = [
    { key: "profesional", label: "Profesional" },
    { key: "amigable", label: "Amigable" },
    { key: "conciso", label: "Conciso" },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--background)" }}>
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] mb-1" style={{ color: "var(--muted-foreground)" }}>
              Inteligencia Artificial
            </p>
            <h1
              style={{
                fontFamily: "var(--font-display, var(--font-manrope), system-ui)",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "var(--foreground)",
                lineHeight: 1.1,
              }}
            >
              Ava IA
            </h1>
          </div>

          {/* Status pill */}
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2"
            style={{
              background: isActive ? "var(--emerald-muted)" : "var(--secondary)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: isActive ? "var(--emerald)" : "var(--muted-foreground)",
                boxShadow: isActive ? "0 0 6px var(--emerald)" : "none",
                animation: isActive ? "pulse 2s infinite" : "none",
              }}
            />
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: isActive ? "var(--emerald)" : "var(--muted-foreground)" }}
            >
              {isActive ? "Activa" : "Inactiva"}
            </span>
          </div>
        </div>
      </div>

      {/* Stat pills */}
      <div className="px-7 pb-4 flex items-center gap-3 flex-wrap animate-fade-up">
        {[
          { label: "32 conv. hoy", color: "var(--amber)" },
          { label: "98% respuesta", color: "var(--emerald)" },
          { label: "4 cierres este mes", color: "var(--blue)" },
        ].map(({ label, color }) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-full px-4 py-1.5"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span className="text-xs font-medium" style={{ color: "var(--foreground)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Main 2-column layout */}
      <div className="flex-1 p-7 pt-0">
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

          {/* ── LEFT: Config cards ── */}
          <div className="space-y-6">

            {/* Card 0: Status toggle */}
            <div className="card-glow rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2
                  className="text-base font-bold flex items-center gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <Bot className="w-4 h-4" style={{ color: "var(--primary)" }} />
                  <span>Estado del asistente</span>
                </h2>
                <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                  Estado de IA
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                    {isActive ? "Ava está respondiendo leads" : "Ava está en pausa"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {isActive
                      ? "El asistente responde automáticamente en WhatsApp."
                      : "Los mensajes esperan respuesta manual."}
                  </p>
                </div>

                {/* Toggle switch */}
                {initialConfig ? (
                  <button
                    onClick={handleToggle}
                    disabled={toggling}
                    className="relative rounded-full transition-all flex-shrink-0"
                    style={{
                      width: 56,
                      height: 28,
                      background: isActive ? "var(--primary)" : "var(--secondary)",
                      border: "1px solid var(--border)",
                      opacity: toggling ? 0.6 : 1,
                    }}
                  >
                    <span
                      className="absolute top-1 rounded-full transition-all"
                      style={{
                        width: 20,
                        height: 20,
                        background: isActive ? "var(--primary-foreground)" : "var(--muted-foreground)",
                        left: isActive ? 32 : 4,
                      }}
                    />
                  </button>
                ) : (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>No disponible</span>
                )}
              </div>
            </div>

            {/* Card 1: Personalidad */}
            <div className="card-glow rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2
                  className="text-base font-bold flex items-center gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <Zap className="w-4 h-4" style={{ color: "var(--primary)" }} />
                  <span>Personalidad</span>
                </h2>
                <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                  Configuración de Identidad
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Nombre — locked */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider ml-1" style={{ color: "var(--muted-foreground)" }}>
                    Nombre de Asistente
                  </label>
                  <div
                    className="flex items-center justify-between rounded-lg px-4 py-2.5"
                    style={{
                      background: "var(--secondary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>Ava</span>
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>🔒</span>
                  </div>
                </div>

                {/* Tono */}
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider ml-1" style={{ color: "var(--muted-foreground)" }}>
                    Tono de Voz
                  </label>
                  <div className="flex gap-2">
                    {tones.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setTone(key)}
                        className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
                        style={{
                          background: tone === key ? "var(--accent)" : "var(--secondary)",
                          color: tone === key ? "var(--primary)" : "var(--muted-foreground)",
                          border: `1px solid ${tone === key ? "var(--primary)" : "var(--border)"}`,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Custom instructions */}
            <div className="card-glow rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2
                  className="text-base font-bold flex items-center gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <Activity className="w-4 h-4" style={{ color: "var(--primary)" }} />
                  <span>Instrucciones personalizadas</span>
                </h2>
              </div>

              <div className="relative">
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Define las reglas de comportamiento de Ava aquí..."
                  rows={7}
                  className="w-full rounded-lg p-4 text-sm resize-none outline-none focus:ring-1"
                  style={{
                    background: "var(--secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontFamily: "var(--font-mono)",
                    lineHeight: 1.7,
                  }}
                />
                <div
                  className="absolute bottom-3 right-3 text-[10px] px-2 py-0.5 rounded"
                  style={{ background: "var(--card)", color: "var(--muted-foreground)" }}
                >
                  {instructions.length} / 2000
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                {saved && (
                  <span className="text-xs" style={{ color: "var(--emerald)" }}>
                    Guardado correctamente
                  </span>
                )}
                <div className="ml-auto">
                  <button
                    onClick={handleSaveInstructions}
                    disabled={saving || !initialConfig}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-opacity disabled:opacity-50"
                    style={{
                      background: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            </div>

            {/* No config notice */}
            {!initialConfig && (
              <div
                className="rounded-xl p-4 text-sm"
                style={{
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                  Configuración no disponible
                </p>
                La tabla <code className="font-mono text-xs">ava_config</code> no está configurada en este entorno.
              </div>
            )}
          </div>

          {/* ── RIGHT: Chat preview + activity ── */}
          <div className="space-y-6">

            {/* Chat preview */}
            <div
              className="card-glow rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <div
                className="p-5"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.15em] mb-1"
                  style={{ color: "var(--primary)" }}
                >
                  Así responde Ava
                </p>
                <p className="text-xs italic" style={{ color: "var(--muted-foreground)" }}>
                  Vista previa del asistente
                </p>
              </div>

              <div className="p-5 space-y-4" style={{ background: "rgba(255,255,255,0.01)" }}>
                {/* Client message */}
                <div className="flex flex-col items-start max-w-[85%]">
                  <div
                    className="p-3 rounded-2xl rounded-tl-none text-xs leading-relaxed"
                    style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                  >
                    Hola, vi la propiedad. ¿Sigue disponible?
                  </div>
                  <span className="text-[10px] mt-1 ml-1" style={{ color: "var(--muted-foreground)" }}>
                    Cliente · 10:05 AM
                  </span>
                </div>

                {/* Ava message */}
                <div className="flex flex-col items-end ml-auto max-w-[85%]">
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest mb-1 mr-1"
                    style={{ color: "var(--primary)" }}
                  >
                    Ava AI
                  </span>
                  <div
                    className="p-3 rounded-2xl rounded-tr-none text-xs leading-relaxed relative"
                    style={{
                      background: "var(--card)",
                      color: "var(--foreground)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    Buenos días. Efectivamente, sigue disponible. ¿Le gustaría que coordinemos una visita?
                  </div>
                  <span className="text-[10px] mt-1 mr-1" style={{ color: "var(--muted-foreground)" }}>
                    Enviado · 10:05 AM
                  </span>
                </div>

                {/* Lead qualified pill */}
                <div className="flex justify-center py-2">
                  <div
                    className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                    style={{
                      background: "var(--amber-muted)",
                      border: "1px solid var(--border)",
                      color: "var(--amber)",
                    }}
                  >
                    <span>✓</span> Lead Calificado
                  </div>
                </div>
              </div>
            </div>

            {/* Recent activity */}
            <div className="card-glow rounded-xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <MessageSquare className="w-4 h-4" style={{ color: "var(--primary)" }} />
                <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  Actividad reciente
                </h3>
              </div>

              {recentMessages.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Sin actividad reciente.</p>
              ) : (
                <div className="space-y-3">
                  {recentMessages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3">
                      {/* Avatar initial */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                        style={{
                          background: msg.is_automated ? "var(--amber-muted)" : "var(--secondary)",
                          color: msg.is_automated ? "var(--amber)" : "var(--muted-foreground)",
                        }}
                      >
                        {contactName(msg.contact)[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                            {contactName(msg.contact)}
                          </span>
                          {msg.is_automated && (
                            <span
                              className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                              style={{ background: "var(--amber-muted)", color: "var(--amber)" }}
                            >
                              Ava
                            </span>
                          )}
                        </div>
                        <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                          {msg.content.slice(0, 70)}{msg.content.length > 70 ? "…" : ""}
                        </p>
                      </div>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>
                        {formatDistanceToNow(new Date(msg.created_at), { locale: es, addSuffix: false })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
