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
            className="flex items-center gap-2 font-bold text-sm text-white px-5 py-2.5 rounded-lg shadow-md transition-all active:scale-95 hover:brightness-95"
            style={{ background: "#e11d48" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar Propiedad
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center justify-between mb-8">
          <div
            className="flex items-center gap-1 p-1 rounded-lg"
            style={{ background: "#F5F4F1" }}
          >
            {["Todas", "En Venta", "En Renta", "Disponible", "Reservada"].map((tab, i) => (
              <button
                key={tab}
                className="px-4 py-1.5 text-xs font-bold rounded-md transition-all"
                style={
                  i === 0
                    ? { background: "#e11d48", color: "white", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }
                    : { color: "#6b7280" }
                }
              >
                {tab}
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-1 p-1 rounded-lg"
            style={{ background: "#F5F4F1" }}
          >
            <button
              className="p-1.5 rounded-md"
              style={{ background: "white", color: "#e11d48", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <PropertiesClient initialProperties={list} />
      </div>
    </div>
  );
}
