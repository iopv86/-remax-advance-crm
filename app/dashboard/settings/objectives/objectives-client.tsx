"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Target, DollarSign, Save } from "lucide-react";

interface AgentRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  captaciones_objetivo: number | null;
  facturacion_objetivo: number | null;
}

const GOLD = "#C9963A";
const BG   = "#0D0E12";
const CARD = "rgba(28,29,39,0.8)";
const BORDER = "rgba(201,150,58,0.15)";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED   = "#9899A8";

export function ObjectivesClient({ agents: initial, embedded = false }: { agents: AgentRow[]; embedded?: boolean }) {
  const [agents, setAgents] = useState<AgentRow[]>(initial);
  const [saving, setSaving] = useState<string | null>(null);

  function update(id: string, field: "captaciones_objetivo" | "facturacion_objetivo", raw: string) {
    const parsed = raw === "" ? null : Number(raw);
    setAgents((prev) => prev.map((a) => a.id === id ? { ...a, [field]: parsed } : a));
  }

  async function save(agent: AgentRow) {
    setSaving(agent.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("agents")
      .update({
        captaciones_objetivo: agent.captaciones_objetivo,
        facturacion_objetivo: agent.facturacion_objetivo,
      })
      .eq("id", agent.id);
    setSaving(null);
    if (error) {
      toast.error("Error al guardar: " + error.message);
    } else {
      toast.success(`Objetivos de ${agent.full_name} actualizados`);
    }
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: "Admin", manager: "Manager", agent: "Agente", viewer: "Viewer",
  };

  const content = (
    <div style={{ maxWidth: embedded ? undefined : 900, margin: embedded ? undefined : "0 auto", padding: embedded ? "0" : "40px 24px 80px" }}>
        {/* Legend */}
        <div style={{ display: "flex", gap: 24, marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: TEXT_MUTED }}>
            <Target size={14} color={GOLD} />
            <span><strong style={{ color: TEXT_PRIMARY }}>Captaciones</strong> — número de cierres mensuales objetivo</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: TEXT_MUTED }}>
            <DollarSign size={14} color="#22c55e" />
            <span><strong style={{ color: TEXT_PRIMARY }}>Facturación</strong> — ingresos objetivo en USD</span>
          </div>
        </div>

        {/* Agent rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                background: CARD, backdropFilter: "blur(12px)",
                border: `1px solid ${BORDER}`, borderRadius: 16,
                padding: "20px 24px",
                display: "grid",
                gridTemplateColumns: "1fr 180px 200px auto",
                alignItems: "center",
                gap: 20,
              }}
            >
              {/* Agent info */}
              <div>
                <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 15, color: TEXT_PRIMARY, margin: "0 0 3px" }}>
                  {agent.full_name}
                </p>
                <p style={{ fontSize: 11, color: TEXT_MUTED, margin: 0 }}>
                  {ROLE_LABELS[agent.role] ?? agent.role} · {agent.email}
                </p>
              </div>

              {/* Captaciones input */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT_MUTED, marginBottom: 6 }}>
                  Captaciones / mes
                </label>
                <div style={{ position: "relative" }}>
                  <Target size={13} color={GOLD} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    type="number"
                    min="0"
                    placeholder="Sin objetivo"
                    value={agent.captaciones_objetivo ?? ""}
                    onChange={(e) => update(agent.id, "captaciones_objetivo", e.target.value)}
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid rgba(255,255,255,0.08)`,
                      borderRadius: 8,
                      padding: "8px 10px 8px 30px",
                      fontSize: 13,
                      color: TEXT_PRIMARY,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = GOLD; }}
                    onBlur={(e)  => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
                  />
                </div>
              </div>

              {/* Facturación input */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: TEXT_MUTED, marginBottom: 6 }}>
                  Facturación USD / mes
                </label>
                <div style={{ position: "relative" }}>
                  <DollarSign size={13} color="#22c55e" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    type="number"
                    min="0"
                    placeholder="Sin objetivo"
                    value={agent.facturacion_objetivo ?? ""}
                    onChange={(e) => update(agent.id, "facturacion_objetivo", e.target.value)}
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid rgba(255,255,255,0.08)`,
                      borderRadius: 8,
                      padding: "8px 10px 8px 30px",
                      fontSize: 13,
                      color: TEXT_PRIMARY,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "#22c55e"; }}
                    onBlur={(e)  => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
                  />
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={() => save(agent)}
                disabled={saving === agent.id}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: saving === agent.id ? "rgba(201,150,58,0.3)" : GOLD,
                  color: "#281900",
                  fontWeight: 700, fontSize: 12,
                  padding: "10px 16px", borderRadius: 8, border: "none",
                  cursor: saving === agent.id ? "not-allowed" : "pointer",
                  transition: "opacity 0.15s",
                  whiteSpace: "nowrap",
                  alignSelf: "flex-end",
                  marginTop: 22,
                }}
              >
                <Save size={13} />
                {saving === agent.id ? "Guardando…" : "Guardar"}
              </button>
            </div>
          ))}

          {agents.length === 0 && (
            <div style={{ textAlign: "center", padding: "64px 0", color: TEXT_MUTED }}>
              <Target size={40} color={BORDER} style={{ margin: "0 auto 16px" }} />
              <p style={{ fontSize: 13 }}>No hay agentes activos.</p>
            </div>
          )}
        </div>
    </div>
  );

  if (embedded) return content;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT_PRIMARY, fontFamily: "Inter, sans-serif" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "rgba(13,14,18,0.92)", backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${BORDER}`,
        padding: "20px 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: GOLD, margin: "0 0 4px" }}>
            Configuración
          </p>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: 0 }}>
            Objetivos por Agente
          </h1>
        </div>
        <p style={{ fontSize: 13, color: TEXT_MUTED, maxWidth: 320, textAlign: "right", lineHeight: 1.5 }}>
          Define metas mensuales de captaciones y facturación para cada agente.
          El progreso se muestra en el KPI de Agentes.
        </p>
      </header>
      {content}
    </div>
  );
}
