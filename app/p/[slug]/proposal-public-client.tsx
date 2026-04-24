"use client";

import { useEffect, useRef, useState } from "react";
import type { ProposalData } from "./page";
import type { Property } from "@/lib/types";

const GOLD = "var(--primary)";
const BG = "var(--background)";
const CARD = "rgba(28,29,39,0.95)";
const SURFACE = "var(--foreground)";
const DIM = "var(--muted-foreground)";

function formatMoney(v: number | undefined, currency = "USD"): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${currency === "DOP" ? "RD$" : "$"}${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${currency === "DOP" ? "RD$" : "$"}${(v / 1_000).toFixed(0)}K`;
  return `${currency === "DOP" ? "RD$" : "$"}${v.toLocaleString()}`;
}

const TYPE_LABELS: Record<string, string> = {
  apartment: "Apartamento", penthouse: "Penthouse", villa: "Villa",
  house: "Casa", land: "Solar", commercial: "Local Comercial",
  apart_hotel: "Apart-Hotel", farm: "Finca",
};

function PropertyCard({
  property,
  proposalId,
  index,
}: {
  property: Property;
  proposalId: string;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tracked = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          fetch("/api/proposals/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              proposalId,
              propertyId: property.id,
              eventType: "property_view",
            }),
          }).catch(() => {});
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [proposalId, property.id]);

  const images = property.images ?? [];
  const [imgIdx, setImgIdx] = useState(0);

  return (
    <div
      ref={ref}
      style={{
        background: CARD,
        border: `1px solid rgba(201,150,58,0.15)`,
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
      }}
    >
      {/* Image */}
      <div style={{ position: "relative", height: 260, background: "#1a1b24" }}>
        {images.length > 0 ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[imgIdx]}
              alt={property.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {images.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  gap: 6,
                }}
              >
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
                    style={{
                      width: i === imgIdx ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: i === imgIdx ? GOLD : "rgba(255,255,255,0.4)",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      transition: "all 0.2s",
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.1)",
              fontSize: 48,
            }}
          >
            ⌂
          </div>
        )}
        {/* Photo count */}
        {images.length > 1 && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 20,
              fontFamily: "Inter, sans-serif",
            }}
          >
            {imgIdx + 1} / {images.length}
          </div>
        )}
        {/* Number badge */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: GOLD,
            color: "#1A0E00",
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {index + 1}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <p style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: SURFACE,
              margin: "0 0 4px",
              lineHeight: 1.3,
            }}>
              {property.title}
            </p>
            {(property.sector || property.city) && (
              <p style={{ fontSize: 13, color: DIM, margin: 0, fontFamily: "Inter, sans-serif" }}>
                📍 {[property.sector, property.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 800,
              fontSize: 22,
              color: GOLD,
              margin: 0,
              lineHeight: 1,
            }}>
              {formatMoney(property.price, property.currency)}
            </p>
            <p style={{ fontSize: 11, color: DIM, margin: "3px 0 0", fontFamily: "Inter, sans-serif" }}>
              {TYPE_LABELS[property.property_type] ?? property.property_type}
              {" · "}
              {property.transaction_type === "sale" ? "Venta" : "Alquiler"}
            </p>
          </div>
        </div>

        {/* Specs pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {property.bedrooms != null && (
            <Pill icon="🛏" label={`${property.bedrooms} hab.`} />
          )}
          {property.bathrooms != null && (
            <Pill icon="🚿" label={`${property.bathrooms} baños`} />
          )}
          {property.area_m2 != null && (
            <Pill icon="📐" label={`${property.area_m2} m²`} />
          )}
        </div>

        {property.description && (
          <p style={{
            marginTop: 14,
            fontSize: 13,
            color: DIM,
            fontFamily: "Inter, sans-serif",
            lineHeight: 1.6,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {property.description}
          </p>
        )}
      </div>
    </div>
  );
}

function Pill({ icon, label }: { icon: string; label: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "4px 10px",
      borderRadius: 20,
      background: "rgba(201,150,58,0.08)",
      border: "1px solid rgba(201,150,58,0.15)",
      fontSize: 12,
      color: SURFACE,
      fontFamily: "Inter, sans-serif",
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

export function ProposalPublicClient({ data }: { data: ProposalData }) {
  const { id: proposalId, agent, properties, title, message, contact_name } = data;
  const proposalUrl = typeof window !== "undefined" ? window.location.href : "";
  const [copied, setCopied] = useState(false);

  // Track page open on mount
  useEffect(() => {
    fetch("/api/proposals/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId, eventType: "open" }),
    }).catch(() => {});
  }, [proposalId]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareWhatsApp() {
    fetch("/api/proposals/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId, eventType: "whatsapp_click" }),
    }).catch(() => {});
    const text = encodeURIComponent(
      `Hola${contact_name ? ` ${contact_name}` : ""}, te comparto una selección de propiedades que preparé para ti:\n${window.location.href}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  function shareEmail() {
    fetch("/api/proposals/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId, eventType: "email_click" }),
    }).catch(() => {});
    const subject = encodeURIComponent(title ?? "Propuesta de propiedades - Advance Estate");
    const body = encodeURIComponent(
      `Hola${contact_name ? ` ${contact_name}` : ""},\n\nTe comparto una selección de propiedades que preparé para ti:\n${window.location.href}\n\nCualquier pregunta, estoy a tu disposición.\n\n${agent.full_name}\n${agent.phone ?? ""}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }

  function downloadPDF() {
    fetch("/api/proposals/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId, eventType: "pdf_download" }),
    }).catch(() => {});
    fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyIds: properties.map((p) => p.id) }),
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "propuesta-advance.pdf";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {});
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: SURFACE }}>

      {/* Header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(13,14,18,0.92)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "0 24px",
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: `linear-gradient(135deg, #E8B84B, ${GOLD})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{ fontFamily: "Cinzel, serif", fontWeight: 700, fontSize: 10, color: "#1A0E00" }}>AE</span>
          </div>
          <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 13, color: SURFACE }}>
            Advance Estate
          </span>
        </div>
        <span style={{ fontSize: 11, color: DIM, fontFamily: "Inter, sans-serif" }}>
          {properties.length} {properties.length === 1 ? "propiedad" : "propiedades"}
        </span>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>

        {/* Hero: greeting + agent card */}
        <div style={{
          background: "linear-gradient(110deg, rgba(28,29,39,0.98) 0%, rgba(22,20,14,0.98) 100%)",
          border: `1px solid rgba(201,150,58,0.2)`,
          borderRadius: 20,
          padding: "28px 28px 24px",
          marginBottom: 32,
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Gold glow */}
          <div style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 180,
            height: 180,
            background: "radial-gradient(circle, rgba(201,150,58,0.1) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          {contact_name && (
            <p style={{ fontSize: 13, color: DIM, fontFamily: "Inter, sans-serif", margin: "0 0 8px" }}>
              Preparado especialmente para
            </p>
          )}
          <h1 style={{
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            fontSize: 26,
            letterSpacing: "-0.03em",
            color: SURFACE,
            margin: "0 0 4px",
            lineHeight: 1.2,
          }}>
            {contact_name ? `Hola, ${contact_name}` : (title ?? "Tu selección de propiedades")}
          </h1>
          {title && contact_name && (
            <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 600, fontSize: 16, color: GOLD, margin: "0 0 16px" }}>
              {title}
            </p>
          )}

          {message && (
            <p style={{
              fontSize: 14,
              color: "#c4bfb8",
              fontFamily: "Inter, sans-serif",
              lineHeight: 1.65,
              margin: "16px 0 20px",
              borderLeft: `3px solid rgba(201,150,58,0.4)`,
              paddingLeft: 14,
            }}>
              {message}
            </p>
          )}

          {/* Agent info */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingTop: 20,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}>
            {agent.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agent.avatar_url}
                alt={agent.full_name}
                style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid rgba(201,150,58,0.3)` }}
              />
            ) : (
              <div style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: `linear-gradient(135deg, #E8B84B, ${GOLD})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Manrope, sans-serif",
                fontWeight: 800,
                fontSize: 16,
                color: "#1A0E00",
                flexShrink: 0,
              }}>
                {agent.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: 15, color: SURFACE, margin: 0 }}>
                {agent.full_name}
              </p>
              <p style={{ fontSize: 12, color: DIM, margin: "2px 0 0", fontFamily: "Inter, sans-serif" }}>
                Agente RE/MAX Advance
                {agent.phone && ` · ${agent.phone}`}
              </p>
            </div>
            {agent.phone && (
              <a
                href={`https://wa.me/${agent.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "rgba(37,211,102,0.1)",
                  border: "1px solid rgba(37,211,102,0.2)",
                  color: "#25D366",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                </svg>
                Contactar
              </a>
            )}
          </div>
        </div>

        {/* Share bar */}
        <div style={{
          display: "flex",
          gap: 8,
          marginBottom: 28,
          flexWrap: "wrap",
        }}>
          <ShareButton onClick={shareWhatsApp} color="#25D366" bg="rgba(37,211,102,0.08)" border="rgba(37,211,102,0.2)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
            </svg>
            WhatsApp
          </ShareButton>
          <ShareButton onClick={shareEmail} color="#7c9fe8" bg="rgba(124,159,232,0.08)" border="rgba(124,159,232,0.2)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Correo
          </ShareButton>
          <ShareButton onClick={copyLink} color={copied ? "#10b981" : DIM} bg={copied ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)"} border={copied ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.08)"}>
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            )}
            {copied ? "¡Copiado!" : "Copiar link"}
          </ShareButton>
          <ShareButton onClick={downloadPDF} color={GOLD} bg="rgba(201,150,58,0.08)" border="rgba(201,150,58,0.2)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Bajar PDF
          </ShareButton>
        </div>

        {/* Property cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {properties.map((p, i) => (
            <PropertyCard key={p.id} property={p} proposalId={proposalId} index={i} />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          textAlign: "center",
        }}>
          <p style={{ fontSize: 11, color: "rgba(154,144,136,0.5)", fontFamily: "Inter, sans-serif" }}>
            Preparado por {agent.full_name} · RE/MAX Advance · República Dominicana
          </p>
        </div>
      </div>
    </div>
  );
}

function ShareButton({
  children,
  onClick,
  color,
  bg,
  border,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        borderRadius: 8,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "Inter, sans-serif",
        cursor: "pointer",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
