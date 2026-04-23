"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, Save, ChevronUp, ChevronDown, Users } from "lucide-react";

interface Agent {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface ConfigRow {
  id: string;
  agent_id: string;
  position: number;
  is_active: boolean;
}

interface RREntry {
  agent_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  position: number;
}

// ─── Shared agent list ────────────────────────────────────────────────────────

function RoundRobinList({
  entries,
  onMove,
  onToggle,
}: {
  entries: RREntry[];
  onMove: (i: number, dir: -1 | 1) => void;
  onToggle: (i: number) => void;
}) {
  const BORDER_L = "rgba(201,150,58,0.15)";
  const GOLD_L   = "#C9963A";
  const MUTED_L  = "#9899A8";
  const PRI_L    = "#E8E3DC";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((entry, i) => (
        <div
          key={entry.agent_id}
          style={{
            background: entry.is_active ? "rgba(28,29,39,0.8)" : "rgba(14,15,20,0.6)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${entry.is_active ? BORDER_L : "rgba(255,255,255,0.05)"}`,
            borderRadius: 14,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: entry.is_active ? 1 : 0.55,
            transition: "all 0.15s",
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: entry.is_active ? "rgba(201,150,58,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${entry.is_active ? "rgba(201,150,58,0.25)" : "rgba(255,255,255,0.06)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700,
            color: entry.is_active ? GOLD_L : MUTED_L,
            flexShrink: 0,
          }}>{i + 1}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
            <button onClick={() => onMove(i, -1)} disabled={i === 0}
              style={{ background: "none", border: "none", padding: "2px 4px", cursor: i === 0 ? "not-allowed" : "pointer", color: i === 0 ? "rgba(255,255,255,0.1)" : MUTED_L, lineHeight: 1 }}>
              <ChevronUp size={14} />
            </button>
            <button onClick={() => onMove(i, 1)} disabled={i === entries.length - 1}
              style={{ background: "none", border: "none", padding: "2px 4px", cursor: i === entries.length - 1 ? "not-allowed" : "pointer", color: i === entries.length - 1 ? "rgba(255,255,255,0.1)" : MUTED_L, lineHeight: 1 }}>
              <ChevronDown size={14} />
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 14, color: PRI_L, margin: "0 0 2px" }}>{entry.full_name}</p>
            <p style={{ fontSize: 11, color: MUTED_L, margin: 0 }}>{entry.email}</p>
          </div>
          <button onClick={() => onToggle(i)} style={{
            display: "flex", alignItems: "center", gap: 8,
            background: entry.is_active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${entry.is_active ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 20, padding: "6px 14px", cursor: "pointer", transition: "all 0.15s",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.is_active ? "#22c55e" : "rgba(255,255,255,0.2)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: entry.is_active ? "#22c55e" : MUTED_L, whiteSpace: "nowrap" }}>
              {entry.is_active ? "En rotación" : "Excluido"}
            </span>
          </button>
        </div>
      ))}
      {entries.length === 0 && (
        <div style={{ textAlign: "center", padding: "64px 0", color: "#9899A8" }}>
          <Users size={40} color="rgba(201,150,58,0.15)" style={{ margin: "0 auto 16px" }} />
          <p style={{ fontSize: 13 }}>No hay agentes activos configurados.</p>
        </div>
      )}
    </div>
  );
}

const GOLD = "#C9963A";
const BG   = "#0D0E12";
const CARD = "rgba(28,29,39,0.8)";
const BORDER = "rgba(201,150,58,0.15)";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED   = "#9899A8";

