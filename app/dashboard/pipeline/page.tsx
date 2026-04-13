import { createClient } from "@/lib/supabase/server";
import type { Deal } from "@/lib/types";
import { NewDealButton } from "@/components/quick-action-sheets";
import { PipelineClient } from "./pipeline-client";

export default async function PipelinePage() {
  const supabase = await createClient();

  const { data: deals } = await supabase
    .from("deals")
    .select(
      "id, contact_id, stage, deal_value, currency, expected_close_date, notes, created_at, contact:contacts(first_name, last_name, lead_classification, phone)"
    )
    .order("created_at", { ascending: false });

  const typedDeals = (deals as unknown as Deal[]) ?? [];

  const totalPipeline = typedDeals
    .filter((d) => d.stage !== "closed_lost")
    .reduce((sum, d) => sum + (d.deal_value ?? 0), 0);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page Header */}
      <div className="px-8 py-6 shrink-0 bg-background">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2
              className="font-extrabold tracking-tight"
              style={{
                fontFamily: "var(--font-manrope), Manrope, sans-serif",
                fontSize: 24,
                color: "#1C1917",
              }}
            >
              Pipeline de Ventas
            </h2>
            {totalPipeline > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-stone-500 text-sm">Valor Total en Pipeline:</span>
                <span
                  className="font-bold text-lg"
                  style={{
                    fontFamily: "var(--font-manrope), Manrope, sans-serif",
                    color: "#1C1917",
                  }}
                >
                  RD$ {(totalPipeline / 1_000_000).toFixed(1)}M
                </span>
              </div>
            )}
          </div>
          <NewDealButton />
        </div>

        {/* Filter row */}
        <div
          className="flex items-center justify-between pt-5"
          style={{ borderTop: "1px solid #E7E5E0" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors hover:border-stone-400"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <span className="text-sm font-medium text-stone-600">Todos los Agentes</span>
              <svg className="w-4 h-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors hover:border-stone-400"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <span className="text-sm font-medium text-stone-600">Este Mes</span>
              <svg className="w-4 h-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          <div
            className="p-1 rounded-lg flex"
            style={{ background: "var(--border)" }}
          >
            <button
              className="px-4 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2"
              style={{ background: "white", color: "#1C1917", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            >
              Kanban
            </button>
            <button className="px-4 py-1.5 rounded-md text-sm font-medium text-stone-500 flex items-center gap-2 hover:text-stone-700 transition-colors">
              Lista
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto px-8 pb-8">
        <PipelineClient deals={typedDeals} />
      </div>
    </div>
  );
}
