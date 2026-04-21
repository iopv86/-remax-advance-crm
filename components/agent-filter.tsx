"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Users, Check } from "lucide-react";

export interface AgentFilterOption {
  id: string;
  full_name: string | null;
}

interface Props {
  agents: AgentFilterOption[];
  value: string | null; // null = all agents
  onChange: (agentId: string | null) => void;
  label?: string;
  allLabel?: string;
}

const GOLD = "#C9963A";
const BG_CARD = "rgba(28,29,39,0.95)";
const BG_HOVER = "rgba(201,150,58,0.08)";
const BORDER = "rgba(201,150,58,0.2)";
const BORDER_STRONG = "rgba(201,150,58,0.45)";
const TEXT_PRIMARY = "#e5e2e1";
const TEXT_MUTED = "#9A9088";

export function AgentFilter({
  agents,
  value,
  onChange,
  label,
  allLabel = "Todos (equipo completo)",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const selected = value ? agents.find((a) => a.id === value) : null;
  const selectedLabel = selected?.full_name ?? allLabel;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {label && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: TEXT_MUTED,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 6,
            fontFamily: "Manrope, sans-serif",
          }}
        >
          {label}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          minWidth: 240,
          padding: "9px 12px 9px 14px",
          background: BG_CARD,
          border: `1px solid ${open ? BORDER_STRONG : BORDER}`,
          borderRadius: 8,
          color: TEXT_PRIMARY,
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          transition: "border-color 0.15s, background 0.15s",
          justifyContent: "space-between",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.borderColor = BORDER_STRONG;
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.borderColor = BORDER;
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Users style={{ width: 14, height: 14, color: GOLD, flexShrink: 0 }} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: selected ? GOLD : TEXT_PRIMARY,
              fontWeight: selected ? 600 : 500,
            }}
          >
            {selectedLabel}
          </span>
        </span>
        <ChevronDown
          style={{
            width: 14,
            height: 14,
            color: TEXT_MUTED,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: BG_CARD,
            backdropFilter: "blur(14px)",
            border: `1px solid ${BORDER_STRONG}`,
            borderRadius: 8,
            boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
            maxHeight: 320,
            overflowY: "auto",
            padding: 4,
          }}
        >
          <OptionRow
            active={value === null}
            label={allLabel}
            sublabel={`${agents.length} agente${agents.length === 1 ? "" : "s"}`}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            isAll
          />
          <div
            style={{
              height: 1,
              background: "rgba(201,150,58,0.12)",
              margin: "4px 6px",
            }}
          />
          {agents.map((a) => (
            <OptionRow
              key={a.id}
              active={value === a.id}
              label={a.full_name ?? "Sin nombre"}
              onClick={() => {
                onChange(a.id);
                setOpen(false);
              }}
            />
          ))}
          {agents.length === 0 && (
            <div
              style={{
                padding: "12px 14px",
                fontSize: 12,
                color: TEXT_MUTED,
                fontFamily: "Inter, sans-serif",
              }}
            >
              No hay agentes activos
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OptionRow({
  active,
  label,
  sublabel,
  onClick,
  isAll,
}: {
  active: boolean;
  label: string;
  sublabel?: string;
  onClick: () => void;
  isAll?: boolean;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        background: active ? "rgba(201,150,58,0.12)" : "transparent",
        border: "none",
        borderRadius: 6,
        color: active ? GOLD : TEXT_PRIMARY,
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = BG_HOVER;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {isAll && <Users style={{ width: 13, height: 13, color: active ? GOLD : TEXT_MUTED, flexShrink: 0 }} />}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span style={{ color: TEXT_MUTED, fontSize: 11, fontWeight: 500 }}>
            · {sublabel}
          </span>
        )}
      </span>
      {active && <Check style={{ width: 14, height: 14, color: GOLD, flexShrink: 0 }} />}
    </button>
  );
}
