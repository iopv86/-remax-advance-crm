"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface IncomingLead {
  dealId: string;
  contactId: string;
  agentId: string;
  agentName: string;
  name: string;
  phone: string | null;
  source: string | null;
  classification: string | null;
  assignedAt: string;
  agingHours: number;
  touched: boolean;
  firstTouchHours: number | null;
}

export interface AgentSummary {
  agentId: string;
  agentName: string;
  assigned: number;
  untouched: number;
  touched: number;
}

const SOURCE_LABELS: Record<string, string> = {
  ctwa_ad: "WhatsApp Ad",
  lead_form: "Formulario",
  referral: "Referido",
  walk_in: "Walk-in",
  website: "Web",
  social_media: "Social",
  other: "Otro",
};

const CLASS_LABELS: Record<string, string> = {
  hot: "HOT",
  warm: "WARM",
  cold: "COLD",
  unqualified: "S/CALIF",
};

// Aging → color (24h ámbar, 72h rojo). Sin SLA automático (fase 2).
function agingColor(hours: number): string {
  if (hours >= 72) return "#ef4444";
  if (hours >= 24) return "#f59e0b";
  return "#94a3b8";
}

function fmtHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function LeadsEntrantesClient({
  leads,
  summaries,
  privileged,
}: {
  leads: IncomingLead[];
  summaries: AgentSummary[];
  privileged: boolean;
}) {
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (agentFilter === "all" ? leads : leads.filter((l) => l.agentId === agentFilter)),
    [leads, agentFilter]
  );

  const totalUntouched = leads.filter((l) => !l.touched).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      <div className="px-4 pt-6 pb-0 md:px-12 md:pt-8" style={{ background: "var(--background)" }}>
        <nav
          style={{
            display: "flex", alignItems: "center", gap: 6, color: "var(--muted-foreground)",
            fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.2em",
          }}
        >
          <span>Dashboard</span>
          <span style={{ fontSize: 10 }}>›</span>
          <span style={{ color: "var(--primary)" }}>Leads Entrantes</span>
        </nav>
        <div className="flex flex-col gap-3 mb-6 md:flex-row md:justify-between md:items-end md:mb-8">
          <h1
            className="text-[26px] md:text-[36px]"
            style={{
              fontFamily: "Manrope, var(--font-manrope), sans-serif", fontWeight: 800,
              color: "var(--foreground)", letterSpacing: "-0.02em", lineHeight: 1,
            }}
          >
            Leads Entrantes
          </h1>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }} className="md:items-end">
            <span style={{ color: "var(--muted-foreground)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em" }}>
              Sin contactar
            </span>
            <div
              className="text-[20px] md:text-[28px]"
              style={{ fontFamily: "Manrope, var(--font-manrope), sans-serif", fontWeight: 700, color: totalUntouched > 0 ? "#f59e0b" : "var(--primary)" }}
            >
              {totalUntouched}
            </div>
          </div>
        </div>

        {/* Resumen por agente */}
        {privileged && summaries.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
            <AgentCard
              label="Todos"
              active={agentFilter === "all"}
              onClick={() => setAgentFilter("all")}
              assigned={leads.length}
              untouched={totalUntouched}
            />
            {summaries.map((s) => (
              <AgentCard
                key={s.agentId}
                label={s.agentName}
                active={agentFilter === s.agentId}
                onClick={() => setAgentFilter(s.agentId)}
                assigned={s.assigned}
                untouched={s.untouched}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-10 md:px-12 md:pb-12" style={{ flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--muted-foreground)" }}>
            No hay leads sin contactar.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((l) => (
              <LeadRow key={l.dealId} lead={l} showAgent={privileged} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  label, active, onClick, assigned, untouched,
}: {
  label: string; active: boolean; onClick: () => void; assigned: number; untouched: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--card)",
        border: active ? "1px solid var(--primary)" : "1px solid var(--border)",
        borderRadius: 8, padding: "10px 18px", cursor: "pointer", textAlign: "left",
        display: "flex", flexDirection: "column", gap: 4, minWidth: 140,
      }}
    >
      <span style={{ color: "var(--foreground)", fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        {assigned} asignados · <span style={{ color: untouched > 0 ? "#f59e0b" : "var(--muted-foreground)", fontWeight: 600 }}>{untouched} sin tocar</span>
      </span>
    </button>
  );
}

function LeadRow({ lead, showAgent }: { lead: IncomingLead; showAgent: boolean }) {
  const color = agingColor(lead.agingHours);
  const digits = lead.phone?.replace(/\D/g, "") ?? "";
  return (
    <div
      style={{
        background: "var(--card)",
        borderLeft: `4px solid ${color}`,
        borderRadius: 6, padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <Link
          href={`/dashboard/contacts/${lead.contactId}`}
          style={{ color: "var(--foreground)", fontWeight: 600, fontSize: 15, textDecoration: "none" }}
        >
          {lead.name}
        </Link>
        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          {lead.classification && (
            <Badge text={CLASS_LABELS[lead.classification] ?? lead.classification} />
          )}
          {lead.source && <Badge text={SOURCE_LABELS[lead.source] ?? lead.source} />}
          {!lead.touched && <Badge text="SIN TOCAR" tone="warn" />}
        </div>
      </div>

      {showAgent && (
        <div style={{ flex: "0 0 auto", color: "var(--muted-foreground)", fontSize: 13 }}>
          {lead.agentName}
        </div>
      )}

      <div style={{ flex: "0 0 auto", textAlign: "right" }}>
        <div style={{ color, fontWeight: 700, fontSize: 14 }}>{fmtHours(lead.agingHours)}</div>
        <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
          {lead.touched ? `1er contacto: ${fmtHours(lead.firstTouchHours)}` : "esperando"}
        </div>
      </div>

      {digits && (
        <a
          href={`https://wa.me/${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: "0 0 auto", background: "#25D366", color: "#fff", borderRadius: 6,
            padding: "6px 12px", fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}
        >
          WhatsApp
        </a>
      )}
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone?: "warn" }) {
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
        padding: "2px 8px", borderRadius: 999,
        background: tone === "warn" ? "rgba(245,158,11,0.15)" : "var(--surface-3, rgba(148,163,184,0.15))",
        color: tone === "warn" ? "#f59e0b" : "var(--muted-foreground)",
      }}
    >
      {text}
    </span>
  );
}
