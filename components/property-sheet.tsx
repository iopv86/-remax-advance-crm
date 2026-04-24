"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-medium text-slate-500 mb-1">{children}</p>
  );
}

interface PropertyFormState {
  title: string;
  property_type: string;
  transaction_type: "sale" | "rent";
  price: string;
  currency: "USD" | "DOP";
  location_city: string;
  location_sector: string;
  bedrooms: string;
  bathrooms: string;
  area_m2: string;
  status: string;
  description: string;
  is_project: boolean;
  is_exclusive: boolean;
  is_featured: boolean;
}

const EMPTY_FORM: PropertyFormState = {
  title: "",
  property_type: "apartment",
  transaction_type: "sale",
  price: "",
  currency: "USD",
  location_city: "",
  location_sector: "",
  bedrooms: "",
  bathrooms: "",
  area_m2: "",
  status: "active",
  description: "",
  is_project: false,
  is_exclusive: false,
  is_featured: false,
};

function propertyToForm(p: Property): PropertyFormState {
  return {
    title: p.title ?? "",
    property_type: p.property_type,
    transaction_type: p.transaction_type,
    price: p.price?.toString() ?? "",
    currency: p.currency ?? "USD",
    location_city: p.city ?? "",
    location_sector: p.sector ?? "",
    bedrooms: p.bedrooms?.toString() ?? "",
    bathrooms: p.bathrooms?.toString() ?? "",
    area_m2: p.area_m2?.toString() ?? "",
    status: p.status,
    description: p.description ?? "",
    is_project: p.is_project ?? false,
    is_exclusive: p.is_exclusive ?? false,
    is_featured: p.is_featured ?? false,
  };
}

