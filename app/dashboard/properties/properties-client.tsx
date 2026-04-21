"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PropertySheet } from "@/components/property-sheet";
import { Button } from "@/components/ui/button";
import type { Property } from "@/lib/types";

// ─── Label maps ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  apartment: "Apartamento",
  penthouse: "Penthouse",
  villa: "Villa",
  house: "Casa",
  land: "Solar",
  commercial: "Local Comercial",
  apart_hotel: "Apart-Hotel",
  farm: "Finca",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Disponible",
  reserved: "Reservado",
  sold: "Vendido",
  rented: "Rentado",
  inactive: "Inactivo",
};

// ─── Filter types ─────────────────────────────────────────────────────────────

type TipoFilter = "all" | "Casa" | "Apto" | "Terreno";
type DormFilter = 0 | 1 | 2 | 3 | 4;

const TIPO_MAP: Record<string, TipoFilter> = {
  house: "Casa",
  villa: "Casa",
  apartment: "Apto",
  penthouse: "Apto",
  apart_hotel: "Apto",
  land: "Terreno",
  farm: "Terreno",
  commercial: "Terreno",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function statusBadge(status: Property["status"]): { label: string; bg: string; color: string } {
  switch (status) {
    case "active":
      return { label: "Disponible", bg: "rgba(16,185,129,0.10)", color: "#10B981" };
    case "reserved":
      return { label: "Reservado", bg: "rgba(245,158,11,0.10)", color: "#F59E0B" };
    case "sold":
      return { label: "Vendido", bg: "rgba(239,68,68,0.10)", color: "#ef4444" };
    case "rented":
      return { label: "Rentado", bg: "rgba(99,102,241,0.10)", color: "#6366f1" };
    default:
      return { label: STATUS_LABELS[status] ?? status, bg: "rgba(107,114,128,0.10)", color: "#6B7280" };
  }
}

// ─── Price formatter ──────────────────────────────────────────────────────────

function formatPrice(price: number, currency?: string): string {
  const cur = currency ?? "USD";
  if (price >= 1_000_000) {
    return `${cur} ${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 2)}M`;
  }
  return `${cur} ${price.toLocaleString()}`;
}

// ─── Project tag helper ───────────────────────────────────────────────────────

function projectTagStyle(name: string): React.CSSProperties {
  const gold = ["COL", "BCR"];
  return gold.includes(name)
    ? { background: "#C9963A", color: "#0D0E12" }
    : { background: "rgba(13,14,18,0.80)", backdropFilter: "blur(6px)", color: "#E8E3DC" };
}

// ─── Inline styles as constants ───────────────────────────────────────────────

const GOLD = "#C9963A";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED = "#9899A8";
const TEXT_DIM = "#6B7280";
const BG_SURFACE = "#201f1f";
const BG_ELEVATED = "#1C1D27";
const BG_BODY = "#0D0E12";
const BORDER_GOLD = "rgba(201,150,58,0.15)";

const glassCard: React.CSSProperties = {
  background: "rgba(28,29,39,0.7)",
  backdropFilter: "blur(12px)",
  border: `1px solid ${BORDER_GOLD}`,
  boxShadow: "0 0 40px rgba(245,189,93,0.04)",
  borderRadius: 12,
  overflow: "hidden",
};

const filterLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: TEXT_MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 12,
  fontFamily: "Manrope, sans-serif",
};

function pillBtn(active: boolean): React.CSSProperties {
  return active
    ? { background: GOLD, color: "#0D0E12", fontWeight: 700, border: "none", cursor: "pointer", borderRadius: 9999, padding: "6px 12px", fontSize: 11, transition: "all 0.15s" }
    : { background: BG_SURFACE, color: TEXT_PRIMARY, fontWeight: 500, border: "none", cursor: "pointer", borderRadius: 9999, padding: "6px 12px", fontSize: 11, transition: "all 0.15s" };
}

