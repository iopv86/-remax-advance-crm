"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { ContactSheet } from "@/components/contact-sheet";
import { Pagination } from "@/components/pagination";
import type { Contact } from "@/lib/types";

// ── Design tokens (Obsidian Edge) ────────────────────────────────────────────
const T = {
  surface: "#131313",
  surfaceContainerLow: "#1c1b1b",
  surfaceContainerHigh: "#2a2a2a",
  surfaceContainerHighest: "#353534",
  outlineVariant: "#4f4537",
  onSurface: "#e5e2e1",
  onSurfaceVariant: "#d3c4b1",
  primary: "#f5bd5d",
  primaryContainer: "#c9963a",
} as const;

// ── Label maps ────────────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  ctwa_ad: "CTWA Ad",
  lead_form: "Formulario",
  referral: "Referido",
  walk_in: "Walk-in",
  website: "Web",
  social_media: "Redes",
  other: "Otro",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

const PROPERTY_LABELS: Record<string, string> = {
  apartment: "Apartamentos",
  penthouse: "Penthouses",
  villa: "Villas",
  house: "Casas",
  land: "Terrenos",
  commercial: "Comercial",
  apart_hotel: "Apart-hotel",
  farm: "Fincas",
};

// ── Avatar color palette (deterministic from initials) ────────────────────────
const AVATAR_PALETTES = [
  { bg: "rgba(245,189,93,0.18)", color: "#f5bd5d" },   // gold
  { bg: "rgba(59,130,246,0.18)", color: "#60a5fa" },   // blue
  { bg: "rgba(52,211,153,0.18)", color: "#34d399" },   // emerald
  { bg: "rgba(201,150,58,0.18)", color: "#c9963a" },   // amber-gold
  { bg: "rgba(148,163,184,0.18)", color: "#94a3b8" },  // slate
];

function avatarPalette(initials: string) {
  const code = (initials.charCodeAt(0) ?? 0) + (initials.charCodeAt(1) ?? 0);
  return AVATAR_PALETTES[code % AVATAR_PALETTES.length];
}

// ── Status badge config ───────────────────────────────────────────────────────
function getStatusBadge(classification?: string) {
  switch (classification) {
    case "hot":
      return {
        label: "Lead Caliente",
        bg: "rgba(245,189,93,0.10)",
        color: T.primary,
        border: `rgba(245,189,93,0.20)`,
      };
    case "warm":
      return {
        label: "En Seguimiento",
        bg: T.surfaceContainerHighest,
        color: T.onSurfaceVariant,
        border: `rgba(79,69,55,0.20)`,
      };
    case "cold":
      return {
        label: "Frío",
        bg: T.surfaceContainerHighest,
        color: T.onSurfaceVariant,
        border: `rgba(79,69,55,0.20)`,
      };
    default:
      return {
        label: "Sin clasificar",
        bg: "rgba(52,211,153,0.10)",
        color: "#34d399",
        border: "rgba(52,211,153,0.20)",
      };
  }
}

// ── Agent initials avatar (fallback when no photo) ────────────────────────────
function AgentAvatar({ agent }: { agent?: Contact["agent"] }) {
  if (!agent) {
    return (
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: T.surfaceContainerHighest,
          border: `2px solid ${T.surface}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: T.onSurfaceVariant,
          flexShrink: 0,
        }}
      >
        ?
      </div>
    );
  }
  const initials = agent.full_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const { bg, color } = avatarPalette(initials);
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: bg,
        border: `2px solid ${T.surface}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
        color,
        flexShrink: 0,
      }}
      title={agent.full_name}
    >
      {initials}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  basePath: string;
  filterParams?: Record<string, string>;
}

interface Props {
  contacts: Contact[];
  pagination?: PaginationProps;
}

