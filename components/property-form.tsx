"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Upload, X, Download, FileText, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createProperty, updateProperty } from "@/app/dashboard/properties/actions";
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

// ─── Theme constants ──────────────────────────────────────────────────────────
const GOLD = "#C9963A";
const TEXT_PRIMARY = "#E8E3DC";
const TEXT_MUTED = "#9899A8";
const BG_BODY = "#0D0E12";
const BG_ELEVATED = "#1C1D27";
const BG_SURFACE = "#201f1f";
const BORDER = "rgba(255,255,255,0.06)";
const BORDER_GOLD = "rgba(201,150,58,0.15)";

// ─── Business type (UI concept) ───────────────────────────────────────────────
type BusinessType = "venta" | "alquiler" | "proyecto";

function businessTypeFromProperty(p: Property): BusinessType {
  if (p.is_project) return "proyecto";
  if (p.transaction_type === "rent") return "alquiler";
  return "venta";
}

// ─── Amenity definitions ──────────────────────────────────────────────────────
const AMENITIES: { key: AmenityKey; label: string }[] = [
  { key: "has_pool", label: "Piscina" },
  { key: "has_gym", label: "Gimnasio" },
  { key: "has_terrace", label: "Terraza" },
  { key: "has_balcony", label: "Balcón" },
  { key: "has_security", label: "Seguridad 24h" },
  { key: "has_elevator", label: "Ascensor" },
  { key: "has_covered_parking", label: "Parking cubierto" },
  { key: "has_generator", label: "Planta eléctrica" },
  { key: "has_storage", label: "Storage" },
  { key: "has_laundry", label: "Lavandería" },
  { key: "has_furnished", label: "Amueblado" },
  { key: "has_staff_quarters", label: "Cuarto de servicio" },
  { key: "has_solar_panels", label: "Paneles solares" },
  { key: "has_jacuzzi", label: "Jacuzzi" },
  { key: "has_ocean_view", label: "Vista al mar" },
  { key: "has_city_view", label: "Vista a la ciudad" },
  { key: "has_club_house", label: "Club House" },
  { key: "has_kids_area", label: "Área de niños" },
];

type AmenityKey =
  | "has_pool" | "has_gym" | "has_terrace" | "has_balcony"
  | "has_security" | "has_elevator" | "has_covered_parking" | "has_generator"
  | "has_storage" | "has_laundry" | "has_furnished" | "has_staff_quarters"
  | "has_solar_panels" | "has_jacuzzi" | "has_ocean_view" | "has_city_view"
  | "has_club_house" | "has_kids_area";

// ─── Form state ───────────────────────────────────────────────────────────────
interface FormState {
  title: string;
  property_type: string;
  businessType: BusinessType;
  price: string;
  price_max: string;
  currency: "USD" | "DOP";
  city: string;
  sector: string;
  bedrooms: string;
  bathrooms: string;
  area_m2: string;
  lot_area_m2: string;
  total_floors: string;
  commission_pct: string;
  separation_fee: string;
  guarantee_months: string;
  status: string;
  description: string;
  is_exclusive: boolean;
  is_featured: boolean;
  // amenities
  has_pool: boolean;
  has_gym: boolean;
  has_terrace: boolean;
  has_balcony: boolean;
  has_security: boolean;
  has_elevator: boolean;
  has_covered_parking: boolean;
  has_generator: boolean;
  has_storage: boolean;
  has_laundry: boolean;
  has_furnished: boolean;
  has_staff_quarters: boolean;
  has_solar_panels: boolean;
  has_jacuzzi: boolean;
  has_ocean_view: boolean;
  has_city_view: boolean;
  has_club_house: boolean;
  has_kids_area: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  property_type: "apartment",
  businessType: "venta",
  price: "",
  price_max: "",
  currency: "USD",
  city: "",
  sector: "",
  bedrooms: "",
  bathrooms: "",
  area_m2: "",
  lot_area_m2: "",
  total_floors: "",
  commission_pct: "",
  separation_fee: "",
  guarantee_months: "2",
  status: "active",
  description: "",
  is_exclusive: false,
  is_featured: false,
  has_pool: false,
  has_gym: false,
  has_terrace: false,
  has_balcony: false,
  has_security: false,
  has_elevator: false,
  has_covered_parking: false,
  has_generator: false,
  has_storage: false,
  has_laundry: false,
  has_furnished: false,
  has_staff_quarters: false,
  has_solar_panels: false,
  has_jacuzzi: false,
  has_ocean_view: false,
  has_city_view: false,
  has_club_house: false,
  has_kids_area: false,
};