function dormBtn(active: boolean): React.CSSProperties {
  return active
    ? { background: GOLD, color: "#0D0E12", fontWeight: 700, border: "none", cursor: "pointer", borderRadius: 4, height: 32, fontSize: 11, transition: "colors 0.15s" }
    : { background: BG_SURFACE, color: TEXT_PRIMARY, fontWeight: 400, border: "none", cursor: "pointer", borderRadius: 4, height: 32, fontSize: 11, transition: "colors 0.15s" };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialProperties: Property[];
  currentAgentId: string;
  currentRole: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PropertiesClient({ initialProperties, currentAgentId, currentRole }: Props) {
  function canWrite(property: Property): boolean {
    return property.agent_id === currentAgentId || currentRole === "admin" || currentRole === "manager";
  }
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposalCreatingSlug, setProposalCreatingSlug] = useState(false);
  const [proposalShareSlug, setProposalShareSlug] = useState<string | null>(null);
  const [proposalForm, setProposalForm] = useState({ title: "", message: "", contactName: "" });
  const [search, setSearch] = useState("");

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Filter state
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("all");
  const [maxPrice, setMaxPrice] = useState(5_000_000);
  const [dormFilter, setDormFilter] = useState<DormFilter>(0);
  const [showDisponible, setShowDisponible] = useState(false);
  const [showReservado, setShowReservado] = useState(false);
  const [propPage, setPropPage] = useState(1);
  const PROP_PAGE_SIZE = 50;

  // Filtering
  const filtered = properties.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.title.toLowerCase().includes(q) &&
        !(p.city ?? "").toLowerCase().includes(q) &&
        !(p.sector ?? "").toLowerCase().includes(q)
      ) return false;
    }
    if (tipoFilter !== "all") {
      const t = TIPO_MAP[p.property_type] ?? "Terreno";
      if (t !== tipoFilter) return false;
    }
    if (p.price != null && p.price > maxPrice) return false;
    if (dormFilter > 0) {
      const beds = p.bedrooms ?? 0;
      if (dormFilter === 4) { if (beds < 4) return false; }
      else if (dormFilter === 3) { if (beds < 3) return false; }
      else { if (beds !== dormFilter) return false; }
    }
    if (showDisponible && !showReservado && p.status !== "active") return false;
    if (showReservado && !showDisponible && p.status !== "reserved") return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PROP_PAGE_SIZE);
  const pagedItems = filtered.slice((propPage - 1) * PROP_PAGE_SIZE, propPage * PROP_PAGE_SIZE);

  function resetPage() { setPropPage(1); }

  function openCreate() {
    setEditProperty(null);
    setSheetOpen(true);
  }

  function openEdit(p: Property) {
    setEditProperty(p);
    setSheetOpen(true);
  }

  const onSaved = useCallback(() => {
    router.refresh();
  }, [router]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGeneratePdf() {
    if (!selectedIds.size) return;
    setGeneratingPdf(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyIds: Array.from(selectedIds),
        agentEmail: user?.email,
      }),
    });
    setGeneratingPdf(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      toast.error(err.error ?? "Error generando PDF");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "propuesta-advance-estate.pdf";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("PDF generado y descargado");
  }

  async function handleCreateProposal() {
    if (!selectedIds.size) return;
    setProposalCreatingSlug(true);
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyIds: Array.from(selectedIds),
        title: proposalForm.title.trim() || null,
        message: proposalForm.message.trim() || null,
        contactName: proposalForm.contactName.trim() || null,
      }),
    });
    setProposalCreatingSlug(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      toast.error(err.error ?? "Error creando propuesta");
      return;
    }
    const { slug } = await res.json() as { slug: string };
    setProposalModalOpen(false);
    setProposalShareSlug(slug);
    setProposalForm({ title: "", message: "", contactName: "" });
  }

  async function handleDelete(p: Property) {
    if (!confirm(`¿Eliminar "${p.title}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(p.id);
    const supabase = createClient();
    const { error } = await supabase.from("properties").delete().eq("id", p.id);
    setDeletingId(null);
    if (error) {
      toast.error("Error al eliminar: " + error.message);
      return;
    }
    toast.success("Propiedad eliminada");
    setProperties((prev) => prev.filter((x) => x.id !== p.id));
    router.refresh();
  }

  const TIPOS: TipoFilter[] = ["all", "Casa", "Apto", "Terreno"];
  const DORMS: { label: string; val: DormFilter }[] = [
    { label: "1", val: 1 },
    { label: "2", val: 2 },
    { label: "3+", val: 3 },
    { label: "4+", val: 4 },
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: BG_BODY,
        color: TEXT_PRIMARY,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* ── Filter Sidebar — desktop only ───────────────────────────────── */}
      <aside
        className="hidden md:flex"
        style={{
          width: 220,
          flexShrink: 0,
          background: "#0E0E0E",
          borderRight: `1px solid ${BG_SURFACE}`,
          flexDirection: "column",
          padding: "28px 20px",
          gap: 0,
          overflowY: "auto",
        }}
      >
        {/* Spacer area for filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28, flex: 1 }}>
          {/* Tipo */}
          <section>
            <span style={filterLabel}>Tipo</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TIPOS.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTipoFilter(t); resetPage(); }}
                  style={{
                    ...pillBtn(tipoFilter === t),
                    borderRadius: 6,
                    padding: "6px 12px",
                  }}
                >
                  {t === "all" ? "Todos" : t}
                </button>
              ))}
            </div>
          </section>

          {/* Precio */}
          <section>
            <span style={filterLabel}>Precio (USD)</span>
            <input
              type="range"
              min={50_000}
              max={5_000_000}
              step={50_000}
              value={maxPrice}
              onChange={(e) => { setMaxPrice(Number(e.target.value)); resetPage(); }}
              style={{
                width: "100%",
                height: 4,
                background: BG_SURFACE,
                borderRadius: 8,
                appearance: "none",
                cursor: "pointer",
                accentColor: GOLD,
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
                fontSize: 10,
                color: TEXT_DIM,
                fontFamily: "Manrope, sans-serif",
              }}
            >
              <span>50k</span>
              <span style={{ color: GOLD, fontSize: 10 }}>
                {maxPrice >= 1_000_000
                  ? `${(maxPrice / 1_000_000).toFixed(maxPrice % 1_000_000 === 0 ? 0 : 1)}M`
                  : `${(maxPrice / 1000).toFixed(0)}k`}
              </span>
              <span>5M</span>
            </div>
          </section>

          {/* Dormitorios */}
          <section>
            <span style={filterLabel}>Dormitorios</span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
              }}
            >
              {DORMS.map(({ label, val }) => (
                <button
                  key={val}
                  onClick={() => { setDormFilter(dormFilter === val ? 0 : val); resetPage(); }}
                  style={dormBtn(dormFilter === val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Estado */}
          <section>
            <span style={filterLabel}>Estado</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Disponible */}
              <label
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                onClick={() => { setShowDisponible((v) => !v); resetPage(); }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: `1px solid ${showDisponible ? GOLD : "#4f4537"}`,
                    background: "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {showDisponible && (
                    <div style={{ width: 8, height: 8, background: GOLD, borderRadius: "50%" }} />
                  )}
                </div>
                <span style={{ fontSize: 12, color: showDisponible ? TEXT_PRIMARY : TEXT_DIM }}>
                  Disponible
                </span>
              </label>
              {/* Reservado */}
              <label
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                onClick={() => { setShowReservado((v) => !v); resetPage(); }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: `1px solid ${showReservado ? GOLD : "#4f4537"}`,
                    background: "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {showReservado && (
                    <div style={{ width: 8, height: 8, background: GOLD, borderRadius: "50%" }} />
                  )}
                </div>
                <span style={{ fontSize: 12, color: showReservado ? TEXT_PRIMARY : TEXT_DIM }}>
                  Reservado
                </span>
              </label>
            </div>
          </section>
        </div>

        {/* PDF action (shown when properties are selected) */}
        {selectedIds.size > 0 && (
          <div style={{ paddingTop: 20, borderTop: `1px solid ${BG_SURFACE}`, marginTop: 20 }}>
            <button
              onClick={() => setProposalModalOpen(true)}
              style={{
                width: "100%",
                background: GOLD,
                color: "#0D0E12",
                padding: "10px 0",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Crear propuesta ({selectedIds.size})
            </button>
            <button
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
              style={{
                width: "100%",
                marginTop: 8,
                background: BG_SURFACE,
                color: TEXT_PRIMARY,
                padding: "9px 0",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                border: "none",
                cursor: generatingPdf ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: generatingPdf ? 0.7 : 1,
              }}
            >
              <FileText style={{ width: 14, height: 14 }} />
              {generatingPdf ? "Generando…" : "Bajar PDF"}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                width: "100%",
                marginTop: 8,
                background: "none",
                border: "none",
                color: TEXT_DIM,
                fontSize: 11,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              Limpiar selección
            </button>
          </div>
        )}
      </aside>

      {/* ── Main content area ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Top toolbar */}
        <header
          className="px-4 py-4 md:px-10 md:py-5"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            background: "rgba(13,14,18,0.80)",
            backdropFilter: "blur(16px)",
            borderBottom: `1px solid rgba(32,31,31,0.50)`,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* Page title + count */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h2
              className="text-[22px] md:text-[28px]"
              style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: TEXT_PRIMARY,
                margin: 0,
              }}
            >
              Propiedades
            </h2>
            <span style={{ color: TEXT_MUTED, fontSize: 13, fontWeight: 500 }}>
              {filtered.length} listing{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Search + actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <svg
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  color: TEXT_DIM,
                  pointerEvents: "none",
                }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Buscar propiedad…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="w-[160px] md:w-[220px]"
                style={{
                  background: BG_ELEVATED,
                  border: "none",
                  borderRadius: 9999,
                  padding: "8px 16px 8px 32px",
                  fontSize: 12,
                  color: TEXT_PRIMARY,
                  outline: "none",
                }}
              />
            </div>

            {/* Nueva propiedad */}
            <button
              onClick={openCreate}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: `1px solid ${GOLD}`,
                color: GOLD,
                padding: "8px 18px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                background: "transparent",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,150,58,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              Nueva propiedad
            </button>
          </div>
        </header>

        {/* Mobile-only filter strip */}
        <div className="flex md:hidden items-center gap-2 px-4 py-3 overflow-x-auto" style={{ borderBottom: `1px solid ${BG_SURFACE}` }}>
          {TIPOS.map((t) => (
            <button
              key={t}
              onClick={() => { setTipoFilter(t); resetPage(); }}
              style={{
                ...pillBtn(tipoFilter === t),
                borderRadius: 6,
                whiteSpace: "nowrap",
              }}
            >
              {t === "all" ? "Tipo: todos" : t}
            </button>
          ))}
        </div>

        {/* Property grid */}
        <div
          className="px-4 py-6 pb-20 md:px-10 md:py-8 md:pb-20"
          style={{ flex: 1 }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "80px 0",
                color: TEXT_DIM,
                gap: 12,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                style={{ width: 48, height: 48, opacity: 0.2 }}
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <p style={{ fontSize: 14 }}>No hay propiedades en esta categoría.</p>
              <Button
                onClick={openCreate}
                variant="outline"
                size="sm"
                style={{
                  marginTop: 4,
                  borderColor: GOLD,
                  color: GOLD,
                  background: "transparent",
                  fontSize: 11,
                }}
              >
                <Plus style={{ width: 12, height: 12, marginRight: 4 }} />
                Agregar propiedad
              </Button>
            </div>
          ) : (
            <>
            <div
              className="grid gap-5 md:gap-7"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
              }}
            >
              {pagedItems.map((p) => {
                const badge = statusBadge(p.status);
                const isSelected = selectedIds.has(p.id);

                return (
                  <div
                    key={p.id}
                    onClick={() => router.push(`/dashboard/properties/${p.id}`)}
                    onMouseEnter={() => setHoveredId(p.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      ...glassCard,
                      display: "flex",
                      flexDirection: "column",
                      cursor: "pointer",
                      outline: isSelected ? `2px solid ${GOLD}` : "none",
                      outlineOffset: 2,
                      position: "relative",
                    }}
                  >
                    {/* Image zone */}
                    <div
                      style={{
                        height: 200,
                        overflow: "hidden",
                        position: "relative",
                        background: BG_SURFACE,
                        flexShrink: 0,
                      }}
                    >
                      {p.images && p.images.length > 0 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.images[0]}
                          alt={p.title}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={BORDER_GOLD}
                            strokeWidth={1}
                            style={{ width: 40, height: 40 }}
                          >
                            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                        </div>
                      )}

                      {/* Project tag(s) */}
                      <div
                        style={{
                          position: "absolute",
                          top: 12,
                          left: 12,
                          display: "flex",
                          gap: 6,
                        }}
                      >
                        {/* Type tag */}
                        <span
                          style={{
                            background: "rgba(13,14,18,0.80)",
                            backdropFilter: "blur(6px)",
                            color: TEXT_PRIMARY,
                            padding: "3px 10px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                          }}
                        >
                          {TYPE_LABELS[p.property_type] ?? p.property_type}
                        </span>
                      </div>

                      {/* Selection indicator */}
                      <div
                        onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                        style={{
                          position: "absolute",
                          top: 12,
                          right: 12,
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          border: `2px solid ${isSelected ? GOLD : "rgba(255,255,255,0.5)"}`,
                          background: isSelected ? GOLD : "rgba(255,255,255,0.85)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          zIndex: 2,
                        }}
                      >
                        {isSelected && (
                          <svg viewBox="0 0 12 12" style={{ width: 10, height: 10, fill: "none" }}>
                            <path d="M1 6l3.5 3.5L11 2" stroke="#0D0E12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>

                      {/* Edit / Delete overlay — only for property owner, admin, or manager */}
                      {canWrite(p) && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: 10,
                          right: 10,
                          display: "flex",
                          gap: 6,
                          opacity: hoveredId === p.id ? 1 : 0,
                          transition: "opacity 0.2s",
                        }}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          title="Editar"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: "rgba(255,255,255,0.90)",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13 }}>
                            <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                          disabled={deletingId === p.id}
                          title="Eliminar"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: "rgba(255,255,255,0.90)",
                            border: "none",
                            cursor: deletingId === p.id ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13 }}>
                            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                      )}
                    </div>

                    {/* Card body */}
                    <div
                      style={{
                        padding: "20px 20px 16px",
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        {/* Price + status */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: 6,
                          }}
                        >
                          <h3
                            style={{
                              fontFamily: "Manrope, sans-serif",
                              fontWeight: 700,
                              fontSize: 20,
                              color: TEXT_PRIMARY,
                              letterSpacing: "-0.02em",
                              margin: 0,
                            }}
                          >
                            {p.price != null ? formatPrice(p.price, p.currency) : "—"}
                          </h3>
                          <span
                            style={{
                              background: badge.bg,
                              color: badge.color,
                              padding: "2px 7px",
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              flexShrink: 0,
                              marginLeft: 8,
                            }}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Title / ref */}
                        <p
                          style={{
                            color: TEXT_MUTED,
                            fontSize: 12,
                            fontWeight: 500,
                            marginBottom: 14,
                            margin: "0 0 14px",
                            lineHeight: 1.4,
                          }}
                        >
                          {p.title}
                          {(p.city || p.sector) && (
                            <span style={{ display: "block", marginTop: 2, fontSize: 11, color: TEXT_DIM }}>
                              {[p.sector, p.city].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Beds / baths / area + arrow */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderTop: "1px solid #2a2a2a",
                          paddingTop: 12,
                        }}
                      >
                        <div style={{ display: "flex", gap: 14 }}>
                          {p.bedrooms != null && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                fontSize: 11,
                                fontWeight: 700,
                                fontFamily: "Manrope, sans-serif",
                                color: TEXT_PRIMARY,
                              }}
                            >
                              <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, color: GOLD }}>
                                <rect x="1" y="8" width="14" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M1 10V6a1 1 0 011-1h2v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                <path d="M8 10V7a1 1 0 011-1h2a1 1 0 011 1v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              {p.bedrooms}
                            </span>
                          )}
                          {p.bathrooms != null && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                fontSize: 11,
                                fontWeight: 700,
                                fontFamily: "Manrope, sans-serif",
                                color: TEXT_PRIMARY,
                              }}
                            >
                              <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, color: GOLD }}>
                                <path d="M2 8h12v3a3 3 0 01-3 3H5a3 3 0 01-3-3V8z" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M2 8V5a1 1 0 011-1h2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                <circle cx="4" cy="3" r="0.5" fill="currentColor" />
                              </svg>
                              {p.bathrooms}
                            </span>
                          )}
                          {p.area_m2 != null && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                fontSize: 11,
                                fontWeight: 700,
                                fontFamily: "Manrope, sans-serif",
                                color: TEXT_PRIMARY,
                              }}
                            >
                              <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, color: GOLD }}>
                                <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M5 11l6-6M8 5h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              {p.area_m2}m²
                            </span>
                          )}
                        </div>

                        {/* Arrow — navigate to detail */}
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/properties/${p.id}`); }}
                          style={{
                            background: "none",
                            border: "none",
                            color: GOLD,
                            cursor: "pointer",
                            padding: 2,
                            display: "flex",
                            alignItems: "center",
                            transition: "transform 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.transform = "translateX(3px)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.transform = "translateX(0)";
                          }}
                        >
                          <svg viewBox="0 0 20 20" fill="none" style={{ width: 18, height: 18 }}>
                            <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 32 }}>
                <button
                  onClick={() => setPropPage((p) => Math.max(1, p - 1))}
                  disabled={propPage === 1}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
                    background: "transparent", color: propPage === 1 ? "rgba(154,144,136,0.3)" : "#9A9088",
                    cursor: propPage === 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - propPage) <= 1)
                  .reduce<(number | "…")[]>((acc, n) => {
                    if (acc.length && (n as number) - (acc[acc.length - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`e${i}`} style={{ width: 32, textAlign: "center", color: "#9A9088", fontSize: 13 }}>…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPropPage(p as number)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 600,
                          cursor: "pointer", border: "1px solid",
                          borderColor: p === propPage ? "#C9963A" : "rgba(255,255,255,0.08)",
                          background: p === propPage ? "#C9963A" : "transparent",
                          color: p === propPage ? "#0D0E12" : "#9A9088",
                        }}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPropPage((p) => Math.min(totalPages, p + 1))}
                  disabled={propPage === totalPages}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
                    background: "transparent", color: propPage === totalPages ? "rgba(154,144,136,0.3)" : "#9A9088",
                    cursor: propPage === totalPages ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ›
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* Property sheet */}
      <PropertySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        property={editProperty}
        onSaved={onSaved}
      />

      {/* Create proposal modal */}
      {proposalModalOpen && (
        <div
          onClick={() => setProposalModalOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1C1D27", border: `1px solid rgba(201,150,58,0.2)`,
              borderRadius: 16, padding: 28, width: "100%", maxWidth: 480,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 18, color: "#F5F0E8", margin: "0 0 6px" }}>
              Crear propuesta
            </h2>
            <p style={{ fontSize: 12, color: "#6B7280", fontFamily: "Inter, sans-serif", margin: "0 0 20px" }}>
              {selectedIds.size} {selectedIds.size === 1 ? "propiedad seleccionada" : "propiedades seleccionadas"}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#9A9088", marginBottom: 6, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Nombre del cliente (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: María García"
                  value={proposalForm.contactName}
                  onChange={(e) => setProposalForm((f) => ({ ...f, contactName: e.target.value }))}
                  style={{
                    width: "100%", background: "#0D0E12", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, padding: "9px 12px", color: "#F5F0E8", fontSize: 14,
                    fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#9A9088", marginBottom: 6, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Título (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Opciones en Piantini"
                  value={proposalForm.title}
                  onChange={(e) => setProposalForm((f) => ({ ...f, title: e.target.value }))}
                  style={{
                    width: "100%", background: "#0D0E12", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, padding: "9px 12px", color: "#F5F0E8", fontSize: 14,
                    fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#9A9088", marginBottom: 6, fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Mensaje de presentación (opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Hola, estas son las propiedades que seleccioné especialmente para ti…"
                  value={proposalForm.message}
                  onChange={(e) => setProposalForm((f) => ({ ...f, message: e.target.value }))}
                  style={{
                    width: "100%", background: "#0D0E12", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, padding: "9px 12px", color: "#F5F0E8", fontSize: 14,
                    fontFamily: "Inter, sans-serif", outline: "none", resize: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setProposalModalOpen(false)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 8, background: "#0D0E12",
                  border: "1px solid rgba(255,255,255,0.1)", color: "#9A9088",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateProposal}
                disabled={proposalCreatingSlug}
                style={{
                  flex: 2, padding: "10px 0", borderRadius: 8, background: GOLD,
                  border: "none", color: "#1A0E00",
                  fontSize: 13, fontWeight: 700, cursor: proposalCreatingSlug ? "not-allowed" : "pointer",
                  fontFamily: "Inter, sans-serif", opacity: proposalCreatingSlug ? 0.7 : 1,
                }}
              >
                {proposalCreatingSlug ? "Creando…" : "Generar link compartible"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share proposal modal */}
      {proposalShareSlug && (
        <div
          onClick={() => setProposalShareSlug(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1C1D27", border: `1px solid rgba(201,150,58,0.3)`,
              borderRadius: 16, padding: 28, width: "100%", maxWidth: 480,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            {/* Success checkmark */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 16, color: "#F5F0E8", margin: 0 }}>
                  ¡Propuesta lista!
                </p>
                <p style={{ fontSize: 12, color: "#6B7280", margin: 0, fontFamily: "Inter, sans-serif" }}>
                  Compártela con tu cliente
                </p>
              </div>
            </div>

            {/* URL display */}
            <div style={{
              background: "#0D0E12", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ flex: 1, fontSize: 12, color: "#9A9088", fontFamily: "Inter, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {typeof window !== "undefined" ? `${window.location.origin}/p/${proposalShareSlug}` : `/p/${proposalShareSlug}`}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/p/${proposalShareSlug}`);
                  toast.success("Link copiado");
                }}
                style={{
                  background: "rgba(201,150,58,0.1)", border: "1px solid rgba(201,150,58,0.2)",
                  borderRadius: 6, padding: "4px 10px", color: GOLD, fontSize: 11,
                  fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
                }}
              >
                Copiar
              </button>
            </div>

            {/* Share buttons */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/p/${proposalShareSlug}`;
                  const text = encodeURIComponent(`Te comparto una selección de propiedades:\n${url}`);
                  window.open(`https://wa.me/?text=${text}`, "_blank");
                }}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "9px 0", borderRadius: 8, background: "rgba(37,211,102,0.1)",
                  border: "1px solid rgba(37,211,102,0.2)", color: "#25D366",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                </svg>
                WhatsApp
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/p/${proposalShareSlug}`;
                  const subject = encodeURIComponent("Propuesta de propiedades");
                  const body = encodeURIComponent(`Te comparto una selección de propiedades:\n${url}`);
                  window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
                }}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "9px 0", borderRadius: 8, background: "rgba(124,159,232,0.1)",
                  border: "1px solid rgba(124,159,232,0.2)", color: "#7c9fe8",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                Correo
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  window.open(`/p/${proposalShareSlug}`, "_blank");
                }}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, background: "#0D0E12",
                  border: "1px solid rgba(255,255,255,0.1)", color: "#9A9088",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif",
                }}
              >
                Ver propuesta
              </button>
              <button
                onClick={() => { setProposalShareSlug(null); setSelectedIds(new Set()); }}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, background: GOLD,
                  border: "none", color: "#1A0E00",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif",
                }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
