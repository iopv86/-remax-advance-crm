"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Upload, X, Download, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

async function recomputeProjectPriceRange(propertyId: string): Promise<void> {
  const supabase = createClient();
  const { data, error: selectError } = await supabase
    .from("project_units")
    .select("precio_venta")
    .eq("property_id", propertyId)
    .not("precio_venta", "is", null);

  if (selectError) {
    console.error("recomputeProjectPriceRange: select failed", selectError);
    return;
  }

  const prices = (data ?? [])
    .filter((r): r is { precio_venta: number } => r.precio_venta != null)
    .map((r) => r.precio_venta)
    .filter((v) => v > 0);

  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  const { error: updateError } = await supabase
    .from("properties")
    .update({ price: minPrice, price_max: maxPrice })
    .eq("id", propertyId);

  if (updateError) {
    console.error("recomputeProjectPriceRange: update failed", updateError);
  }
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Property } from "@/lib/types";
import {
  type CsvRowParsed,
  CSV_HEADERS,
  CSV_EXAMPLE_ROWS,
  parseCsv,
  downloadCsv,
} from "@/lib/project-units-csv";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-medium text-slate-500 mb-1">{children}</p>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 8,
        border: checked ? "1px solid rgba(201,150,58,0.4)" : "1px solid rgba(255,255,255,0.08)",
        background: checked ? "rgba(201,150,58,0.06)" : "transparent",
        cursor: "pointer",
      }}
      onClick={onChange}
    >
      <div
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: checked ? "#C9963A" : "rgba(255,255,255,0.12)",
          position: "relative", flexShrink: 0, transition: "background 0.15s",
        }}
      >
        <div
          style={{
            position: "absolute", top: 2,
            left: checked ? 18 : 2,
            width: 16, height: 16, borderRadius: "50%",
            background: "#fff", transition: "left 0.15s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}
        />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: checked ? "#C9963A" : "#e5e2e1" }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: 11, color: "#9899A8" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

interface PropertyFormState {
  title: string;
  property_type: string;
  transaction_type: "sale" | "rent";
  price: string;
  price_max: string;
  currency: "USD" | "DOP";
  location_city: string;
  location_sector: string;
  bedrooms: string;
  bathrooms: string;
  area_m2: string;
  lot_area_m2: string;
  total_floors: string;
  commission_pct: string;
  separation_fee: string;
  status: string;
  description: string;
  is_project: boolean;
  is_exclusive: boolean;
}

const EMPTY_FORM: PropertyFormState = {
  title: "",
  property_type: "apartment",
  transaction_type: "sale",
  price: "",
  price_max: "",
  currency: "USD",
  location_city: "",
  location_sector: "",
  bedrooms: "",
  bathrooms: "",
  area_m2: "",
  lot_area_m2: "",
  total_floors: "",
  commission_pct: "",
  separation_fee: "",
  status: "active",
  description: "",
  is_project: false,
  is_exclusive: false,
};

function propertyToForm(p: Property): PropertyFormState {
  return {
    title: p.title ?? "",
    property_type: p.property_type,
    transaction_type: p.transaction_type,
    price: p.price?.toString() ?? "",
    price_max: p.price_max?.toString() ?? "",
    currency: p.currency ?? "USD",
    location_city: p.city ?? "",
    location_sector: p.sector ?? "",
    bedrooms: p.bedrooms?.toString() ?? "",
    bathrooms: p.bathrooms?.toString() ?? "",
    area_m2: p.area_m2?.toString() ?? "",
    lot_area_m2: p.lot_area_m2?.toString() ?? "",
    total_floors: p.total_floors?.toString() ?? "",
    commission_pct: p.commission_pct?.toString() ?? "",
    separation_fee: p.separation_fee?.toString() ?? "",
    status: p.status,
    description: p.description ?? "",
    is_project: p.is_project ?? false,
    is_exclusive: p.is_exclusive ?? false,
  };
}

interface PropertySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: Property | null;
  defaultIsProject?: boolean;
  onSaved: () => void;
}

