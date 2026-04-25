"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { MessageSquare, Save } from "lucide-react";
import { AvaConfigForm } from "@/app/dashboard/settings/ava-config-form";

interface AvaConfig {
  id: string;
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

interface AgencyConfig {
  ava_name: string;
  agency_name: string;
  agency_tagline: string;
  ava_markets: string;
  ava_custom_instructions: string;
}

interface Props {
  initialConfig: AvaConfig | null;
  recentMessages: RecentMessage[];
  convToday: number;
  responseRate: number;
  closedMonth: number;
  initialTone: string;
  agencyConfig: AgencyConfig;
}

type Tone = "profesional" | "amigable" | "conciso";

function contactName(contact: RecentMessage["contact"]): string {
  if (!contact) return "Contacto";
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Sin nombre";
}

export function AvaIAClient({
  initialConfig,
  recentMessages,
  convToday,
  responseRate,
  closedMonth,
  initialTone,
  agencyConfig,
}: Props) {
  const supabase = createClient();

  const [isActive, setIsActive] = useState(initialConfig?.is_active ?? false);
  const [toggling, setToggling] = useState(false);
  const [instructions, setInstructions] = useState(initialConfig?.custom_instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tone, setTone] = useState<Tone>(initialTone as Tone);

  async function handleToneChange(newTone: Tone) {
    setTone(newTone);
    try {
      await supabase
        .from("agency_config")
        .upsert({ key: "ava_tone", value: newTone }, { onConflict: "key" });
    } catch {
      // Non-critical
    }
  }

  async function handleToggle() {
    if (!initialConfig) return;
    setToggling(true);
    const newVal = !isActive;
    setIsActive(newVal);
    try {
      await supabase.from("ava_config").update({ is_active: newVal }).eq("id", initialConfig.id);
    } catch {
      setIsActive(!newVal);
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
        .eq("id", initialConfig.id);
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
    <div className="flex flex-col h-full" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* ── Hero Panel ── */}
      <section
        className="w-full flex items-center justify-between px-8"
        style={{
          height: 88,
          background: "var(--card)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {/* Left: icon + title */}
        <div className="flex items-center" style={{ gap: 16 }}>
          <div className="relative flex items-center justify-center" style={{ width: 48, height: 48 }}>
            <div
              className="absolute inset-0 rounded-lg"
              style={{ background: "rgba(245,189,93,0.2)", transform: "rotate(45deg)" }}
            />
            <span
              className="material-symbols-outlined relative z-10"
              style={{ fontVariationSettings: "'FILL' 1", color: "#f5bd5d", fontSize: 24 }}
            >
              auto_awesome
            </span>
          </div>
          <div>
            <h1 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 20, color: "var(--foreground)", lineHeight: 1.2 }}>
              Ava — Asistente IA
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
              Responde leads en WhatsApp automáticamente
            </p>
          </div>
        </div>

        {/* Center: stat pills */}
        <div className="flex items-center" style={{ gap: 12 }}>
          {[
            { dot: "#f5bd5d", label: `${convToday} conv. hoy` },
            { dot: "#10b981", label: `${responseRate}% respuesta` },
            { dot: "#3b82f6", label: `${closedMonth} cierres este mes` },
          ].map(({ dot, label }) => (
            <div
              key={label}
              className="flex items-center"
              style={{
                background: "var(--secondary)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 9999,
                padding: "8px 16px",
                gap: 8,
              }}
            >
              <span className="rounded-full" style={{ width: 8, height: 8, background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Right: toggle */}
        <div className="flex items-center" style={{ gap: 16 }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-foreground)" }}>
            Estado de IA
          </span>
          {initialConfig ? (
            <button
              onClick={handleToggle}
              disabled={toggling}
              aria-label="Toggle Ava active state"
              style={{
                width: 128,
                height: 40,
                background: "var(--secondary)",
                borderRadius: 9999,
                padding: 4,
                display: "flex",
                position: "relative",
                cursor: toggling ? "not-allowed" : "pointer",
                opacity: toggling ? 0.7 : 1,
                border: "none",
                outline: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 4, bottom: 4,
                  right: isActive ? 4 : undefined,
                  left: isActive ? undefined : 4,
                  width: "55%",
                  background: isActive ? "linear-gradient(135deg, #f5bd5d 0%, #c9963a 100%)" : "transparent",
                  borderRadius: 9999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
              >
                {isActive && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#432c00", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Activa
                  </span>
                )}
              </div>
              <div style={{ width: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: isActive ? 0 : "auto" }}>
                {!isActive && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#432c00", textTransform: "uppercase" }}>Activa</span>
                )}
              </div>
              <div style={{ position: "absolute", top: 4, bottom: 4, left: isActive ? 4 : undefined, right: isActive ? undefined : 4, width: "45%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isActive ? (
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#6B7280" }}>Pausa</span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#432c00", background: "linear-gradient(135deg, #f5bd5d 0%, #c9963a 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textTransform: "uppercase" }}>
                    Pausa
                  </span>
                )}
              </div>
            </button>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>No disponible</span>
          )}
        </div>
      </section>

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left 60%: Config cards ── */}
        <div
          className="overflow-y-auto"
          style={{ width: "60%", padding: 32, display: "flex", flexDirection: "column", gap: 24 }}
        >
          {/* Card 1: Personalidad + Tono */}
          <div style={{ background: "var(--card)", borderRadius: 12, padding: 24, border: "1px solid rgba(245,189,93,0.2)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -64, right: -64, width: 128, height: 128, background: "rgba(245,189,93,0.05)", filter: "blur(48px)", borderRadius: "50%", pointerEvents: "none" }} />
            <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
              <h2 className="flex items-center" style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 18, color: "var(--foreground)", gap: 8, margin: 0 }}>
                <span className="material-symbols-outlined" style={{ color: "#f5bd5d", fontSize: 20 }}>person_outline</span>
                Personalidad
              </h2>
              <span style={{ fontSize: 11, color: "rgba(245,189,93,0.6)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Configuración de Identidad
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em", marginLeft: 4 }}>
                  Nombre de Asistente
                </label>
                <div className="flex items-center justify-between" style={{ background: "var(--secondary)", border: "1px solid rgba(79,69,55,0.3)", borderRadius: 8, padding: "12px 16px" }}>
                  <span style={{ fontWeight: 500, color: "var(--foreground)" }}>Ava</span>
                  <span className="material-symbols-outlined" style={{ color: "var(--muted-foreground)", fontSize: 18 }}>lock</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em", marginLeft: 4 }}>
                  Tono de Voz
                </label>
                <div className="flex" style={{ gap: 8 }}>
                  {tones.map(({ key, label }) => {
                    const active = tone === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleToneChange(key)}
                        style={{
                          flex: 1,
                          background: active ? "rgba(245,189,93,0.1)" : "#201f1f",
                          border: `1px solid ${active ? "rgba(245,189,93,0.4)" : "rgba(79,69,55,0.2)"}`,
                          borderRadius: 8,
                          padding: "8px 4px",
                          textAlign: "center",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          color: active ? "#f5bd5d" : "#9899A8",
                          fontSize: 13,
                          fontWeight: active ? 700 : 500,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Identidad de Agencia */}
          <div style={{ background: "var(--card)", borderRadius: 12, padding: 24, border: "1px solid rgba(245,189,93,0.2)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
              <h2 className="flex items-center" style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 18, color: "var(--foreground)", gap: 8, margin: 0 }}>
                <span className="material-symbols-outlined" style={{ color: "#f5bd5d", fontSize: 20 }}>domain</span>
                Identidad de Agencia
              </h2>
              <span style={{ fontSize: 11, color: "rgba(245,189,93,0.6)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Datos que usa Ava
              </span>
            </div>
            <AvaConfigForm initial={agencyConfig} />
          </div>

          {/* Card 3: Instrucciones personalizadas (runtime) */}
          <div style={{ background: "var(--card)", borderRadius: 12, padding: 24, border: "1px solid rgba(245,189,93,0.2)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
              <h2 className="flex items-center" style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 18, color: "var(--foreground)", gap: 8, margin: 0 }}>
                <span className="material-symbols-outlined" style={{ color: "#f5bd5d", fontSize: 20 }}>terminal</span>
                Instrucciones de comportamiento
              </h2>
            </div>

            <div style={{ position: "relative" }}>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Define las reglas de comportamiento de Ava aquí..."
                rows={7}
                style={{
                  width: "100%",
                  background: "var(--secondary)",
                  border: "1px solid rgba(245,189,93,0.3)",
                  borderRadius: 8,
                  padding: 16,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 13,
                  color: "var(--muted-foreground)",
                  lineHeight: 1.7,
                  resize: "none",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px #f5bd5d"; e.currentTarget.style.borderColor = "#f5bd5d"; }}
                onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "rgba(245,189,93,0.3)"; }}
              />
              <div style={{ position: "absolute", bottom: 16, right: 16, fontSize: 10, color: "var(--muted-foreground)", background: "var(--secondary)", padding: "2px 8px", borderRadius: 4 }}>
                {instructions.length} / 2000 tokens
              </div>
            </div>

            <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
              {saved && <span style={{ fontSize: 12, color: "#10b981" }}>Guardado correctamente</span>}
              <div style={{ marginLeft: "auto" }}>
                <button
                  onClick={handleSaveInstructions}
                  disabled={saving || !initialConfig}
                  className="flex items-center"
                  style={{
                    gap: 8,
                    padding: "8px 20px",
                    background: "linear-gradient(135deg, #f5bd5d 0%, #c9963a 100%)",
                    color: "#432c00",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: saving || !initialConfig ? "not-allowed" : "pointer",
                    opacity: saving || !initialConfig ? 0.5 : 1,
                  }}
                >
                  <Save size={14} />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>

          {/* Card 4: Seguimiento automático */}
          <div style={{ background: "var(--card)", borderRadius: 12, padding: 24, border: "1px solid rgba(245,189,93,0.2)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
              <h2 className="flex items-center" style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 18, color: "var(--foreground)", gap: 8, margin: 0 }}>
                <span className="material-symbols-outlined" style={{ color: "#f5bd5d", fontSize: 20 }}>history_toggle_off</span>
                Seguimiento automático
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { day: "1", label: "Primer Recordatorio", desc: "Si no hay respuesta tras 24hs", time: "10:00", active: true },
                { day: "3", label: "Segundo Seguimiento", desc: "Compartir catálogo de propiedades similares", time: "15:30", active: true },
                { day: "7", label: "Cierre de Lead Inactivo", desc: "Mensaje de despedida y archivo", time: "09:00", active: false },
              ].map(({ day, label, desc, time, active }) => (
                <div
                  key={day}
                  className="flex items-center justify-between"
                  style={{ background: "var(--secondary)", borderRadius: 8, padding: 16, border: "1px solid rgba(79,69,55,0.1)", opacity: active ? 1 : 0.6 }}
                >
                  <div className="flex items-center" style={{ gap: 16 }}>
                    <div className="flex items-center justify-center" style={{ width: 40, height: 40, background: active ? "rgba(245,189,93,0.05)" : "var(--secondary)", border: active ? "1px solid rgba(245,189,93,0.1)" : "none", borderRadius: 6 }}>
                      <span style={{ color: active ? "#f5bd5d" : "#9899A8", fontWeight: 700 }}>{day}</span>
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>{label}</p>
                      <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "2px 0 0" }}>{desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center" style={{ gap: 24 }}>
                    <input
                      type="time"
                      defaultValue={time}
                      disabled={!active}
                      style={{ background: "var(--secondary)", border: "none", borderRadius: 4, color: active ? "var(--foreground)" : "#6B7280", fontSize: 13, padding: "4px 8px", outline: "none" }}
                    />
                    <div style={{ width: 48, height: 24, background: active ? "linear-gradient(135deg, #f5bd5d 0%, #c9963a 100%)" : "#353534", borderRadius: 9999, position: "relative", cursor: "pointer" }}>
                      <div style={{ position: "absolute", top: 4, [active ? "right" : "left"]: 4, width: 16, height: 16, background: active ? "#ffffff" : "#6B7280", borderRadius: "50%" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 5: Actividad reciente */}
          <div style={{ background: "var(--card)", borderRadius: 12, padding: 24, border: "1px solid rgba(245,189,93,0.2)" }}>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 20 }}>
              <MessageSquare size={16} style={{ color: "#f5bd5d" }} />
              <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--foreground)", margin: 0 }}>
                Actividad reciente
              </h3>
            </div>

            {recentMessages.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Sin actividad reciente.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recentMessages.map((msg) => {
                  const initials = contactName(msg.contact)[0]?.toUpperCase() ?? "?";
                  return (
                    <div key={msg.id} className="flex items-start" style={{ gap: 12 }}>
                      <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, borderRadius: "50%", background: msg.is_automated ? "rgba(245,189,93,0.15)" : "var(--secondary)", color: msg.is_automated ? "#f5bd5d" : "var(--muted-foreground)", fontSize: 10, fontWeight: 700, marginTop: 2 }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center flex-wrap" style={{ gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{contactName(msg.contact)}</span>
                          {msg.is_automated && (
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "1px 6px", borderRadius: 4, background: "rgba(245,189,93,0.15)", color: "#f5bd5d" }}>Ava</span>
                          )}
                        </div>
                        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {msg.content.slice(0, 70)}{msg.content.length > 70 ? "…" : ""}
                        </p>
                      </div>
                      <span style={{ fontSize: 10, color: "var(--muted-foreground)", flexShrink: 0 }} suppressHydrationWarning>
                        {formatDistanceToNow(new Date(msg.created_at), { locale: es, addSuffix: false })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right 40%: Chat preview ── */}
        <div className="hidden md:flex flex-col" style={{ width: "40%", background: "var(--card)", borderLeft: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ padding: 24, borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 14, color: "#f5bd5d", textTransform: "uppercase", letterSpacing: "0.15em", margin: 0 }}>
              Así responde Ava
            </h3>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4, fontStyle: "italic" }}>
              Vista previa en tiempo real del simulador
            </p>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "85%" }}>
              <div style={{ background: "var(--secondary)", padding: 12, borderRadius: "16px 16px 16px 2px", fontSize: 13, color: "var(--foreground)" }}>
                Hola, vi la propiedad en La Moraleja que publicaron hoy. Sigue disponible?
              </div>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4, marginLeft: 4 }}>Cliente · 10:05 AM</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: "auto", maxWidth: "85%" }}>
              <div style={{ background: "var(--card)", border: "1px solid rgba(245,189,93,0.2)", padding: 12, borderRadius: "16px 16px 2px 16px", fontSize: 13, color: "var(--foreground)", position: "relative" }}>
                <div style={{ position: "absolute", top: -8, right: -8, background: "linear-gradient(135deg, #f5bd5d 0%, #c9963a 100%)", color: "#432c00", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Ava IA
                </div>
                Buenos días. Un placer saludarle. Efectivamente, la residencia en La Moraleja continúa disponible para visitas privadas.
                <br /><br />
                ¿Le gustaría que coordinemos una cita para este jueves por la tarde?
              </div>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4, marginRight: 4 }}>Enviado · 10:05 AM</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "85%" }}>
              <div style={{ background: "var(--secondary)", padding: 12, borderRadius: "16px 16px 16px 2px", fontSize: 13, color: "var(--foreground)" }}>
                Si, el dossier por favor. Busco algo de al menos 5 habitaciones.
              </div>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4, marginLeft: 4 }}>Cliente · 10:06 AM</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: "auto", maxWidth: "85%" }}>
              <div style={{ background: "var(--card)", border: "1px solid rgba(245,189,93,0.2)", padding: 12, borderRadius: "16px 16px 2px 16px", fontSize: 13, color: "var(--foreground)" }}>
                Perfecto. Con ese presupuesto contamos con dos opciones adicionales en la misma zona.
                <br /><br />
                Le acabo de adjuntar el PDF con la información solicitada.
              </div>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4, marginRight: 4 }}>Enviado · 10:07 AM</span>
            </div>

            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
              <div className="flex items-center" style={{ background: "rgba(245,189,93,0.1)", border: "1px solid rgba(245,189,93,0.2)", borderRadius: 9999, padding: "6px 16px", gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: "#f5bd5d", fontSize: 14 }}>check_circle</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#f5bd5d", textTransform: "uppercase", letterSpacing: "0.1em" }}>Lead Calificado</span>
              </div>
            </div>
          </div>

          <div style={{ padding: 24, background: "var(--secondary)", borderTop: "1px solid var(--border)" }}>
            <button
              className="w-full flex items-center justify-center"
              style={{ background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 0", fontWeight: 600, fontSize: 14, cursor: "pointer", gap: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
              Ejecutar Prueba de Estrés
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
