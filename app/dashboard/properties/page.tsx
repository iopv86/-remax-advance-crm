import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Property } from "@/lib/types";
import { Building2, BedDouble, Bath, Maximize } from "lucide-react";

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

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  reserved: "bg-yellow-100 text-yellow-800",
  sold: "bg-gray-100 text-gray-600",
  rented: "bg-blue-100 text-blue-800",
  inactive: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  reserved: "Reservado",
  sold: "Vendido",
  rented: "Rentado",
  inactive: "Inactivo",
};

export default async function PropertiesPage() {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Propiedades</h1>
        <p className="text-sm text-gray-500 mt-1">{properties?.length ?? 0} propiedades</p>
      </div>

      {((properties as unknown as Property[]) ?? []).length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay propiedades registradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(properties as unknown as Property[]).map((p) => (
            <Card key={p.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-36 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                {p.images && p.images.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 leading-tight">{p.title}</h3>
                  <Badge className={`text-xs shrink-0 ${STATUS_COLORS[p.status]}`}>
                    {STATUS_LABELS[p.status]}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500">
                  {TYPE_LABELS[p.property_type] ?? p.property_type} · {p.transaction_type === "sale" ? "Venta" : "Alquiler"}
                </p>
                {(p.location_sector || p.location_city) && (
                  <p className="text-xs text-gray-400">
                    {[p.location_sector, p.location_city].filter(Boolean).join(", ")}
                  </p>
                )}
                {p.price != null && (
                  <p className="text-sm font-bold text-green-700">
                    ${p.price.toLocaleString()} {p.currency ?? "USD"}
                  </p>
                )}
                <div className="flex gap-3 text-xs text-gray-500 pt-1">
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