export function PropertySheet({
  open,
  onOpenChange,
  property,
  defaultIsProject = false,
  onSaved,
}: PropertySheetProps) {
  const isEdit = !!property;
  const [form, setForm] = useState<PropertyFormState>(
    property ? propertyToForm(property) : { ...EMPTY_FORM, is_project: defaultIsProject }
  );
  const [images, setImages] = useState<string[]>(property?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [csvProgress, setCsvProgress] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<CsvRowParsed[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(property ? propertyToForm(property) : { ...EMPTY_FORM, is_project: defaultIsProject });
      setImages(property?.images ?? []);
      setLoading(false);
      setUploading(false);
      setCsvRows(null);
      setCsvFileName(null);
      setCsvError(null);
      setCsvProgress(null);
    }
  }, [open, property, defaultIsProject]);

  function set(field: keyof PropertyFormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    if (images.length + files.length > 10) {
      toast.error("Máximo 10 fotos por propiedad");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    const MAX_MB = 5;
    for (const file of files) {
      if (!ALLOWED.includes(file.type)) {
        toast.error(`Formato no soportado: ${file.name} (usa JPG, PNG o WebP)`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`${file.name} supera los ${MAX_MB}MB`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    setUploading(true);
    const supabase = createClient();
    const uploaded: string[] = [];

    const EXT_MAP: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    for (const file of files) {
      const ext = EXT_MAP[file.type] ?? "jpg";
      const path = `properties/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("property-images")
        .upload(path, file, { upsert: false });
      if (error) {
        toast.error(`Error subiendo ${file.name}: ${error.message}`);
        continue;
      }
      const { data } = supabase.storage.from("property-images").getPublicUrl(path);
      uploaded.push(data.publicUrl);
    }

    setImages((prev) => [...prev, ...uploaded]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sesión expirada. Recarga la página.");
      setLoading(false);
      return;
    }
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("email", user.email ?? "")
      .single();

    const isProject = form.is_project;
    const payload = {
      title: form.title.trim(),
      property_type: form.property_type,
      transaction_type: isProject ? "sale" : form.transaction_type,
      price: form.price ? Number(form.price) : null,
      price_max: isProject && form.price_max ? Number(form.price_max) : null,
      currency: form.currency,
      city: form.location_city.trim() || null,
      sector: form.location_sector.trim() || null,
      bedrooms: isProject ? null : (form.bedrooms ? Number(form.bedrooms) : null),
      bathrooms: isProject ? null : (form.bathrooms ? Number(form.bathrooms) : null),
      area_m2: form.area_m2 ? Number(form.area_m2) : null,
      lot_area_m2: isProject ? (form.lot_area_m2 ? Number(form.lot_area_m2) : null) : null,
      total_floors: isProject ? (form.total_floors ? Number(form.total_floors) : null) : null,
      commission_pct: isProject ? (form.commission_pct ? Number(form.commission_pct) : null) : null,
      separation_fee: isProject ? (form.separation_fee ? Number(form.separation_fee) : null) : null,
      status: form.status,
      description: form.description.trim() || null,
      images,
      agent_id: agent?.id ?? null,
      is_project: isProject,
      is_exclusive: form.is_exclusive,
    };

    let error;
    let savedPropertyId: string | null = isEdit ? property!.id : null;

    if (isEdit) {
      ({ error } = await supabase.from("properties").update(payload).eq("id", property!.id));
    } else {
      const result = await supabase.from("properties").insert(payload).select("id").single();
      error = result.error;
      savedPropertyId = result.data?.id ?? null;
    }

    setLoading(false);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }

    // Upload units from CSV if provided (project only)
    if (isProject && csvRows && csvRows.length > 0 && savedPropertyId) {
      setCsvProgress(`Cargando ${csvRows.length} unidades…`);
      const unitPayload = csvRows.map((row) => ({
        property_id: savedPropertyId!,
        nombre_unidad: row.nombre_unidad,
        seccion: row.seccion ?? null,
        nivel: row.nivel ?? null,
        habitaciones: row.habitaciones ?? null,
        banos: row.banos ?? null,
        medios_banos: row.medios_banos ?? null,
        estacionamientos: row.estacionamientos ?? null,
        m2_construido: row.m2_construido ?? null,
        m2_extra: row.m2_extra ?? null,
        precio_venta: row.precio_venta ?? null,
        moneda_venta: row.moneda_venta ?? "USD",
        precio_mantenimiento: row.precio_mantenimiento ?? null,
        precio_separacion: row.precio_separacion ?? null,
        estado: row.estado ?? "disponible",
        etapa: row.etapa ?? null,
        notas: row.notas ?? null,
      }));
      const { error: unitError } = await supabase
        .from("project_units")
        .upsert(unitPayload, { onConflict: "property_id,nombre_unidad", ignoreDuplicates: false });

      if (!unitError) {
        await recomputeProjectPriceRange(savedPropertyId!);
      } else {
        // Project saved but CSV failed — notify and continue
        toast.error("Proyecto guardado, pero hubo un error al cargar las unidades del CSV.");
      }
      setCsvProgress(null);
    }

    toast.success(isEdit
      ? (isProject ? "Proyecto actualizado" : "Propiedad actualizada")
      : (isProject ? "Proyecto creado" : "Propiedad creada"));
    onOpenChange(false);
    onSaved();
  }

  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv") && file.type !== "text/csv" && file.type !== "text/plain") {
      toast.error("Solo se aceptan archivos CSV.");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setCsvError("El CSV no puede superar 2 MB.");
      e.target.value = "";
      return;
    }
    setCsvFileName(file.name);
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") { setCsvError("Error leyendo el archivo."); return; }
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setCsvError("Sin filas válidas. Descarga la plantilla para ver el formato.");
        setCsvRows(null);
      } else if (rows.length > 500) {
        setCsvError(`Máximo 500 unidades por importación (${rows.length} filas detectadas).`);
        setCsvRows(null);
      } else {
        setCsvRows(rows);
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  if (!open) return null;

  const isProject = form.is_project;
  const title = isEdit
    ? (isProject ? "Editar proyecto" : "Editar propiedad")
    : (isProject ? "Nuevo proyecto" : "Nueva propiedad");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div
        className="relative w-full mx-4 flex flex-col rounded-xl overflow-hidden"
        style={{
          maxWidth: 520,
          maxHeight: "90vh",
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: "var(--foreground)",
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">

            {/* Title */}
            <div>
              <Label>Título *</Label>
              <Input
                placeholder={isProject ? "Proyecto Vista Mar — Piantini" : "Apto 2hab en Piantini"}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>

            {/* Type + Transaction — transaction hidden for projects */}
            {isProject ? (
              <div>
                <Label>Tipo de unidades</Label>
                <Select value={form.property_type} onValueChange={(v) => v && set("property_type", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apartment">Apartamentos</SelectItem>
                    <SelectItem value="penthouse">Penthouses</SelectItem>
                    <SelectItem value="villa">Villas</SelectItem>
                    <SelectItem value="house">Casas</SelectItem>
                    <SelectItem value="commercial">Comercial</SelectItem>
                    <SelectItem value="apart_hotel">Apart-Hotel</SelectItem>
                    <SelectItem value="land">Solares</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.property_type} onValueChange={(v) => v && set("property_type", v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apartment">Apartamento</SelectItem>
                      <SelectItem value="penthouse">Penthouse</SelectItem>
                      <SelectItem value="villa">Villa</SelectItem>
                      <SelectItem value="house">Casa</SelectItem>
                      <SelectItem value="land">Solar</SelectItem>
                      <SelectItem value="commercial">Local Comercial</SelectItem>
                      <SelectItem value="apart_hotel">Apart-Hotel</SelectItem>
                      <SelectItem value="farm">Finca</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operación</Label>
                  <Select value={form.transaction_type} onValueChange={(v) => v && set("transaction_type", v as "sale" | "rent")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">Venta</SelectItem>
                      <SelectItem value="rent">Alquiler</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Price + Currency */}
            {isProject ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Precio mínimo</Label>
                  <Input type="number" placeholder="150000" value={form.price} onChange={(e) => set("price", e.target.value)} />
                </div>
                <div>
                  <Label>Precio máximo</Label>
                  <Input type="number" placeholder="500000" value={form.price_max} onChange={(e) => set("price_max", e.target.value)} />
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Select value={form.currency} onValueChange={(v) => v && set("currency", v as "USD" | "DOP")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="DOP">DOP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Precio</Label>
                  <Input type="number" placeholder="250000" value={form.price} onChange={(e) => set("price", e.target.value)} />
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Select value={form.currency} onValueChange={(v) => v && set("currency", v as "USD" | "DOP")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="DOP">DOP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Location */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ciudad</Label>
                <Input placeholder="Santo Domingo" value={form.location_city} onChange={(e) => set("location_city", e.target.value)} />
              </div>
              <div>
                <Label>Sector</Label>
                <Input placeholder="Piantini" value={form.location_sector} onChange={(e) => set("location_sector", e.target.value)} />
              </div>
            </div>

            {/* Project-specific fields */}
            {isProject ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Área construida (m²)</Label>
                    <Input type="number" placeholder="5000" value={form.area_m2} onChange={(e) => set("area_m2", e.target.value)} />
                  </div>
                  <div>
                    <Label>Terreno (m²)</Label>
                    <Input type="number" placeholder="2000" value={form.lot_area_m2} onChange={(e) => set("lot_area_m2", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Niveles</Label>
                    <Input type="number" placeholder="12" value={form.total_floors} onChange={(e) => set("total_floors", e.target.value)} />
                  </div>
                  <div>
                    <Label>Comisión %</Label>
                    <Input type="number" placeholder="3" value={form.commission_pct} onChange={(e) => set("commission_pct", e.target.value)} />
                  </div>
                  <div>
                    <Label>Separación (USD)</Label>
                    <Input type="number" placeholder="5000" value={form.separation_fee} onChange={(e) => set("separation_fee", e.target.value)} />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Hab.</Label>
                  <Input type="number" placeholder="2" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
                </div>
                <div>
                  <Label>Baños</Label>
                  <Input type="number" placeholder="2" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} />
                </div>
                <div>
                  <Label>m²</Label>
                  <Input type="number" placeholder="120" value={form.area_m2} onChange={(e) => set("area_m2", e.target.value)} />
                </div>
              </div>
            )}

            {/* Status */}
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => v && set("status", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="reserved">Reservado</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                  <SelectItem value="rented">Rentado</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Project toggle */}
            <Toggle
              checked={form.is_project}
              onChange={() => set("is_project", !form.is_project)}
              label="Es un proyecto / desarrollo"
              description="Con múltiples unidades (apartamentos, locales, etc.)"
            />

            {/* Exclusive toggle */}
            <Toggle
              checked={form.is_exclusive}
              onChange={() => set("is_exclusive", !form.is_exclusive)}
              label="Propiedad exclusiva"
              description="Captación exclusiva de RE/MAX Advance"
            />

            {/* Description */}
            <div>
              <Label>Descripción</Label>
              <textarea
                rows={3}
                placeholder="Descripción de la propiedad…"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
              />
            </div>

            {/* CSV upload — projects only */}
            {isProject && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <p className="font-sans text-xs font-medium text-slate-500">Unidades (opcional)</p>
                  <button
                    type="button"
                    onClick={() => downloadCsv(`${CSV_HEADERS}\n${CSV_EXAMPLE_ROWS}`, "plantilla-unidades.csv")}
                    style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#C9963A", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <Download style={{ width: 12, height: 12 }} />
                    Descargar plantilla
                  </button>
                </div>

                {csvRows ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <FileText style={{ width: 13, height: 13, color: "#10b981" }} />
                      <span style={{ fontSize: 12, color: "#10b981" }}>
                        {csvFileName} — {csvRows.length} unidad{csvRows.length !== 1 ? "es" : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCsvRows(null); setCsvFileName(null); setCsvError(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#10b981", display: "flex" }}
                    >
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCsvFileChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => csvFileInputRef.current?.click()}
                      className="gap-2 w-full"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Adjuntar CSV de unidades
                    </Button>
                  </>
                )}

                {csvError && (
                  <p style={{ fontSize: 11, color: "#f43f5e", marginTop: 6 }}>{csvError}</p>
                )}
              </div>
            )}

            {/* Photos */}
            <div>
              <Label>Fotos</Label>
              <div className="space-y-2">
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {images.map((url) => (
                      <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(url)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Subiendo…" : "Agregar fotos"}
                </Button>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <Button type="submit" disabled={loading || uploading || !!csvProgress} className="w-full">
                {csvProgress ?? (loading ? "Guardando…" : isEdit ? "Guardar cambios" : (isProject ? "Crear proyecto" : "Crear propiedad"))}
              </Button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
