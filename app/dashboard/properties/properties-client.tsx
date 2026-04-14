"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, BedDouble, Bath, Maximize, Pencil, Trash2, Plus, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PropertySheet } from "@/components/property-sheet";
import { Button } from "@/components/ui/button";
import type { Property } from "@/lib/types";

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
  active: "Activo",
  reserved: "Reservado",
  sold: "Vendido",
  rented: "Rentado",
  inactive: "Inactivo",
};

type FilterKey = "all" | "sale" | "rent" | "active" | "reserved";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "sale", label: "En Venta" },
  { key: "rent", label: "En Renta" },
  { key: "active", label: "Disponible" },
  { key: "reserved", label: "Reservada" },
];

function applyFilter(properties: Property[], filter: FilterKey): Property[] {
  switch (filter) {
    case "sale": return properties.filter((p) => p.transaction_type === "sale");
    case "rent": return properties.filter((p) => p.transaction_type === "rent");
    case "active": return properties.filter((p) => p.status === "active");
    case "reserved": return properties.filter((p) => p.status === "reserved");
    default: return properties;
  }
}

interface Props {
  initialProperties: Property[];
}

export function PropertiesClient({ initialProperties }: Props) {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const filteredProperties = applyFilter(properties, activeFilter);

  function openCreate() {
    setEditProperty(null);
    setSheetOpen(true);
  }

  function openEdit(p: Property) {
    setEditProperty(p);
    setSheetOpen(true);
  }

  const onSaved = useCallback(() => {
    // Refresh the server component data
    router.refresh();
    // Optimistically close — router.refresh will update the list
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
      const err = await res.json().catch(() => ({}));
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

  // Update local state after server refresh
  // (router.refresh triggers re-render with new server data)

  async function handleDelete(p: Property) {
    if (!confirm(`¿Eliminar "${p.title}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(p.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", p.id);
    setDeletingId(null);
    if (error) {
      toast.error("Error al eliminar: " + error.message);
      return;
    }
    toast.success("Propiedad eliminada");
    setProperties((prev) => prev.filter((x) => x.id !== p.id));
    router.refresh();
  }

  return (
    <>
      {/* Filter tabs + view toggle */}
      <div className="flex items-center justify-between mb-6">
        <div
          className="flex items-center gap-1 p-1 rounded-lg"
          style={{ background: "#F5F4F1" }}
        >
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveFilter(key); setSelectedIds(new Set()); }}
              className="px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer"
              style={
                activeFilter === key
                  ? { background: "#e11d48", color: "white", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }
                  : { color: "#6b7280" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="flex items-center gap-1 p-1 rounded-lg"
          style={{ background: "#F5F4F1" }}
        >
          <button
            className="p-1.5 rounded-md cursor-pointer"
            style={{ background: "white", color: "#e11d48", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
          <button className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 transition-colors cursor-pointer">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="font-sans text-sm text-slate-600 font-medium">
                {selectedIds.size} seleccionada{selectedIds.size !== 1 ? "s" : ""}
              </span>
              <Button
                size="sm"
                onClick={handleGeneratePdf}
                disabled={generatingPdf}
                className="gap-1.5 rounded-full"
                style={{ background: "#0f172a", color: "#ffffff" }}
              >
                <FileText className="h-3.5 w-3.5" />
                {generatingPdf ? "Generando…" : "Generar propuesta PDF"}
              </Button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="font-sans text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Limpiar
              </button>
            </>
          )}
        </div>
        <Button
          onClick={openCreate}
          size="sm"
          className="gap-1.5 rounded-full"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva propiedad
        </Button>
      </div>

      {/* Property grid */}
      {filteredProperties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Building2 className="w-12 h-12 mb-4 opacity-20" />
          <p className="font-sans text-sm">
            {activeFilter === "all" ? "No hay propiedades registradas." : "Sin propiedades en esta categoría."}
          </p>
          {activeFilter === "all" && (
            <Button onClick={openCreate} variant="outline" size="sm" className="mt-4 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Agregar la primera propiedad
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProperties.map((p) => (
            <div
              key={p.id}
              className={`card-glow overflow-hidden relative group cursor-pointer transition-all ${
                selectedIds.has(p.id) ? "ring-2 ring-offset-2" : ""
              }`}
              style={selectedIds.has(p.id) ? { outline: "2px solid var(--primary)", outlineOffset: "2px" } : {}}
              onClick={() => toggleSelect(p.id)}
            >
              {/* Image / placeholder */}
              <div
                className="h-40 flex items-center justify-center relative overflow-hidden"
                style={{ background: "var(--secondary)" }}
              >
                {p.images && p.images.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.images[0]}
                    alt={p.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-10 h-10" style={{ color: "var(--border)" }} />
                )}
                {/* Status badge */}
                <span
                  className={
                    "absolute top-3 right-3 px-2 py-0.5 rounded text-[10px] font-sans font-semibold " +
                    (p.status === "active"
                      ? "status-active"
                      : p.status === "reserved"
                      ? "status-reserved"
                      : p.status === "sold"
                      ? "status-sold"
                      : p.status === "rented"
                      ? "status-rented"
                      : "badge-unqualified")
                  }
                >
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
                {/* Selection indicator */}
                <div
                  className="absolute top-3 left-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                  style={{
                    background: selectedIds.has(p.id) ? "var(--primary)" : "rgba(255,255,255,0.9)",
                    borderColor: selectedIds.has(p.id) ? "var(--primary)" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {selectedIds.has(p.id) && (
                    <svg viewBox="0 0 12 12" className="w-3 h-3 fill-white">
                      <path d="M1 6l3.5 3.5L11 2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                {/* Action buttons overlay */}
                <div className="absolute top-3 right-12 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    className="w-7 h-7 rounded-lg bg-white/90 flex items-center justify-center shadow-sm hover:bg-white transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-700" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                    disabled={deletingId === p.id}
                    className="w-7 h-7 rounded-lg bg-white/90 flex items-center justify-center shadow-sm hover:bg-red-50 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-2">
                <h3 className="font-sans font-semibold text-sm text-foreground leading-tight">
                  {p.title}
                </h3>
                <p className="font-sans text-xs text-muted-foreground">
                  {TYPE_LABELS[p.property_type] ?? p.property_type} ·{" "}
                  {p.transaction_type === "sale" ? "Venta" : "Alquiler"}
                </p>
                {(p.location_sector || p.location_city) && (
                  <p className="font-sans text-xs text-muted-foreground">
                    {[p.location_sector, p.location_city].filter(Boolean).join(", ")}
                  </p>
                )}
                {p.price != null && (
                  <p
                    className="font-mono text-sm font-bold"
                    style={{ color: "oklch(0.5 0.16 145)" }}
                  >
                    ${p.price.toLocaleString()} {p.currency ?? "USD"}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                  {p.bedrooms != null && (
                    <span className="flex items-center gap-1">
                      <BedDouble className="w-3 h-3" /> {p.bedrooms}
                    </span>
                  )}
                  {p.bathrooms != null && (
                    <span className="flex items-center gap-1">
                      <Bath className="w-3 h-3" /> {p.bathrooms}
                    </span>
                  )}
                  {p.area_m2 != null && (
                    <span className="flex items-center gap-1">
                      <Maximize className="w-3 h-3" /> {p.area_m2}m²
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PropertySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        property={editProperty}
        onSaved={onSaved}
      />
    </>
  );
}
