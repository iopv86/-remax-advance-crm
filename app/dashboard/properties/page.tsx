import { createClient } from "@/lib/supabase/server";
import type { Property } from "@/lib/types";
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
      {/* Page Header */}
      <div className="p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2
              className="font-bold tracking-tight"
              style={{
                fontFamily: "var(--font-manrope), Manrope, sans-serif",
                fontSize: 24,
                color: "#1C1917",
              }}
            >
              Catálogo de Propiedades
            </h2>
            <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
              {list.length} propiedades gestionadas en tu terminal.
            </p>
          </div>
          <button
            className="flex items-center gap-2 font-bold text-sm px-5 py-2.5 rounded-lg shadow-md transition-all active:scale-95 hover:brightness-95"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar Propiedad
          </button>
        </div>

        <PropertiesClient initialProperties={list} />
      </div>
    </div>
  );
}