export function ContactsTable({ contacts: initial, pagination }: Props) {
  const router = useRouter();
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  function openEdit(c: Contact, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setEditContact(c);
    setSheetOpen(true);
  }

  async function handleDelete(c: Contact, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "este contacto";
    if (!confirm(`¿Eliminar a ${name}? Esta acción no se puede deshacer.`)) return;
    setDeletingId(c.id);
    const supabase = createClient();
    const { error } = await supabase.from("contacts").delete().eq("id", c.id);
    setDeletingId(null);
    if (error) {
      toast.error("Error al eliminar: " + error.message);
      return;
    }
    toast.success("Contacto eliminado");
    router.refresh();
  }

  function handleSaved() {
    setSheetOpen(false);
    setEditContact(null);
    router.refresh();
  }

  return (
    <>
      {/* ── Mobile card list (< md) ─────────────────────────────────────── */}
      <div
        className="block md:hidden"
        style={{
          background: T.surface,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          border: `1px solid rgba(79,69,55,0.08)`,
        }}
      >
        {initial.length === 0 ? (
          <p style={{ padding: "48px 24px", textAlign: "center", color: T.onSurfaceVariant, fontSize: 14 }}>
            No se encontraron contactos.
          </p>
        ) : (
          initial.map((c) => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Sin nombre";
            const initials = [c.first_name?.[0], c.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
            const { bg: avBg, color: avColor } = avatarPalette(initials);
            const badge = getStatusBadge(c.lead_classification);
            const lastContact = formatDistanceToNow(
              new Date(c.last_activity_at ?? c.created_at),
              { addSuffix: true, locale: es }
            );
            return (
              <Link
                key={c.id}
                href={`/dashboard/contacts/${c.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  textDecoration: "none",
                  borderTop: `1px solid rgba(79,69,55,0.08)`,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: avBg, color: avColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: T.onSurface, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </p>
                    <span style={{
                      flexShrink: 0, display: "inline-block",
                      padding: "2px 6px", borderRadius: 4,
                      fontSize: 9, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                      background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                    }}>
                      {badge.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: T.onSurfaceVariant, margin: 0 }} suppressHydrationWarning>
                    {c.phone ?? "—"} · {lastContact}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* ── Desktop table (md+) ─────────────────────────────────────────── */}
      <div
        className="hidden md:block"
        style={{
          background: T.surface,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          border: `1px solid rgba(79,69,55,0.08)`,
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              textAlign: "left",
              borderCollapse: "collapse",
            }}
          >
            {/* Head */}
            <thead>
              <tr style={{ background: T.surfaceContainerLow }}>
                {[
                  { label: "Nombre", align: "left" },
                  { label: "Teléfono", align: "left" },
                  { label: "Estado", align: "left" },
                  { label: "Interés", align: "left" },
                  { label: "Agente", align: "left" },
                  { label: "Último Contacto", align: "center" },
                  { label: "Acciones", align: "right" },
                ].map(({ label, align }) => (
                  <th
                    key={label}
                    style={{
                      padding: "16px 24px",
                      fontFamily: "Manrope, var(--font-manrope), sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color: T.onSurfaceVariant,
                      textAlign: align as "left" | "center" | "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {initial.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "48px 24px",
                      textAlign: "center",
                      color: T.onSurfaceVariant,
                      fontSize: 14,
                    }}
                  >
                    No se encontraron contactos.
                  </td>
                </tr>
              )}

              {initial.map((c) => {
                const name =
                  [c.first_name, c.last_name].filter(Boolean).join(" ") || "Sin nombre";
                const initials =
                  [c.first_name?.[0], c.last_name?.[0]]
                    .filter(Boolean)
                    .join("")
                    .toUpperCase() || "?";
                const { bg: avBg, color: avColor } = avatarPalette(initials);
                const badge = getStatusBadge(c.lead_classification);

                // Interest text
                const interestParts: string[] = [];
                if (c.property_type_interest) {
                  interestParts.push(
                    PROPERTY_LABELS[c.property_type_interest] ?? c.property_type_interest
                  );
                }
                if (c.preferred_locations && c.preferred_locations.length > 0) {
                  interestParts.push(c.preferred_locations[0]);
                }
                const interest = interestParts.join(" · ") || "—";

                const lastContact = formatDistanceToNow(
                  new Date(c.last_activity_at ?? c.created_at),
                  { addSuffix: true, locale: es }
                );

                const isHovered = hoveredId === c.id;

                return (
                  <tr
                    key={c.id}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      borderTop: `1px solid rgba(79,69,55,0.08)`,
                      background: isHovered ? T.surfaceContainerHigh : "transparent",
                      borderLeft: isHovered
                        ? `3px solid ${T.primaryContainer}`
                        : "3px solid transparent",
                      transition: "background 150ms ease, border-left-color 150ms ease",
                      cursor: "default",
                    }}
                  >
                    {/* Nombre */}
                    <td style={{ padding: "16px 24px" }}>
                      <Link
                        href={`/dashboard/contacts/${c.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          textDecoration: "none",
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: avBg,
                            color: avColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <p
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: T.onSurface,
                              margin: 0,
                            }}
                          >
                            {name}
                          </p>
                          {c.email && (
                            <p
                              style={{
                                fontSize: 11,
                                color: T.onSurfaceVariant,
                                margin: 0,
                                marginTop: 1,
                              }}
                            >
                              {c.email}
                            </p>
                          )}
                        </div>
                      </Link>
                    </td>

                    {/* Teléfono */}
                    <td
                      style={{
                        padding: "16px 24px",
                        fontSize: 14,
                        fontFamily: "Manrope, var(--font-manrope), sans-serif",
                        color: T.onSurface,
                      }}
                    >
                      {c.phone ?? "—"}
                    </td>

                    {/* Estado */}
                    <td style={{ padding: "16px 24px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Interés */}
                    <td style={{ padding: "16px 24px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          color: T.onSurfaceVariant,
                          background: T.surfaceContainerHighest,
                          padding: "4px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {interest}
                      </span>
                      {(c.budget_min || c.budget_max) && (
                        <p
                          style={{
                            fontSize: 10,
                            color: T.onSurfaceVariant,
                            margin: "4px 0 0",
                          }}
                        >
                          {c.budget_currency ?? "USD"}{" "}
                          {c.budget_min ? c.budget_min.toLocaleString() : ""}
                          {c.budget_min && c.budget_max ? " – " : ""}
                          {c.budget_max ? c.budget_max.toLocaleString() : ""}
                        </p>
                      )}
                    </td>

                    {/* Agente */}
                    <td style={{ padding: "16px 24px" }}>
                      <AgentAvatar agent={c.agent} />
                    </td>

                    {/* Último Contacto */}
                    <td style={{ padding: "16px 24px", textAlign: "center" }}>
                      <p
                        style={{
                          fontSize: 14,
                          fontFamily: "Manrope, var(--font-manrope), sans-serif",
                          color: T.onSurface,
                          margin: 0,
                        }}
                        suppressHydrationWarning
                      >
                        {lastContact}
                      </p>
                    </td>

                    {/* Acciones */}
                    <td style={{ padding: "16px 24px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 12,
                          opacity: isHovered ? 1 : 0.35,
                          transition: "opacity 150ms ease",
                        }}
                      >
                        {/* WhatsApp */}
                        {c.phone && (
                          <a
                            href={`https://wa.me/${c.phone.replace(/[\s\-+().]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="WhatsApp"
                            style={{ color: "#22c55e", display: "flex", lineHeight: 1 }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                          </a>
                        )}
                        {/* Editar */}
                        <button
                          onClick={(e) => openEdit(c, e)}
                          title="Editar"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: T.onSurfaceVariant,
                            padding: 0,
                            display: "flex",
                            lineHeight: 1,
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {/* Eliminar */}
                        <button
                          onClick={(e) => handleDelete(c, e)}
                          title="Eliminar"
                          disabled={deletingId === c.id}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: deletingId === c.id ? "default" : "pointer",
                            color: T.onSurfaceVariant,
                            padding: 0,
                            display: "flex",
                            lineHeight: 1,
                            opacity: deletingId === c.id ? 0.4 : 1,
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination — shown below both mobile/desktop views */}
      {pagination && (
        <div style={{ padding: "4px 8px 8px", borderTop: `1px solid rgba(79,69,55,0.10)` }}>
          <Pagination
            currentPage={pagination.currentPage}
            totalCount={pagination.totalCount}
            pageSize={pagination.pageSize}
            basePath={pagination.basePath}
            filterParams={pagination.filterParams}
          />
        </div>
      )}

      <ContactSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        contact={editContact}
        onSaved={handleSaved}
      />
    </>
  );
}
