"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContactSheet } from "@/components/contact-sheet";
import { CLASSIFICATION_LABELS } from "@/lib/types";
import type { Contact } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  unqualified: "No calificado",
  nurturing: "Nutriendo",
  archived: "Archivado",
};

const SOURCE_LABELS: Record<string, string> = {
  ctwa_ad: "CTWA Ad",
  lead_form: "Formulario",
  referral: "Referido",
  walk_in: "Walk-in",
  website: "Web",
  social_media: "Redes",
  other: "Otro",
};

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
      <div className="card-base overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "var(--border)" }}>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Nombre</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Teléfono / Email</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Clasificación</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Estado</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Fuente</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Score</TableHead>
              <TableHead className="font-sans text-xs uppercase tracking-[0.12em] text-muted-foreground">Creado</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-12 font-sans text-sm">
                  No se encontraron contactos.
                </TableCell>
              </TableRow>
            )}
            {initial.map((c) => (
              <TableRow key={c.id} className="table-row-hover transition-colors cursor-pointer" style={{ borderColor: "var(--border)" }}>
                <TableCell>
                  <Link href={`/dashboard/contacts/${c.id}`} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-sans font-semibold text-xs shrink-0 text-rose-700"
                      style={{ background: "rgba(225,29,72,0.08)", outline: "2px solid rgba(225,29,72,0.18)", outlineOffset: "1px" }}
                    >
                      {(c.first_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    <span className="font-sans font-medium text-sm text-foreground hover:text-rose-600 transition-colors">
                      {c.first_name} {c.last_name}
                    </span>
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="font-sans text-sm space-y-0.5">
                    {c.phone && (
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`tel:${c.phone}`}
                          className="text-foreground hover:text-rose-600 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.phone}
                        </a>
                        <a
                          href={`https://wa.me/${c.phone.replace(/[\s\-+().]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir en WhatsApp"
                          className="inline-flex items-center justify-center w-5 h-5 rounded text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
                        >
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      </div>
                    )}
                    {c.email && <p className="text-muted-foreground text-xs mt-0.5">{c.email}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  {c.lead_classification ? (
                    <span
                      className={
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-sans font-medium border " +
                        (c.lead_classification === "hot" ? "badge-hot" :
                        c.lead_classification === "warm" ? "badge-warm" :
                        c.lead_classification === "cold" ? "badge-cold" : "badge-unqualified")
                      }
                    >
                      {CLASSIFICATION_LABELS[c.lead_classification]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="font-sans text-sm text-foreground">
                    {c.lead_status ? STATUS_LABELS[c.lead_status] ?? c.lead_status : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-sans text-xs text-muted-foreground">
                    {c.source ? SOURCE_LABELS[c.source] ?? c.source : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  {c.lead_score != null ? (
                    <span
                      className="font-mono text-sm font-semibold"
                      style={{
                        color: c.lead_score >= 8
                          ? "var(--red)"
                          : c.lead_score >= 5
                          ? "var(--amber)"
                          : c.lead_score >= 2
                          ? "var(--teal)"
                          : "var(--muted-foreground)",
                      }}
                    >
                      {c.lead_score}/10
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: es })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={(e) => openEdit(c, e)}
                      title="Editar"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(c, e)}
                      title="Eliminar"
                      disabled={deletingId === c.id}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
