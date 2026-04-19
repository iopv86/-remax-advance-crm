"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ProposalRow } from "./page";

const GOLD = "#C9963A";
const BG = "#0D0E12";
const CARD = "rgba(28,29,39,0.8)";
const SURFACE = "#F5F0E8";
const DIM = "#9A9088";
const BORDER = "rgba(201,150,58,0.15)";
const BORDER_SUB = "rgba(255,255,255,0.06)";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-DO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function topProperties(views: ProposalRow["property_views"]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of views) {
    if (v.property_id && v.event_type === "property_view") {
      counts.set(v.property_id, (counts.get(v.property_id) ?? 0) + 1);
    }
  }
  return counts;
}

function eventCount(views: ProposalRow["property_views"], type: string): number {
  return views.filter((v) => v.event_type === type).length;
}

interface ProposalCardProps {
  proposal: ProposalRow;
  origin: string;
}

function ProposalCard({ proposal, origin }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const url = `${origin}/p/${proposal.slug}`;
  const opens = eventCount(proposal.property_views, "open");
  const whatsapp = eventCount(proposal.property_views, "whatsapp_click");
  const email = eventCount(proposal.property_views, "email_click");
  const pdf = eventCount(proposal.property_views, "pdf_download");
  const propViews = topProperties(proposal.property_views);
  const topPropId = [...propViews.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topPropViews = topPropId ? (propViews.get(topPropId) ?? 0) : 0;
  const propViewsTotal = [...propViews.values()].reduce((s, n) => s + n, 0);

  return (
    <div style={{
      background: CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: 16,
      backdropFilter: "blur(12px)",
      overflow: "hidden",
      boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
    }}>
      {/* Top keyline */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, rgba(201,150,58,0.3))` }} />

      <div style={{ padding: "18px 20px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 15, color: SURFACE, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {proposal.title ?? (proposal.contact_name ? `Para ${proposal.contact_name}` : "Propuesta sin título")}
            </p>
            <p style={{ fontSize: 11, color: DIM, margin: 0, fontFamily: "Inter, sans-serif" }}>
              {formatDate(proposal.created_at)} · {proposal.property_ids.length} {proposal.property_ids.length === 1 ? "propiedad" : "propiedades"}
              {proposal.contact_name && ` · ${proposal.contact_name}`}
            </p>
          </div>

          {/* Open count badge */}
          <div style={{
            background: opens > 0 ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${opens > 0 ? "rgba(16,185,129,0.2)" : BORDER_SUB}`,
            borderRadius: 20,
            padding: "4px 10px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={opens > 0 ? "#10b981" : DIM} strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: opens > 0 ? "#10b981" : DIM, fontFamily: "Inter, sans-serif" }}>
              {opens} {opens === 1 ? "vista" : "vistas"}
            </span>
          </div>
        </div>

        {/* Engagement stats */}
        {(opens > 0 || whatsapp > 0 || email > 0 || pdf > 0) && (
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            {whatsapp > 0 && <StatChip icon="💬" label={`${whatsapp}x WhatsApp`} color="#25D366" />}
            {email > 0 && <StatChip icon="📧" label={`${email}x Email`} color="#7c9fe8" />}
            {pdf > 0 && <StatChip icon="📄" label={`${pdf}x PDF`} color={GOLD} />}
            {propViewsTotal > 0 && <StatChip icon="🏠" label={`${propViewsTotal} scroll propiedad`} color="#a78bfa" />}
          </div>
        )}

        {/* Most viewed property hint */}
        {topPropId && topPropViews > 1 && (
          <div style={{
            background: "rgba(201,150,58,0.06)",
            border: `1px solid rgba(201,150,58,0.12)`,
            borderRadius: 8,
            padding: "7px 12px",
            marginBottom: 12,
            fontSize: 11,
            color: "#c4bfb8",
            fontFamily: "Inter, sans-serif",
          }}>
            ⭐ La propiedad más vista recibió <strong style={{ color: GOLD }}>{topPropViews} vistas</strong> — probablemente la que más le interesa.
          </div>
        )}

        {/* URL + actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{
            flex: 1, background: "#0D0E12", border: `1px solid ${BORDER_SUB}`, borderRadius: 6,
            padding: "6px 10px", fontSize: 11, color: DIM, fontFamily: "Inter, sans-serif",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {url}
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copiado"); }}
            style={{ ...iconBtnStyle }}
            title="Copiar link"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...iconBtnStyle, textDecoration: "none" }} title="Abrir propuesta">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
          <button
            onClick={() => {
              const text = encodeURIComponent(`Te comparto una selección de propiedades:\n${url}`);
              window.open(`https://wa.me/?text=${text}`, "_blank");
            }}
            style={{ ...iconBtnStyle, color: "#25D366", borderColor: "rgba(37,211,102,0.2)", background: "rgba(37,211,102,0.06)" }}
            title="Compartir por WhatsApp"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER_SUB}`, color: DIM,
  cursor: "pointer", flexShrink: 0,
};

function StatChip({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px",
      borderRadius: 20, background: `${color}10`, border: `1px solid ${color}25`,
      fontSize: 10, fontWeight: 600, color, fontFamily: "Inter, sans-serif",
    }}>
      {icon} {label}
    </span>
  );
}

export function ProposalsClient({ proposals }: { proposals: ProposalRow[] }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div style={{ background: BG, minHeight: "100vh", color: SURFACE }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.03em", color: SURFACE, margin: "0 0 6px" }}>
            Propuestas
          </h1>
          <p style={{ fontSize: 13, color: DIM, fontFamily: "Inter, sans-serif", margin: 0 }}>
            Links compartidos con clientes y métricas de apertura
          </p>
        </div>

        {proposals.length === 0 ? (
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
            padding: "48px 32px", textAlign: "center",
          }}>
            <p style={{ fontSize: 15, color: DIM, fontFamily: "Inter, sans-serif", margin: "0 0 8px" }}>
              No has creado propuestas todavía
            </p>
            <p style={{ fontSize: 12, color: "rgba(154,144,136,0.5)", fontFamily: "Inter, sans-serif", margin: 0 }}>
              Ve a Propiedades, selecciona propiedades y pulsa "Crear propuesta"
            </p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div style={{
              display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap",
            }}>
              {[
                { label: "Total propuestas", value: proposals.length },
                { label: "Vistas totales", value: proposals.reduce((s, p) => s + eventCount(p.property_views, "open"), 0) },
                { label: "Clicks WhatsApp", value: proposals.reduce((s, p) => s + eventCount(p.property_views, "whatsapp_click"), 0) },
                { label: "PDFs bajados", value: proposals.reduce((s, p) => s + eventCount(p.property_views, "pdf_download"), 0) },
              ].map((stat) => (
                <div key={stat.label} style={{
                  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: "12px 18px", flex: 1, minWidth: 120,
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: DIM, fontFamily: "Inter, sans-serif", margin: "0 0 4px" }}>
                    {stat.label}
                  </p>
                  <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: 28, color: GOLD, margin: 0, lineHeight: 1 }}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {proposals.map((p) => (
                <ProposalCard key={p.id} proposal={p} origin={origin} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
