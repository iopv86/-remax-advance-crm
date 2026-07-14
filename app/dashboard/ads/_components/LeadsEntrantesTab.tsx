"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { IncomingLead, AgentSummary } from "../_lib/incoming-leads";

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

// Aging -> color (24h ambar, 72h rojo). Sin SLA automatico (fase 2).
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

export function LeadsEntrantesTab({
  leads,
  summaries,
  privileged,
}: {
  leads: IncomingLead[];
  summaries: AgentSummary[];
  privileged: boolean;
}) {
  const router = useRouter();
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (agentFilter === "all" ? leads : leads.filter((l) => l.agentId === agentFilter)),
    [leads, agentFilter]
  );

  const totalUntouched = leads.filter((l) => !l.touched).length;

  // Realtime: una fila que entra/sale de nuevo_sin_contactar (deals) o un primer
  // toque humano (activities) invalida la vista. En vez de replicar la derivacion
  // server-side (firstTouch/aging/summaries), disparamos router.refresh() con debounce,
  // que revalida el server component y re-deriva con el scoping correcto.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 800);
    };

    const channel = supabase
      .channel("leads-entrantes-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "deals" }, scheduleRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "deals" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Metrica dual: N en cola . M sin tocar (coherente con las AgentCard). */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 20 }}>
        <span
          className="text-[20px] md:text-[28px]"
          style={{ fontFamily: "Manrope, var(--font-manrope), sans-serif", fontWeight: 700, color: "var(--foreground)" }}
        >
          {leads.length}
        </span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>en cola</span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>·</span>
        <span
          style={{ fontSize: 15, fontWeight: 700, color: totalUntouched > 0 ? "#f59e0b" : "var(--muted-foreground)" }}
        >
          {totalUntouched}
        </span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>sin tocar</span>
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
