"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, MessageCircle, MoreVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { ContactSheet } from "@/components/contact-sheet";
import type { Contact } from "@/lib/types";

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

// Color-coded avatar backgrounds based on classification
function getAvatarStyle(classification?: string) {
  switch (classification) {
    case "hot":
      return { bg: "#fee2e2", color: "#dc2626" };
    case "warm":
      return { bg: "#ffedd5", color: "#ea580c" };
    case "cold":
      return { bg: "#dbeafe", color: "#2563eb" };
    default:
      return { bg: "#f1f5f9", color: "#475569" };
  }
}

function getStatusStyle(classification?: string) {
  switch (classification) {
    case "hot":
      return { dot: "#10b981", bg: "#ecfdf5", color: "#059669", label: "🔥 Lead Caliente" };
    case "warm":
      return { dot: "#f97316", bg: "#fff7ed", color: "#ea580c", label: "Warm Lead" };
    case "cold":
      return { dot: "#3b82f6", bg: "#eff6ff", color: "#2563eb", label: "Lead Frío" };
    default:
      return { dot: "#94a3b8", bg: "#f8fafc", color: "#64748b", label: "Nuevo" };
  }
}

interface Props {
  contacts: Contact[];
}

export function ContactsTable({ contacts: initial }: Props) {
  const router = useRouter();
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      <div
        className="overflow-hidden"
        style={{
          background: "var(--card)",
          borderRadius: 16,
          boxShadow: "0 4px 24px -12px rgba(0,0,0,0.05)",
        }}
      >
        <table className="w-full text-left border-collapse">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                Contacto
              </th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                Origen
              </th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                Estado
              </th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                Interés
              </th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                Actividad
              </th>
              <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody style={{ borderTop: "1px solid var(--border)" }}>
            {initial.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-sm text-slate-400"
                >
                  No se encontraron contactos.
                </td>
              </tr>
            )}
            {initial.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Sin nombre";
              const initials =
                [c.first_name?.[0], c.last_name?.[0]]
                  .filter(Boolean)
                  .join("")
                  .toUpperCase() || "?";
              const avatarStyle = getAvatarStyle(c.lead_classification);
              const statusStyle = getStatusStyle(c.lead_classification);

              // Build "Interés" string from property_type_interest + preferred_locations
              const interestParts: string[] = [];
              if (c.property_type_interest) {
                interestParts.push(PROPERTY_LABELS[c.property_type_interest] ?? c.property_type_interest);
              }
              if (c.preferred_locations && c.preferred_locations.length > 0) {
                interestParts.push(c.preferred_locations[0]);
              }
              const interest = interestParts.join(" · ") || "—";

              return (
                <tr
                  key={c.id}
                  className="group transition-colors"
                  style={{ borderTop: "1px solid var(--border)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--muted)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {/* Contacto */}
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/contacts/${c.id}`}
                      className="flex items-center gap-3"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                        style={{
                          background: avatarStyle.bg,
                          color: avatarStyle.color,
                        }}
                      >
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{name}</p>
                        {c.phone && (
                          <p className="text-[12px] text-slate-400">{c.phone}</p>
                        )}
                      </div>
                    </Link>
                  </td>

                  {/* Origen */}
                  <td className="px-6 py-4">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight"
                      style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}
                    >
                      {c.source ? SOURCE_LABELS[c.source] ?? c.source : "—"}
                    </span>
                  </td>

                  {/* Estado */}
                  <td className="px-6 py-4">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ background: statusStyle.bg, color: statusStyle.color }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0"
                        style={{ background: statusStyle.dot }}
                      />
                      {statusStyle.label}
                    </span>
                  </td>

                  {/* Interés */}
                  <td className="px-6 py-4">
                    <p className="text-xs text-slate-600 font-medium">{interest}</p>
                    {(c.budget_min || c.budget_max) && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {c.budget_currency ?? "USD"}{" "}
                        {c.budget_min ? c.budget_min.toLocaleString() : ""}
                        {c.budget_min && c.budget_max ? " – " : ""}
                        {c.budget_max ? c.budget_max.toLocaleString() : ""}
                      </p>
                    )}
                  </td>

                  {/* Actividad */}
                  <td className="px-6 py-4">
                    <p className="text-xs text-slate-400">
                      {formatDistanceToNow(
                        new Date(c.last_activity_at ?? c.created_at),
                        { addSuffix: true, locale: es }
                      )}
                    </p>
                  </td>

                  {/* Acciones */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {c.phone && (
                        <a
                          href={`https://wa.me/${c.phone.replace(/[\s\-+().]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="WhatsApp"
                          className="p-1.5 rounded hover:bg-stone-100 transition-colors"
                          style={{ color: "#25D366" }}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={(e) => openEdit(c, e)}
                        title="Editar"
                        className="p-1.5 rounded hover:bg-stone-100 transition-colors text-slate-400 hover:text-slate-700"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(c, e)}
                        title="Eliminar"
                        disabled={deletingId === c.id}
                        className="p-1.5 rounded hover:bg-red-50 transition-colors text-slate-400 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ContactSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        contact={editContact}
        onSaved={handleSaved}
      />
    </>
  );
}
