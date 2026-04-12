import { createClient } from "@/lib/supabase/server";
import type { Property } from "@/lib/types";
import { Building2 } from "lucide-react";
import { PropertiesClient } from "./properties-client";

export default async function PropertiesPage() {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const list = (properties as unknown as Property[]) ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Inventario
            </p>
            <h1
              style={{
                fontFamily: "var(--font-playfair),Georgia,serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                lineHeight: 1.1,
              }}
            >
              Propiedades
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-teal-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-teal-700 shadow-sm backdrop-blur">
            <Building2 className="h-3.5 w-3.5" />
            {list.length} propiedades
          </div>
        </div>
      </div>

      <div className="p-7 animate-fade-up-1">
        <PropertiesClient initialProperties={list} />
      </div>
    </div>
  );
}
