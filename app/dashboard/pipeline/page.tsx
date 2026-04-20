import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import type { Deal } from "@/lib/types";
import { NewDealButton } from "@/components/quick-action-sheets";
import { PipelineClient } from "./pipeline-client";

export default async function PipelinePage() {
  const supabase = await createClient();
  const session = await getSessionAgent();

  let dealsQuery = supabase
    .from("deals")
    .select(
      "id, contact_id, stage, deal_value, currency, expected_close_date, notes, created_at, contact:contacts(first_name, last_name, lead_classification, phone)"
    )
    .order("created_at", { ascending: false });

  if (!isPrivileged(session.role)) {
    dealsQuery = dealsQuery.eq("agent_id", session.agentId);
  }

  const { data: deals } = await dealsQuery;

  const typedDeals = (deals as unknown as Deal[]) ?? [];

  const totalPipeline = typedDeals
    .filter((d) => d.stage !== "closed_lost")
    .reduce((sum, d) => sum + (d.deal_value ?? 0), 0);

  // Summary counts
  const qualified = typedDeals.filter((d) => d.stage === "qualified").length;
  const proposed = typedDeals.filter((d) =>
    ["offer_made", "promesa_de_venta"].includes(d.stage)
  ).length;
  const negotiating = typedDeals.filter((d) => d.stage === "negotiation").length;
  const closedWon = typedDeals.filter((d) => d.stage === "closed_won").length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#121319",
      }}
    >
      {/* Page Header */}
      <div className="px-4 pt-6 pb-0 md:px-12 md:pt-8" style={{ flexShrink: 0, background: "#121319" }}>
        {/* Breadcrumb + title row */}
        <div className="flex flex-col gap-3 mb-6 md:flex-row md:justify-between md:items-end md:mb-10">
          <div>
            <nav
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "#9899A8",
                fontSize: 11,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
              }}
            >
              <span>Dashboard</span>
              <span style={{ fontSize: 10 }}>›</span>
              <span style={{ color: "#f5bd5d" }}>Pipeline</span>
            </nav>
            <h1
              className="text-[26px] md:text-[36px]"
              style={{
                fontFamily: "Manrope, var(--font-manrope), sans-serif",
                fontWeight: 800,
                color: "#e3e1ea",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              Pipeline de Ventas
            </h1>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }} className="md:items-end">
            <span
              style={{
                color: "#9899A8",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
              }}
            >
              Volumen Total del Pipeline
            </span>
            <div
              className="text-[20px] md:text-[28px]"
              style={{
                fontFamily: "Manrope, var(--font-manrope), sans-serif",
                fontWeight: 700,
                color: "#f5bd5d",
              }}
            >
              RD$ {totalPipeline.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Summary metric pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <MetricPill label="En Calificación" value={qualified} accentColor="#f5bd5d" />
          <MetricPill label="En Propuesta" value={proposed} accentColor="#f59e0b" />
          <MetricPill label="En Negociación" value={negotiating} accentColor="#f97316" />
          <MetricPill label="Cerrado Ganado" value={closedWon} accentColor="#10b981" />

          <div style={{ marginLeft: "auto" }}>
            <NewDealButton />
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="px-4 pb-10 md:px-12 md:pb-12" style={{ flex: 1, overflowX: "auto" }}>
        <PipelineClient deals={typedDeals} />
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  accentColor,
}: {
  label: string;
  value: number;
  accentColor: string;
}) {
  return (
    <div
      style={{
        background: "#1a1b22",
        borderLeft: `4px solid ${accentColor}40`,
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <span
        style={{
          color: "#9899A8",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "Manrope, var(--font-manrope), sans-serif",
          fontWeight: 700,
          fontSize: 20,
          color: "#e3e1ea",
        }}
      >
        {value}
      </span>
    </div>
  );
}
