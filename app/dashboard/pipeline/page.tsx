import { createClient } from "@/lib/supabase/server";
import type { Deal } from "@/lib/types";
import { Kanban, DollarSign } from "lucide-react";
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
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Gestión de ventas
            </p>
            <h1
              style={{
                fontFamily: "var(--font-playfair),Georgia,serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "var(--foreground)",
                lineHeight: 1.1,
              }}
            >
              Oportunidades
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <NewDealButton />
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
              <Kanban className="h-3.5 w-3.5 text-slate-400" />
              {typedDeals.length} deals
            </div>
            {totalPipeline > 0 && (
              <div className="flex items-center gap-2 rounded-full border border-violet-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-violet-700 shadow-sm backdrop-blur">
                <DollarSign className="h-3.5 w-3.5" />
                ${totalPipeline.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-7 animate-fade-up-1">
        <PipelineClient deals={typedDeals} />
      </div>
    </div>
  );
}