export function RoundRobinClient({
  agents,
  config: initialConfig,
  embedded = false,
}: {
  agents: Agent[];
  config: ConfigRow[];
  embedded?: boolean;
}) {
  const [entries, setEntries] = useState<RREntry[]>([]);
  const [saving, setSaving] = useState(false);

  // Merge agents + config on mount
  useEffect(() => {
    if (initialConfig.length > 0) {
      // Config exists — use it, join with agent names
      const merged = initialConfig
        .map((c) => {
          const agent = agents.find((a) => a.id === c.agent_id);
          if (!agent) return null;
          return {
            agent_id: c.agent_id,
            full_name: agent.full_name,
            email: agent.email,
            is_active: c.is_active,
            position: c.position,
          };
        })
        .filter(Boolean) as RREntry[];

      // Append any active agents not yet in config (new hires)
      const configured = new Set(merged.map((e) => e.agent_id));
      const newAgents: RREntry[] = agents
        .filter((a) => !configured.has(a.id))
        .map((a, i) => ({
          agent_id: a.id,
          full_name: a.full_name,
          email: a.email,
          is_active: false,
          position: merged.length + i + 1,
        }));

      setEntries([...merged, ...newAgents]);
    } else {
      // No config yet — bootstrap from all agents, all inactive (admin must explicitly enable)
      setEntries(
        agents.map((a, i) => ({
          agent_id: a.id,
          full_name: a.full_name,
          email: a.email,
          is_active: false,
          position: i + 1,
        }))
      );
    }
  }, []);

  function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= entries.length) return;
    setEntries((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr.map((e, i) => ({ ...e, position: i + 1 }));
    });
  }

  function toggle(index: number) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, is_active: !e.is_active } : e
      )
    );
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();

    // Upsert all entries — delete old rows first for simplicity
    const { error: delErr } = await supabase
      .from("round_robin_config")
      .delete()
      .neq("agent_id", "00000000-0000-0000-0000-000000000000"); // delete all

    if (delErr) {
      toast.error("Error al guardar: " + delErr.message);
      setSaving(false);
      return;
    }

    const rows = entries.map((e) => ({
      agent_id: e.agent_id,
      position: e.position,
      is_active: e.is_active,
    }));

    const { error } = await supabase.from("round_robin_config").insert(rows);
    setSaving(false);

    if (error) {
      toast.error("Error al guardar: " + error.message);
    } else {
      toast.success("Configuración de Round Robin guardada");
    }
  }

  const activeCount = entries.filter((e) => e.is_active).length;

  if (embedded) {
    return (
      <div style={{ color: TEXT_PRIMARY, fontFamily: "Inter, sans-serif" }}>
        {/* Embedded header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <RefreshCw size={16} color={GOLD} />
            <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 15, color: TEXT_PRIMARY }}>
              Round Robin — <strong style={{ color: TEXT_MUTED, fontWeight: 500 }}>{activeCount} agente{activeCount !== 1 ? "s" : ""} activo{activeCount !== 1 ? "s" : ""}</strong>
            </span>
          </div>
          <button
            onClick={save}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: saving ? "rgba(201,150,58,0.3)" : GOLD,
              color: "#281900", fontWeight: 700, fontSize: 12,
              padding: "8px 16px", borderRadius: 8, border: "none",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            <Save size={13} />
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
        {/* Info bar */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          background: "rgba(201,150,58,0.06)", border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: TEXT_MUTED,
        }}>
          Los leads nuevos se asignan en rotación a los agentes activos según el orden definido.
          Usa las flechas para reordenar y el toggle para incluir o excluir.
        </div>
        <RoundRobinList entries={entries} onMove={move} onToggle={toggle} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT_PRIMARY, fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
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
            Round Robin — Asignación de Leads
          </h1>
        </div>
        <button
          onClick={save}
          disabled={saving}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: saving ? "rgba(201,150,58,0.3)" : GOLD,
            color: "#281900",
            fontWeight: 700, fontSize: 13,
            padding: "10px 20px", borderRadius: 10, border: "none",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          <Save size={15} />
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </header>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Info */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 16,
          background: "rgba(201,150,58,0.06)", border: `1px solid ${BORDER}`,
          borderRadius: 14, padding: "16px 20px", marginBottom: 32,
        }}>
          <RefreshCw size={18} color={GOLD} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, margin: "0 0 4px" }}>
              Cómo funciona el Round Robin
            </p>
            <p style={{ fontSize: 12, color: TEXT_MUTED, margin: 0, lineHeight: 1.6 }}>
              Los leads nuevos se asignan automáticamente en rotación a los agentes activos,
              siguiendo el orden definido abajo. Usa las flechas para reordenar y el toggle para
              incluir o excluir un agente de la rotación.
              <strong style={{ color: TEXT_PRIMARY }}> {activeCount} agente{activeCount !== 1 ? "s" : ""} activo{activeCount !== 1 ? "s" : ""}</strong> en rotación.
            </p>
          </div>
        </div>

        <RoundRobinList entries={entries} onMove={move} onToggle={toggle} />
      </div>
    </div>
  );
}
