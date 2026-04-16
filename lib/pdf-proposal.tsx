// lib/pdf-proposal.tsx
// Propuesta inmobiliaria PDF generada con @react-pdf/renderer
// Branding dinámico leído desde agency_config — configurable por tenant

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { Property } from "@/lib/types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AgencyConfig {
  agency_name: string;
  agency_tagline: string;
  agency_logo_url: string;
  agency_primary_color: string;
}

export interface AgentInfo {
  full_name?: string;
  email?: string;
  phone?: string;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

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

// ─── Estilos ──────────────────────────────────────────────────────────────────

function makeStyles(primaryColor: string) {
  return StyleSheet.create({
    // Cover
    cover: {
      flex: 1,
      backgroundColor: "#0f172a",
      alignItems: "center",
      justifyContent: "center",
      padding: 60,
    },
    coverBadge: {
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
      borderRadius: 99,
      paddingVertical: 5,
      paddingHorizontal: 18,
      marginBottom: 36,
    },
    coverBadgeText: {
      color: "rgba(255,255,255,0.45)",
      fontSize: 9,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    coverTitle: {
      fontSize: 44,
      fontWeight: "bold",
      color: "#ffffff",
      letterSpacing: -0.5,
      marginBottom: 6,
      textAlign: "center",
    },
    coverSubtitle: {
      fontSize: 14,
      color: "rgba(255,255,255,0.4)",
      marginBottom: 48,
    },
    coverDivider: {
      width: 48,
      height: 3,
      backgroundColor: primaryColor,
      borderRadius: 99,
      marginBottom: 48,
    },
    coverCountLabel: {
      fontSize: 10,
      color: "rgba(255,255,255,0.4)",
      textTransform: "uppercase",
      letterSpacing: 2,
      marginBottom: 6,
      textAlign: "center",
    },
    coverCountNum: {
      fontSize: 32,
      fontWeight: "bold",
      color: "#ffffff",
      textAlign: "center",
      marginBottom: 48,
    },
    coverCard: {
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
      borderRadius: 16,
      paddingVertical: 20,
      paddingHorizontal: 32,
      alignItems: "center",
      minWidth: 260,
    },
    coverCardLabel: {
      fontSize: 9,
      color: "rgba(255,255,255,0.35)",
      textTransform: "uppercase",
      letterSpacing: 2,
      marginBottom: 10,
    },
    coverAgentName: {
      fontSize: 16,
      fontWeight: "bold",
      color: "#ffffff",
      marginBottom: 3,
    },
    coverAgentDetail: {
      fontSize: 11,
      color: "rgba(255,255,255,0.45)",
      marginTop: 1,
    },

    // Properties page
    propsPage: {
      backgroundColor: "#f8fafc",
      padding: 40,
    },
    propsHeader: {
      marginBottom: 28,
      paddingBottom: 16,
      borderBottomWidth: 2,
      borderBottomColor: "#e2e8f0",
    },
    propsHeaderLabel: {
      fontSize: 9,
      textTransform: "uppercase",
      letterSpacing: 2,
      color: "#94a3b8",
      marginBottom: 3,
    },
    propsHeaderTitle: {
      fontSize: 22,
      fontWeight: "bold",
      color: "#0f172a",
    },

    // Property card
    card: {
      backgroundColor: "#ffffff",
      borderRadius: 12,
      padding: 22,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: "#e2e8f0",
    },
    cardImage: {
      width: "100%",
      height: 180,
      objectFit: "cover",
      borderRadius: 8,
      marginBottom: 14,
    },
    cardNoImage: {
      width: "100%",
      height: 180,
      backgroundColor: "#f1f5f9",
      borderRadius: 8,
      marginBottom: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    cardNoImageText: {
      color: "#94a3b8",
      fontSize: 11,
    },
    cardRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: "#0f172a",
      flex: 1,
      lineHeight: 1.3,
    },
    statusBadge: {
      borderRadius: 99,
      paddingVertical: 3,
      paddingHorizontal: 8,
      marginLeft: 10,
    },
    statusBadgeText: {
      fontSize: 9,
      fontWeight: "bold",
    },
    cardMeta: {
      fontSize: 11,
      color: "#64748b",
      marginBottom: 5,
    },
    cardSpecs: {
      fontSize: 11,
      color: "#475569",
      marginBottom: 8,
    },
    cardPrice: {
      fontSize: 20,
      fontWeight: "bold",
      color: "#059669",
      marginBottom: 8,
      fontFamily: "Courier",
    },
    cardDesc: {
      fontSize: 11,
      color: "#64748b",
      lineHeight: 1.6,
    },

    // Footer
    footer: {
      backgroundColor: "#0f172a",
      padding: 28,
      alignItems: "center",
    },
    footerText: {
      fontSize: 10,
      color: "rgba(255,255,255,0.3)",
      textAlign: "center",
      lineHeight: 1.8,
    },
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ProposalDocProps {
  properties: Property[];
  agent: AgentInfo;
  config: AgencyConfig;
}

export function ProposalDocument({ properties, agent, config }: ProposalDocProps) {
  const S = makeStyles(config.agency_primary_color || "#C9963A");

  return (
    <Document
      title={`Propuesta Inmobiliaria — ${config.agency_name}`}
      author={agent.full_name ?? config.agency_name}
      creator={config.agency_name}
    >
      {/* ── Portada ── */}
      <Page size="A4" style={S.cover}>
        <View style={S.coverBadge}>
          <Text style={S.coverBadgeText}>{config.agency_tagline}</Text>
        </View>

        {config.agency_logo_url ? (
          <Image src={config.agency_logo_url} style={{ width: 120, marginBottom: 16 }} />
        ) : (
          <Text style={S.coverTitle}>{config.agency_name}</Text>
        )}

        <Text style={S.coverSubtitle}>Propuesta Inmobiliaria</Text>
        <View style={S.coverDivider} />

        <Text style={S.coverCountLabel}>Selección de propiedades</Text>
        <Text style={S.coverCountNum}>
          {properties.length} propiedad{properties.length !== 1 ? "es" : ""}
        </Text>

        <View style={S.coverCard}>
          <Text style={S.coverCardLabel}>Su asesor</Text>
          <Text style={S.coverAgentName}>{agent.full_name ?? "Asesor"}</Text>
          {agent.phone ? <Text style={S.coverAgentDetail}>{agent.phone}</Text> : null}
          {agent.email ? <Text style={S.coverAgentDetail}>{agent.email}</Text> : null}
        </View>
      </Page>

      {/* ── Fichas de propiedades ── */}
      <Page size="A4" style={S.propsPage}>
        <View style={S.propsHeader}>
          <Text style={S.propsHeaderLabel}>Propiedades seleccionadas</Text>
          <Text style={S.propsHeaderTitle}>Fichas de propiedades</Text>
        </View>

        {properties.map((p) => {
          const location = [p.location_sector, p.location_city].filter(Boolean).join(", ");
          const specs = [
            p.bedrooms != null ? `${p.bedrooms} hab.` : null,
            p.bathrooms != null ? `${p.bathrooms} baños` : null,
            p.area_m2 != null ? `${p.area_m2} m²` : null,
          ]
            .filter(Boolean)
            .join("  ·  ");

          const isActive = p.status === "active";

          return (
            <View key={p.id} style={S.card} wrap={false}>
              {/* Imagen */}
              {p.images && p.images.length > 0 ? (
                <Image src={p.images[0]} style={S.cardImage} />
              ) : (
                <View style={S.cardNoImage}>
                  <Text style={S.cardNoImageText}>Sin foto</Text>
                </View>
              )}

              {/* Título + badge */}
              <View style={S.cardRow}>
                <Text style={S.cardTitle}>{p.title}</Text>
                <View
                  style={[
                    S.statusBadge,
                    { backgroundColor: isActive ? "#dcfce7" : "#f1f5f9" },
                  ]}
                >
                  <Text
                    style={[
                      S.statusBadgeText,
                      { color: isActive ? "#16a34a" : "#64748b" },
                    ]}
                  >
                    {STATUS_LABELS[p.status] ?? p.status}
                  </Text>
                </View>
              </View>

              {/* Meta */}
              <Text style={S.cardMeta}>
                {TYPE_LABELS[p.property_type] ?? p.property_type}
                {"  ·  "}
                {p.transaction_type === "sale" ? "Venta" : "Alquiler"}
                {location ? `  ·  ${location}` : ""}
              </Text>

              {specs ? <Text style={S.cardSpecs}>{specs}</Text> : null}

              {p.price != null ? (
                <Text style={S.cardPrice}>
                  ${p.price.toLocaleString()} {p.currency ?? "USD"}
                </Text>
              ) : null}

              {p.description ? (
                <Text style={S.cardDesc}>{p.description}</Text>
              ) : null}
            </View>
          );
        })}
      </Page>

      {/* ── Footer page ── */}
      <Page size="A4" style={S.footer}>
        <Text style={S.footerText}>
          {config.agency_name}
          {config.agency_tagline ? ` · ${config.agency_tagline}` : ""}
          {"\n"}
          Esta propuesta es válida por 30 días y está sujeta a disponibilidad.{"\n"}
          Los precios pueden variar sin previo aviso.
        </Text>
      </Page>
    </Document>
  );
}
