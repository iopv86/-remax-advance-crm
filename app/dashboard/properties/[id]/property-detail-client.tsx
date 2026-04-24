"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, Bed, Bath, Square, Car, Home, Calendar, Tag, MessageSquare, FileText, Building2 } from "lucide-react";
import type { PropertyType, CurrencyType } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/types";
import { PropertyUnitsTab } from "./property-units-tab";
import { LoanCalculator } from "@/components/loan-calculator";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropertyDetail {
  id: string;
  agent_id: string;
  title: string;
  description?: string;
  property_type: PropertyType;
  transaction_type: "sale" | "rent";
  price?: number;
  price_max?: number;
  currency?: CurrencyType;
  city?: string;
  sector?: string;
  province?: string;
  address?: string;
  bedrooms?: number;
  bathrooms?: number;
  area_m2?: number;
  lot_area_m2?: number;
  parking_spots?: number;
  floor_number?: number;
  total_floors?: number;
  year_built?: number;
  price_per_m2?: number;
  amenities?: string[];
  features?: string[];
  images?: string[];
  video_url?: string;
  virtual_tour_url?: string;
  mls_number?: string;
  external_url?: string;
  status: "active" | "reserved" | "sold" | "rented" | "inactive";
  is_project?: boolean;
  is_exclusive?: boolean;
  is_featured?: boolean;
  created_at: string;
  updated_at?: string;
  agent?: {
    id: string;
    full_name: string;
    email: string;
    phone?: string;
    avatar_url?: string;
  };
}

interface DealEntry {
  id: string;
  stage: string;
  deal_value?: number;
  currency?: string;
  priority?: string;
  created_at: string;
  contact?: {
    id: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = "#C9963A";
const BG_BODY = "#0D0E12";
const BG_SURFACE = "#181820";
const BG_ELEVATED = "#1C1D27";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED = "#9899A8";
const BORDER_GOLD = "rgba(201,150,58,0.15)";
const BORDER_DIM = "rgba(255,255,255,0.06)";

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

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Disponible", color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  reserved: { label: "Reservado", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  sold: { label: "Vendido", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  rented: { label: "Rentado", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  inactive: { label: "Inactivo", color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
};

const PRIORITY_MAP: Record<string, { color: string }> = {
  urgent: { color: "#ef4444" },
  high: { color: "#F59E0B" },
  medium: { color: "#6366f1" },
  low: { color: "#6B7280" },
};

function formatPrice(price: number, currency?: string): string {
  const cur = currency ?? "USD";
  if (price >= 1_000_000) return `${cur} ${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 2)}M`;
  return `${cur} ${price.toLocaleString()}`;
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[\s\-\+\(\)]/g, "");
}

// ─── Image Carousel ───────────────────────────────────────────────────────────