function propertyToForm(p: Property): FormState {
  const businessType = businessTypeFromProperty(p);
  return {
    title: p.title ?? "",
    property_type: p.property_type,
    businessType,
    price: p.price?.toString() ?? "",
    price_max: p.price_max?.toString() ?? "",
    currency: p.currency ?? "USD",
    city: p.city ?? "",
    sector: p.sector ?? "",
    bedrooms: p.bedrooms?.toString() ?? "",
    bathrooms: p.bathrooms?.toString() ?? "",
    area_m2: p.area_m2?.toString() ?? "",
    lot_area_m2: p.lot_area_m2?.toString() ?? "",
    total_floors: p.total_floors?.toString() ?? "",
    commission_pct: p.commission_pct?.toString() ?? "",
    separation_fee: p.separation_fee?.toString() ?? "",
    guarantee_months: (p.guarantee_months ?? 2).toString(),
    status: p.status,
    description: p.description ?? "",
    is_exclusive: p.is_exclusive ?? false,
    is_featured: p.is_featured ?? false,
    has_pool: p.has_pool ?? false,
    has_gym: p.has_gym ?? false,
    has_terrace: p.has_terrace ?? false,
    has_balcony: p.has_balcony ?? false,
    has_security: p.has_security ?? false,
    has_elevator: p.has_elevator ?? false,
    has_covered_parking: p.has_covered_parking ?? false,
    has_generator: p.has_generator ?? false,
    has_storage: p.has_storage ?? false,
    has_laundry: p.has_laundry ?? false,
    has_furnished: p.has_furnished ?? false,
    has_staff_quarters: p.has_staff_quarters ?? false,
    has_solar_panels: p.has_solar_panels ?? false,
    has_jacuzzi: p.has_jacuzzi ?? false,
    has_ocean_view: p.has_ocean_view ?? false,
    has_city_view: p.has_city_view ?? false,
    has_club_house: p.has_club_house ?? false,
    has_kids_area: p.has_kids_area ?? false,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>
      {children}
    </p>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: BG_ELEVATED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
      <p style={{ margin: "0 0 18px", fontSize: 12, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function FieldRow({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function BusinessTypeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer",
        fontWeight: 600, fontSize: 13, transition: "all 0.15s",
        background: active ? GOLD : BG_SURFACE,
        color: active ? "#0D0E12" : TEXT_MUTED,
      }}
    >
      {children}
    </button>
  );
}

function AmenityCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderRadius: 8, border: `1px solid ${checked ? BORDER_GOLD : BORDER}`,
        background: checked ? "rgba(201,150,58,0.06)" : "transparent",
        cursor: "pointer", textAlign: "left", transition: "all 0.12s",
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${checked ? GOLD : "rgba(255,255,255,0.2)"}`,
        background: checked ? GOLD : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0D0E12" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      <span style={{ fontSize: 12, color: checked ? TEXT_PRIMARY : TEXT_MUTED, fontWeight: checked ? 500 : 400 }}>
        {label}
      </span>
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PropertyFormProps {
  mode: "create" | "edit";
  initialData?: Property;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PropertyForm({ mode, initialData }: PropertyFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [form, setForm] = useState<FormState>(initialData ? propertyToForm(initialData) : EMPTY_FORM);
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // CSV state (create proyecto)
  const [csvRows, setCsvRows] = useState<CsvRowParsed[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvProgress, setCsvProgress] = useState<string | null>(null);

  // Project price override (edit)
  const [priceOverride, setPriceOverride] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // ── Dirty-form guard ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }

  function handleBack() {
    if (isDirty && !confirm("¿Salir sin guardar los cambios?")) return;
    if (isEdit && initialData) {
      router.push(`/dashboard/properties/${initialData.id}`);
    } else {
      router.push("/dashboard/properties");
    }
  }

  // ── Photo upload ────────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (images.length + files.length > 10) {
      toast.error("Máximo 10 fotos por propiedad");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    for (const file of files) {
      if (!ALLOWED.includes(file.type)) {
        toast.error(`Formato no soportado: ${file.name}`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} supera los 5 MB`);
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
      const { error } = await supabase.storage.from("property-images").upload(path, file, { upsert: false });
      if (error) { toast.error(`Error subiendo ${file.name}: ${error.message}`); continue; }
      const { data } = supabase.storage.from("property-images").getPublicUrl(path);
      uploaded.push(data.publicUrl);
    }
    setImages((prev) => [...prev, ...uploaded]);
    setIsDirty(true);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── CSV upload (new proyecto) ───────────────────────────────────────────────
  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ["text/csv", "text/plain", "application/vnd.ms-excel"];
    if (!file.name.endsWith(".csv") && !validTypes.includes(file.type)) {
      toast.error("Solo se aceptan archivos CSV.");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setCsvError("El CSV no puede superar 2 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setCsvError("No se encontraron filas válidas. Revisa el formato.");
        setCsvRows(null);
        setCsvFileName(null);
      } else {
        setCsvRows(rows);
        setCsvFileName(file.name);
        setCsvError(null);
        setIsDirty(true);
        toast.success(`${rows.length} unidades cargadas desde CSV`);
      }
    };
    reader.readAsText(file, "UTF-8");
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
  }

  // ── Build payload ───────────────────────────────────────────────────────────
  function buildPayload() {
    const { businessType } = form;
    const isProj = businessType === "proyecto";
    const isRent = businessType === "alquiler";
    return {
      title: form.title.trim(),
      property_type: form.property_type as Property["property_type"],
      transaction_type: (isRent ? "rent" : "sale") as "sale" | "rent",
      is_project: isProj,
      is_exclusive: form.is_exclusive,
      is_featured: form.is_featured,
      price: (isProj && !priceOverride) ? null : (form.price ? Number(form.price) : null),
      price_max: (isProj && !priceOverride) ? null : (form.price_max ? Number(form.price_max) : null),
      currency: form.currency,
      city: form.city.trim() || null,
      sector: form.sector.trim() || null,
      bedrooms: isProj ? null : (form.bedrooms ? Number(form.bedrooms) : null),
      bathrooms: isProj ? null : (form.bathrooms ? Number(form.bathrooms) : null),
      area_m2: form.area_m2 ? Number(form.area_m2) : null,
      lot_area_m2: form.lot_area_m2 ? Number(form.lot_area_m2) : null,
      total_floors: form.total_floors ? Number(form.total_floors) : null,
      commission_pct: form.commission_pct ? Number(form.commission_pct) : null,
      separation_fee: isProj ? (form.separation_fee ? Number(form.separation_fee) : null) : null,
      guarantee_months: isRent ? Number(form.guarantee_months ?? "2") : null,
      description: form.description.trim() || null,
      status: form.status as Property["status"],
      images,
      // amenities
      has_pool: form.has_pool,
      has_gym: form.has_gym,
      has_terrace: form.has_terrace,
      has_balcony: form.has_balcony,
      has_security: form.has_security,
      has_elevator: form.has_elevator,
      has_covered_parking: form.has_covered_parking,
      has_generator: form.has_generator,
      has_storage: form.has_storage,
      has_laundry: form.has_laundry,
      has_furnished: form.has_furnished,
      has_staff_quarters: form.has_staff_quarters,
      has_solar_panels: form.has_solar_panels,
      has_jacuzzi: form.has_jacuzzi,
      has_ocean_view: form.has_ocean_view,
      has_city_view: form.has_city_view,
      has_club_house: form.has_club_house,
      has_kids_area: form.has_kids_area,
    };
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("El título es obligatorio"); return; }
    setSaving(true);

    const payload = buildPayload();
    let savedId: string;

    if (isEdit && initialData) {
      const result = await updateProperty(initialData.id, payload);
      if (!result.success) { toast.error("Error: " + result.error); setSaving(false); return; }
      savedId = result.id;
    } else {
      const result = await createProperty(payload);
      if (!result.success) { toast.error("Error: " + result.error); setSaving(false); return; }
      savedId = result.id;
    }

    // Upload CSV units for new proyecto
    if (form.businessType === "proyecto" && csvRows && csvRows.length > 0) {
      setCsvProgress(`Cargando ${csvRows.length} unidades…`);
      const supabase = createClient();
      const unitPayload = csvRows.map((row) => ({
        property_id: savedId,
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
        // Recompute price range from uploaded units
        const { data: unitData } = await supabase
          .from("project_units")
          .select("precio_venta")
          .eq("property_id", savedId)
          .not("precio_venta", "is", null);

        const prices = (unitData ?? [])
          .map((r: { precio_venta: number | null }) => r.precio_venta)
          .filter((v): v is number => v != null && v > 0);

        if (prices.length > 0) {
          await supabase.from("properties").update({
            price: Math.min(...prices),
            price_max: Math.max(...prices),
          }).eq("id", savedId);
        }
      } else {
        toast.error("Proyecto guardado, pero el CSV falló. Súbelo desde la ficha.");
      }
      setCsvProgress(null);
    }

    setSaving(false);
    setIsDirty(false);
    toast.success(isEdit ? "Propiedad actualizada" : "Propiedad creada");
    router.push(`/dashboard/properties/${savedId}`);
  }, [form, images, csvRows, isEdit, initialData, priceOverride, router]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  const { businessType } = form;
  const isProj = businessType === "proyecto";
  const isRent = businessType === "alquiler";

  return (
    <form
      onSubmit={handleSubmit}
      style={{ minHeight: "100vh", background: BG_BODY, color: TEXT_PRIMARY, fontFamily: "Inter, sans-serif" }}
    >
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(13,14,18,0.9)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", gap: 16, padding: "12px 24px",
      }}>
        <button
          type="button"
          onClick={handleBack}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: TEXT_MUTED, cursor: "pointer", fontSize: 13, padding: "4px 0" }}
        >
          <ChevronLeft size={16} /> Propiedades
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isEdit ? (initialData?.title ?? "Editar propiedad") : "Nueva propiedad"}
          </p>
        </div>
        {csvProgress && (
          <span style={{ fontSize: 12, color: GOLD }}>{csvProgress}</span>
        )}
        <Button type="submit" disabled={saving || uploading} style={{ background: GOLD, color: "#0D0E12", fontWeight: 700, minWidth: 100 }}>
          {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
        </Button>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 80px" }}>
        {/* ── Tipo de negocio ──────────────────────────────────────────────── */}
        <SectionCard title="Tipo de negocio">
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["venta", "alquiler", "proyecto"] as BusinessType[]).map((bt) => (
              <BusinessTypeBtn key={bt} active={businessType === bt} onClick={() => set("businessType", bt)}>
                {bt === "venta" ? "Venta" : bt === "alquiler" ? "Alquiler" : "Proyecto"}
              </BusinessTypeBtn>
            ))}
          </div>

          <FieldRow cols={2}>
            <div>
              <FieldLabel>Título *</FieldLabel>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Ej. Apto 3H en Torre Mirador"
                style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }}
              />
            </div>
            <div>
              <FieldLabel>Tipo de propiedad</FieldLabel>
              <Select value={form.property_type} onValueChange={(v) => { if (v) set("property_type", v); }}>
                <SelectTrigger style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }}>
                  <SelectValue />
                </SelectTrigger>
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
          </FieldRow>

          <FieldRow cols={3}>
            <div>
              <FieldLabel>Estado</FieldLabel>
              <Select value={form.status} onValueChange={(v) => { if (v) set("status", v); }}>
                <SelectTrigger style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Disponible</SelectItem>
                  <SelectItem value="reserved">Reservado</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                  <SelectItem value="rented">Rentado</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <AmenityCheckbox label="Exclusiva" checked={form.is_exclusive} onChange={() => set("is_exclusive", !form.is_exclusive)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <AmenityCheckbox label="Destacada" checked={form.is_featured} onChange={() => set("is_featured", !form.is_featured)} />
            </div>
          </FieldRow>
        </SectionCard>

        {/* ── Ubicación ────────────────────────────────────────────────────── */}
        <SectionCard title="Ubicación">
          <FieldRow cols={2}>
            <div>
              <FieldLabel>Ciudad</FieldLabel>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Ej. Punta Cana" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
            </div>
            <div>
              <FieldLabel>Sector</FieldLabel>
              <Input value={form.sector} onChange={(e) => set("sector", e.target.value)} placeholder="Ej. Bávaro" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
            </div>
          </FieldRow>
        </SectionCard>

        {/* ── Medidas ──────────────────────────────────────────────────────── */}
        <SectionCard title="Medidas">
          <FieldRow cols={3}>
            <div>
              <FieldLabel>m² construido</FieldLabel>
              <Input type="number" min="0" value={form.area_m2} onChange={(e) => set("area_m2", e.target.value)} placeholder="0" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
            </div>
            <div>
              <FieldLabel>m² terreno / solar</FieldLabel>
              <Input type="number" min="0" value={form.lot_area_m2} onChange={(e) => set("lot_area_m2", e.target.value)} placeholder="0" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
            </div>
            <div>
              <FieldLabel>Plantas / pisos</FieldLabel>
              <Input type="number" min="1" value={form.total_floors} onChange={(e) => set("total_floors", e.target.value)} placeholder="1" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
            </div>
          </FieldRow>
          {!isProj && (
            <FieldRow cols={2}>
              <div>
                <FieldLabel>Habitaciones</FieldLabel>
                <Input type="number" min="0" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} placeholder="0" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
              </div>
              <div>
                <FieldLabel>Baños</FieldLabel>
                <Input type="number" min="0" step="0.5" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} placeholder="0" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
              </div>
            </FieldRow>
          )}
        </SectionCard>

        {/* ── Precio ───────────────────────────────────────────────────────── */}
        <SectionCard title={isRent ? "Precio de alquiler" : isProj ? "Rango de precio" : "Precio"}>
          {/* Moneda selector (always visible) */}
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>Moneda</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              {(["USD", "DOP"] as const).map((c) => (
                <BusinessTypeBtn key={c} active={form.currency === c} onClick={() => set("currency", c)}>
                  {c}
                </BusinessTypeBtn>
              ))}
            </div>
          </div>

          {/* Venta */}
          {!isRent && !isProj && (
            <FieldRow cols={3}>
              <div>
                <FieldLabel>Precio</FieldLabel>
                <Input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
              </div>
              <div>
                <FieldLabel>Comisión %</FieldLabel>
                <Input type="number" min="0" max="100" step="0.1" value={form.commission_pct} onChange={(e) => set("commission_pct", e.target.value)} placeholder="3" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
              </div>
            </FieldRow>
          )}

          {/* Alquiler */}
          {isRent && (
            <FieldRow cols={3}>
              <div>
                <FieldLabel>Precio mensual</FieldLabel>
                <Input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
              </div>
              <div>
                <FieldLabel>Meses de garantía</FieldLabel>
                <Input type="number" min="0" max="12" value={form.guarantee_months} onChange={(e) => set("guarantee_months", e.target.value)} placeholder="2" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
              </div>
            </FieldRow>
          )}

          {/* Proyecto */}
          {isProj && (
            <div>
              {/* Create mode — CSV upload panel */}
              {!isEdit && (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: TEXT_PRIMARY, fontWeight: 500 }}>Unidades del proyecto (CSV)</p>
                    <button
                      type="button"
                      onClick={() => downloadCsv(`${CSV_HEADERS}\n${CSV_EXAMPLE_ROWS}`, "plantilla_unidades.csv")}
                      style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: GOLD, cursor: "pointer", fontSize: 12 }}
                    >
                      <Download size={12} /> Plantilla CSV
                    </button>
                  </div>
                  {csvRows ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(201,150,58,0.06)", borderRadius: 8, border: `1px solid ${BORDER_GOLD}` }}>
                      <FileText size={16} color={GOLD} />
                      <span style={{ fontSize: 13, color: TEXT_PRIMARY, flex: 1 }}>{csvFileName} — {csvRows.length} unidades</span>
                      <button type="button" onClick={() => { setCsvRows(null); setCsvFileName(null); }} style={{ background: "none", border: "none", color: TEXT_MUTED, cursor: "pointer" }}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => csvFileInputRef.current?.click()}
                      style={{ width: "100%", padding: "16px", borderRadius: 8, border: `1.5px dashed ${BORDER}`, background: "transparent", color: TEXT_MUTED, cursor: "pointer", fontSize: 13 }}
                    >
                      <Upload size={14} style={{ display: "inline", marginRight: 6 }} />
                      Cargar CSV de unidades
                    </button>
                  )}
                  {csvError && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#ef4444" }}>{csvError}</p>}
                  <input ref={csvFileInputRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }} onChange={handleCsvFileChange} />
                  <p style={{ margin: "10px 0 0", fontSize: 11, color: TEXT_MUTED }}>
                    El rango de precio se calcula automáticamente desde las unidades cargadas. Si no subes CSV ahora, hazlo desde la ficha del proyecto.
                  </p>
                </div>
              )}

              {/* Edit mode — read-only range + override */}
              {isEdit && (
                <div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1, padding: "12px 14px", background: BG_SURFACE, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                      <p style={{ margin: "0 0 4px", fontSize: 11, color: TEXT_MUTED }}>Precio mínimo</p>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY }}>
                        {initialData?.price ? `${form.currency} ${Number(initialData.price).toLocaleString()}` : "—"}
                      </p>
                    </div>
                    <div style={{ flex: 1, padding: "12px 14px", background: BG_SURFACE, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                      <p style={{ margin: "0 0 4px", fontSize: 11, color: TEXT_MUTED }}>Precio máximo</p>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY }}>
                        {initialData?.price_max ? `${form.currency} ${Number(initialData.price_max).toLocaleString()}` : "—"}
                      </p>
                    </div>
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 11, color: TEXT_MUTED }}>
                    Calculado desde las unidades del proyecto. <a href={`/dashboard/properties/${initialData?.id}`} style={{ color: GOLD }}>Gestionar unidades →</a>
                  </p>
                  {!priceOverride ? (
                    <button
                      type="button"
                      onClick={() => setPriceOverride(true)}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 6, padding: "6px 12px", color: "#F59E0B", cursor: "pointer", fontSize: 12 }}
                    >
                      <AlertTriangle size={12} /> Editar precio manualmente
                    </button>
                  ) : (
                    <div>
                      <div style={{ padding: "10px 12px", background: "rgba(245,158,11,0.06)", borderRadius: 8, border: "1px solid rgba(245,158,11,0.2)", marginBottom: 10 }}>
                        <p style={{ margin: "0 0 4px", fontSize: 12, color: "#F59E0B", fontWeight: 600 }}>Override manual activado</p>
                        <p style={{ margin: 0, fontSize: 11, color: TEXT_MUTED }}>Este valor reemplazará el rango calculado. El CSV no se ve afectado.</p>
                      </div>
                      <FieldRow cols={2}>
                        <div>
                          <FieldLabel>Precio mínimo override</FieldLabel>
                          <Input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
                        </div>
                        <div>
                          <FieldLabel>Precio máximo override</FieldLabel>
                          <Input type="number" min="0" value={form.price_max} onChange={(e) => set("price_max", e.target.value)} style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
                        </div>
                      </FieldRow>
                      <button type="button" onClick={() => { setPriceOverride(false); set("price", ""); set("price_max", ""); }} style={{ background: "none", border: "none", color: TEXT_MUTED, cursor: "pointer", fontSize: 12, padding: 0 }}>
                        Cancelar override
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Separación fee (proyectos) */}
              <FieldRow cols={2}>
                <div style={{ marginTop: 12 }}>
                  <FieldLabel>Fee de separación</FieldLabel>
                  <Input type="number" min="0" value={form.separation_fee} onChange={(e) => set("separation_fee", e.target.value)} placeholder="0" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <FieldLabel>Comisión %</FieldLabel>
                  <Input type="number" min="0" max="100" step="0.1" value={form.commission_pct} onChange={(e) => set("commission_pct", e.target.value)} placeholder="3" style={{ background: BG_SURFACE, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY }} />
                </div>
              </FieldRow>
            </div>
          )}
        </SectionCard>

        {/* ── Características ──────────────────────────────────────────────── */}
        <SectionCard title="Características y amenidades">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {AMENITIES.map(({ key, label }) => (
              <AmenityCheckbox
                key={key}
                label={label}
                checked={form[key]}
                onChange={() => set(key, !form[key])}
              />
            ))}
          </div>
        </SectionCard>

        {/* ── Descripción ──────────────────────────────────────────────────── */}
        <SectionCard title="Descripción">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={5}
            placeholder="Describe la propiedad, atributos únicos, entorno, accesos…"
            style={{
              width: "100%", background: BG_SURFACE, border: `1px solid ${BORDER}`,
              borderRadius: 8, color: TEXT_PRIMARY, fontSize: 13, padding: "10px 12px",
              resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </SectionCard>

        {/* ── Fotos ────────────────────────────────────────────────────────── */}
        <SectionCard title="Fotos">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: images.length ? 12 : 0 }}>
            {images.map((url) => (
              <div key={url} style={{ position: "relative", width: 100, height: 80, borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}` }}>
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  type="button"
                  onClick={() => { setImages((p) => p.filter((u) => u !== url)); setIsDirty(true); }}
                  style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <X size={10} color="#fff" />
                </button>
              </div>
            ))}
          </div>
          {images.length < 10 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 8, border: `1.5px dashed ${BORDER}`, background: "transparent", color: TEXT_MUTED, cursor: uploading ? "default" : "pointer", fontSize: 13, width: "100%" }}
            >
              <Upload size={14} />
              {uploading ? "Subiendo…" : `Agregar fotos (${images.length}/10)`}
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={handleFileChange} />
        </SectionCard>
      </div>
    </form>
  );
}