interface PropertySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: Property | null; // null = create mode
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when sheet opens with new property data
  function handleOpenChange(o: boolean) {
    if (o) {
      setForm(property ? propertyToForm(property) : { ...EMPTY_FORM, is_project: defaultIsProject });
      setImages(property?.images ?? []);
    }
    onOpenChange(o);
  }

  function set(field: keyof PropertyFormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    // Validate total count
    if (images.length + files.length > 10) {
      toast.error("Máximo 10 fotos por propiedad");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate each file
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
      const { data } = supabase.storage
        .from("property-images")
        .getPublicUrl(path);
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

    const payload = {
      title: form.title.trim(),
      property_type: form.property_type,
      transaction_type: form.transaction_type,
      price: form.price ? Number(form.price) : null,
      currency: form.currency,
      city: form.location_city.trim() || null,
      sector: form.location_sector.trim() || null,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
      area_m2: form.area_m2 ? Number(form.area_m2) : null,
      status: form.status,
      description: form.description.trim() || null,
      images,
      agent_id: agent?.id ?? null,
      is_project: form.is_project,
      is_exclusive: form.is_exclusive,
      is_featured: form.is_featured,
    };

    let error;
    if (isEdit) {
      ({ error } = await supabase
        .from("properties")
        .update(payload)
        .eq("id", property!.id));
    } else {
      ({ error } = await supabase.from("properties").insert(payload));
    }

    setLoading(false);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }
    toast.success(isEdit ? "Propiedad actualizada" : "Propiedad creada");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto p-0"
      >
        <SheetHeader
          className="p-6 pb-4 sticky top-0 z-10"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--card)" }}
        >
          <SheetTitle
            style={{
              fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
              fontWeight: 700,
              fontSize: 20,
              color: "var(--foreground)",
            }}
          >
            {isEdit ? (form.is_project ? "Editar proyecto" : "Editar propiedad") : (form.is_project ? "Nuevo proyecto" : "Nueva propiedad")}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Title */}
          <div>
            <Label>Título *</Label>
            <Input
              placeholder="Apto 2hab en Piantini"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          {/* Type + Transaction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.property_type}
                onValueChange={(v) => v && set("property_type", v)}
              >
                <SelectTrigger className="w-full">
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
            <div>
              <Label>Operación</Label>
              <Select
                value={form.transaction_type}
                onValueChange={(v) => v && set("transaction_type", v as "sale" | "rent")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Venta</SelectItem>
                  <SelectItem value="rent">Alquiler</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Price + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Precio</Label>
              <Input
                type="number"
                placeholder="250000"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => v && set("currency", v as "USD" | "DOP")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="DOP">DOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ciudad</Label>
              <Input
                placeholder="Santo Domingo"
                value={form.location_city}
                onChange={(e) => set("location_city", e.target.value)}
              />
            </div>
            <div>
              <Label>Sector</Label>
              <Input
                placeholder="Piantini"
                value={form.location_sector}
                onChange={(e) => set("location_sector", e.target.value)}
              />
            </div>
          </div>

          {/* Specs */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Hab.</Label>
              <Input
                type="number"
                placeholder="2"
                value={form.bedrooms}
                onChange={(e) => set("bedrooms", e.target.value)}
              />
            </div>
            <div>
              <Label>Baños</Label>
              <Input
                type="number"
                placeholder="2"
                value={form.bathrooms}
                onChange={(e) => set("bathrooms", e.target.value)}
              />
            </div>
            <div>
              <Label>m²</Label>
              <Input
                type="number"
                placeholder="120"
                value={form.area_m2}
                onChange={(e) => set("area_m2", e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <Label>Estado</Label>
            <Select
              value={form.status}
              onValueChange={(v) => v && set("status", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 8,
              border: form.is_project ? "1px solid rgba(201,150,58,0.4)" : "1px solid rgba(255,255,255,0.08)",
              background: form.is_project ? "rgba(201,150,58,0.06)" : "transparent",
              cursor: "pointer",
            }}
            onClick={() => set("is_project", !form.is_project)}
          >
            <div
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: form.is_project ? "#C9963A" : "rgba(255,255,255,0.12)",
                position: "relative",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: form.is_project ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.15s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: form.is_project ? "#C9963A" : "#e5e2e1" }}>
                Es un proyecto / desarrollo
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "#9899A8" }}>
                Con múltiples unidades (apartamentos, locales, etc.)
              </p>
            </div>
          </div>

          {/* Exclusive toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 8,
              border: form.is_exclusive ? "1px solid rgba(201,150,58,0.4)" : "1px solid rgba(255,255,255,0.08)",
              background: form.is_exclusive ? "rgba(201,150,58,0.06)" : "transparent",
              cursor: "pointer",
            }}
            onClick={() => set("is_exclusive", !form.is_exclusive)}
          >
            <div
              style={{
                width: 36, height: 20, borderRadius: 10,
                background: form.is_exclusive ? "#C9963A" : "rgba(255,255,255,0.12)",
                position: "relative", flexShrink: 0, transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  position: "absolute", top: 2,
                  left: form.is_exclusive ? 18 : 2,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", transition: "left 0.15s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: form.is_exclusive ? "#C9963A" : "#e5e2e1" }}>
                Propiedad exclusiva
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "#9899A8" }}>
                Captación exclusiva de RE/MAX Advance
              </p>
            </div>
          </div>

          {/* Featured toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 8,
              border: form.is_featured ? "1px solid rgba(201,150,58,0.4)" : "1px solid rgba(255,255,255,0.08)",
              background: form.is_featured ? "rgba(201,150,58,0.06)" : "transparent",
              cursor: "pointer",
            }}
            onClick={() => set("is_featured", !form.is_featured)}
          >
            <div
              style={{
                width: 36, height: 20, borderRadius: 10,
                background: form.is_featured ? "#C9963A" : "rgba(255,255,255,0.12)",
                position: "relative", flexShrink: 0, transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  position: "absolute", top: 2,
                  left: form.is_featured ? 18 : 2,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", transition: "left 0.15s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: form.is_featured ? "#C9963A" : "#e5e2e1" }}>
                Propiedad destacada
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "#9899A8" }}>
                Aparece en posición prioritaria en el portal
              </p>
            </div>
          </div>

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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
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

          <SheetFooter className="pt-2">
            <Button type="submit" disabled={loading || uploading} className="w-full">
              {loading ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear propiedad"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