function ImageCarousel({ images, title }: { images: string[]; title: string }) {
  const [idx, setIdx] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div
        style={{
          height: 420,
          background: BG_SURFACE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          border: `1px solid ${BORDER_DIM}`,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke={BORDER_GOLD} strokeWidth={1} style={{ width: 56, height: 56, opacity: 0.4 }}>
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[idx]}
        alt={`${title} — ${idx + 1}`}
        style={{ width: "100%", height: 420, objectFit: "cover", display: "block" }}
      />

      {images.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            style={{
              position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
              background: "rgba(13,14,18,0.7)", border: `1px solid ${BORDER_GOLD}`,
              borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: idx === 0 ? "default" : "pointer",
              opacity: idx === 0 ? 0.3 : 1, color: TEXT_PRIMARY,
            }}
          >
            <ChevronLeft style={{ width: 18, height: 18 }} />
          </button>
          <button
            onClick={() => setIdx((i) => Math.min(images.length - 1, i + 1))}
            disabled={idx === images.length - 1}
            style={{
              position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
              background: "rgba(13,14,18,0.7)", border: `1px solid ${BORDER_GOLD}`,
              borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: idx === images.length - 1 ? "default" : "pointer",
              opacity: idx === images.length - 1 ? 0.3 : 1, color: TEXT_PRIMARY,
            }}
          >
            <ChevronRight style={{ width: 18, height: 18 }} />
          </button>
          <div
            style={{
              position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
              display: "flex", gap: 6,
            }}
          >
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                style={{
                  width: i === idx ? 20 : 6, height: 6, borderRadius: 3, border: "none",
                  background: i === idx ? GOLD : "rgba(255,255,255,0.35)",
                  cursor: "pointer", transition: "all 0.2s",
                  padding: 0,
                }}
              />
            ))}
          </div>
          <div
            style={{
              position: "absolute", top: 16, right: 16,
              background: "rgba(13,14,18,0.7)", border: `1px solid ${BORDER_GOLD}`,
              borderRadius: 6, padding: "3px 10px", fontSize: 12, color: TEXT_MUTED,
            }}
          >
            {idx + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Spec item ────────────────────────────────────────────────────────────────

function Spec({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 4,
        padding: "14px 16px", background: BG_ELEVATED,
        border: `1px solid ${BORDER_DIM}`, borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: TEXT_MUTED, fontSize: 12 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY }}>{value}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type DetailTab = "info" | "unidades";

export function PropertyDetailClient({
  property,
  deals,
  canEdit,
  initialTab,
}: {
  property: PropertyDetail;
  deals: DealEntry[];
  canEdit: boolean;
  initialTab?: DetailTab;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab ?? "info");
  const status = STATUS_MAP[property.status] ?? STATUS_MAP.inactive;

  return (
    <div style={{ minHeight: "100vh", background: BG_BODY }}>
      {/* Sticky header */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 40,
          background: "rgba(13,14,18,0.85)", backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 32px", height: 72,
          borderBottom: `1px solid ${BORDER_DIM}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: `1px solid ${BORDER_DIM}`, borderRadius: 8,
              padding: "6px 12px", color: TEXT_MUTED, fontSize: 13, cursor: "pointer",
            }}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} />
            Propiedades
          </button>
          <div style={{ width: 1, height: 20, background: BORDER_DIM }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: TEXT_PRIMARY, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {property.title}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: status.bg, color: status.color,
            }}
          >
            {status.label}
          </span>
          {property.external_url && (
            <a
              href={property.external_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", background: BG_ELEVATED, color: TEXT_MUTED,
                fontSize: 13, borderRadius: 8, border: `1px solid ${BORDER_DIM}`,
                textDecoration: "none",
              }}
            >
              <ExternalLink style={{ width: 13, height: 13 }} />
              Ver portal
            </a>
          )}
          {canEdit && (
            <Link
              href={`/dashboard/properties?edit=${property.id}`}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", background: GOLD, color: BG_BODY,
                fontSize: 13, fontWeight: 600, borderRadius: 8, textDecoration: "none",
              }}
            >
              Editar
            </Link>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 64px" }}>

        {/* ── Tab bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 28,
            borderBottom: `1px solid ${BORDER_DIM}`,
            paddingBottom: 0,
          }}
        >
          {(
            [
              { id: "info" as DetailTab, label: "Información", icon: <Home style={{ width: 13, height: 13 }} />, show: true },
              { id: "unidades" as DetailTab, label: "Unidades", icon: <Building2 style={{ width: 13, height: 13 }} />, show: !!property.is_project },
            ] as { id: DetailTab; label: string; icon: React.ReactNode; show: boolean }[]
          ).filter((tab) => tab.show).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? TEXT_PRIMARY : TEXT_MUTED,
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? `2px solid ${GOLD}` : "2px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Unidades tab ── */}
        {activeTab === "unidades" && (
          <PropertyUnitsTab propertyId={property.id} canEdit={canEdit} />
        )}

        {/* ── Info tab ── */}
        {activeTab === "info" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 32, alignItems: "start" }}>
          {/* ── Left column ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {/* Image carousel */}
            <ImageCarousel images={property.images ?? []} title={property.title} />

            {/* Title + price */}
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 8px",
                        borderRadius: 4, background: "rgba(201,150,58,0.12)",
                        color: GOLD, letterSpacing: "0.04em",
                      }}
                    >
                      {TYPE_LABELS[property.property_type] ?? property.property_type}
                    </span>
                    <span
                      style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 8px",
                        borderRadius: 4, background: BORDER_DIM, color: TEXT_MUTED,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {property.transaction_type === "sale" ? "VENTA" : "ALQUILER"}
                    </span>
                    {property.mls_number && (
                      <span style={{ fontSize: 11, color: TEXT_MUTED }}>MLS# {property.mls_number}</span>
                    )}
                  </div>
                  <h1
                    style={{
                      fontFamily: "Manrope, sans-serif", fontSize: 26, fontWeight: 700,
                      color: TEXT_PRIMARY, margin: 0, lineHeight: 1.2,
                    }}
                  >
                    {property.title}
                  </h1>
                  {(property.city || property.sector || property.province) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, color: TEXT_MUTED, fontSize: 13 }}>
                      <MapPin style={{ width: 13, height: 13 }} />
                      {[property.sector, property.city, property.province].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
                {property.price && (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {property.is_project && property.price_max ? (
                      <>
                        <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 2 }}>Rango de precios</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: GOLD, fontFamily: "Manrope, sans-serif" }}>
                          {formatPrice(property.price, property.currency)}
                        </div>
                        <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>
                          hasta {formatPrice(property.price_max, property.currency)}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 28, fontWeight: 700, color: GOLD, fontFamily: "Manrope, sans-serif" }}>
                        {formatPrice(property.price, property.currency)}
                      </div>
                    )}
                    {property.price_per_m2 && !property.is_project && (
                      <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>
                        {formatPrice(property.price_per_m2, property.currency)}/m²
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Specs grid */}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 14px" }}>
                Características
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                {property.bedrooms != null && (
                  <Spec icon={<Bed style={{ width: 12, height: 12 }} />} label="Dormitorios" value={property.bedrooms} />
                )}
                {property.bathrooms != null && (
                  <Spec icon={<Bath style={{ width: 12, height: 12 }} />} label="Baños" value={property.bathrooms} />
                )}
                {property.area_m2 != null && (
                  <Spec icon={<Square style={{ width: 12, height: 12 }} />} label="Área" value={`${property.area_m2} m²`} />
                )}
                {property.lot_area_m2 != null && (
                  <Spec icon={<Square style={{ width: 12, height: 12 }} />} label="Solar" value={`${property.lot_area_m2} m²`} />
                )}
                {property.parking_spots != null && (
                  <Spec icon={<Car style={{ width: 12, height: 12 }} />} label="Parqueos" value={property.parking_spots} />
                )}
                {property.floor_number != null && (
                  <Spec icon={<Home style={{ width: 12, height: 12 }} />} label="Piso" value={`${property.floor_number}${property.total_floors ? ` / ${property.total_floors}` : ""}`} />
                )}
                {property.year_built != null && (
                  <Spec icon={<Calendar style={{ width: 12, height: 12 }} />} label="Año" value={property.year_built} />
                )}
              </div>
            </div>

            {/* Description */}
            {property.description && (
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 14px" }}>
                  Descripción
                </h2>
                <p style={{ fontSize: 14, color: TEXT_MUTED, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
                  {property.description}
                </p>
              </div>
            )}

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 14px" }}>
                  Amenidades
                </h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {property.amenities.map((a) => (
                    <span
                      key={a}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                        background: BG_ELEVATED, color: TEXT_MUTED, border: `1px solid ${BORDER_DIM}`,
                      }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Features */}
            {property.features && property.features.length > 0 && (
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 14px" }}>
                  Características adicionales
                </h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {property.features.map((f) => (
                    <span
                      key={f}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                        background: "rgba(201,150,58,0.07)", color: GOLD, border: `1px solid rgba(201,150,58,0.15)`,
                      }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Address */}
            {property.address && (
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>
                  Dirección
                </h2>
                <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>{property.address}</p>
              </div>
            )}

            {/* External links */}
            {(property.video_url || property.virtual_tour_url) && (
              <div style={{ display: "flex", gap: 10 }}>
                {property.video_url && (
                  <a
                    href={property.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 16px", background: BG_ELEVATED, color: TEXT_MUTED,
                      fontSize: 13, borderRadius: 8, border: `1px solid ${BORDER_DIM}`,
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink style={{ width: 13, height: 13 }} />
                    Video
                  </a>
                )}
                {property.virtual_tour_url && (
                  <a
                    href={property.virtual_tour_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 16px", background: BG_ELEVATED, color: TEXT_MUTED,
                      fontSize: 13, borderRadius: 8, border: `1px solid ${BORDER_DIM}`,
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink style={{ width: 13, height: 13 }} />
                    Tour virtual
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ── Right column ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Agent card */}
            {property.agent && (
              <div
                style={{
                  background: BG_ELEVATED,
                  border: `1px solid ${BORDER_GOLD}`,
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
                  Agente responsable
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  {property.agent.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={property.agent.avatar_url}
                      alt={property.agent.full_name}
                      style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: "rgba(201,150,58,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, fontWeight: 700, color: GOLD,
                      }}
                    >
                      {property.agent.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY }}>{property.agent.full_name}</div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{property.agent.email}</div>
                  </div>
                </div>
                {property.agent.phone && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <a
                      href={`tel:${property.agent.phone}`}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "8px 0", background: BG_SURFACE, color: TEXT_MUTED,
                        fontSize: 13, borderRadius: 8, border: `1px solid ${BORDER_DIM}`,
                        textDecoration: "none",
                      }}
                    >
                      Llamar
                    </a>
                    <a
                      href={`https://wa.me/${sanitizePhone(property.agent.phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "8px 0", background: "rgba(37,211,102,0.1)", color: "#25D366",
                        fontSize: 13, borderRadius: 8, border: "1px solid rgba(37,211,102,0.2)",
                        textDecoration: "none",
                      }}
                    >
                      <MessageSquare style={{ width: 13, height: 13 }} />
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Loan calculator */}
            <LoanCalculator initialPrice={property.price} currency={property.currency} />

            {/* Quick actions */}
            <div
              style={{
                background: BG_ELEVATED,
                border: `1px solid ${BORDER_DIM}`,
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
                Acciones rápidas
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link
                  href={`/dashboard/proposals/new?propertyId=${property.id}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", background: "rgba(201,150,58,0.1)", color: GOLD,
                    fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid rgba(201,150,58,0.2)`,
                    textDecoration: "none",
                  }}
                >
                  <FileText style={{ width: 14, height: 14 }} />
                  Crear propuesta
                </Link>
                <Link
                  href={`/dashboard/pipeline/new?propertyId=${property.id}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", background: BG_SURFACE, color: TEXT_MUTED,
                    fontSize: 13, fontWeight: 500, borderRadius: 8, border: `1px solid ${BORDER_DIM}`,
                    textDecoration: "none",
                  }}
                >
                  <Tag style={{ width: 14, height: 14 }} />
                  Nuevo deal
                </Link>
              </div>
            </div>

            {/* Linked deals */}
            {deals.length > 0 && (
              <div
                style={{
                  background: BG_ELEVATED,
                  border: `1px solid ${BORDER_DIM}`,
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
                  Deals vinculados ({deals.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {deals.map((deal) => {
                    const priorityColor = deal.priority ? PRIORITY_MAP[deal.priority]?.color : TEXT_MUTED;
                    const contactName = deal.contact
                      ? [deal.contact.first_name, deal.contact.last_name].filter(Boolean).join(" ") || "Sin nombre"
                      : "Sin contacto";
                    return (
                      <Link
                        key={deal.id}
                        href={`/dashboard/pipeline/${deal.id}`}
                        style={{
                          display: "block", padding: "12px 14px",
                          background: BG_SURFACE, borderRadius: 10,
                          border: `1px solid ${BORDER_DIM}`, textDecoration: "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY }}>{contactName}</span>
                          {deal.priority && (
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: priorityColor, flexShrink: 0 }} />
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: TEXT_MUTED }}>
                          {STAGE_LABELS[deal.stage as keyof typeof STAGE_LABELS] ?? deal.stage}
                          {deal.deal_value && ` · ${formatPrice(deal.deal_value, deal.currency)}`}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Meta */}
            <div
              style={{
                background: BG_ELEVATED,
                border: `1px solid ${BORDER_DIM}`,
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
                Información
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: TEXT_MUTED }}>Creado</span>
                  <span style={{ fontSize: 12, color: TEXT_PRIMARY }}>{new Date(property.created_at).toLocaleDateString("es-DO")}</span>
                </div>
                {property.updated_at && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: TEXT_MUTED }}>Actualizado</span>
                    <span style={{ fontSize: 12, color: TEXT_PRIMARY }}>{new Date(property.updated_at).toLocaleDateString("es-DO")}</span>
                  </div>
                )}
                {property.mls_number && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: TEXT_MUTED }}>MLS#</span>
                    <span style={{ fontSize: 12, color: TEXT_PRIMARY }}>{property.mls_number}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )} {/* end activeTab === "info" */}
      </div>
    </div>
  );
}

