import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, CLASSIFICATION_COLORS, CLASSIFICATION_LABELS } from "@/lib/types";
import type { Deal, DealStage } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

const STAGE_ORDER: DealStage[] = [
  "lead_captured",
  "qualified",
  "contacted",
  "showing_scheduled",
  "showing_done",
  "offer_made",
  "negotiation",
  "contract",
  "closed_won",
  "closed_lost",
];

const STAGE_COLORS: Record<DealStage, string> = {
  lead_captured: "bg-gray-100 border-gray-300",
  qualified: "bg-blue-50 border-blue-200",
  contacted: "bg-sky-50 border-sky-200",
  showing_scheduled: "bg-yellow-50 border-yellow-200",
  showing_done: "bg-orange-50 border-orange-200",
  offer_made: "bg-purple-50 border-purple-200",
  negotiation: "bg-pink-50 border-pink-200",
  contract: "bg-indigo-50 border-indigo-200",
  closed_won: "bg-green-50 border-green-300",
  closed_lost: "bg-red-50 border-red-200",
};

export default async function PipelinePage() {
  const supabase = await createClient();

  const { data: deals } = await supabase
    .from("deals")
    .select(
      "id, stage, deal_value, currency, expected_close_date, created_at, contact:contacts(first_name, last_name, lead_classification, phone)"
    )
    .order("created_at", { ascending: false });

  const grouped = STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = ((deals as unknown as Deal[]) ?? []).filter((d) => d.stage === stage);
    return acc;
  }, {} as Record<DealStage, Deal[]>);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-1">{deals?.length ?? 0} deals activos</p>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {STAGE_ORDER.map((stage) => {
            const stageDealss = grouped[stage];
            const stageValue = stageDealss.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">{STAGE_LABELS[stage]}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {stageDealss.length}
                  </Badge>
                </div>
                {stageValue > 0 && (
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    {stageValue.toLocaleString()}
                  </p>
                )}
                <div className={`min-h-24 rounded-lg border-2 p-2 space-y-2 ${STAGE_COLORS[stage]}`}>
                  {stageDealss.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">Vacío</p>
                  )}
                  {stageDealss.map((deal) => {
                    const contact = deal.contact as {
                      first_name?: string;
                      last_name?: string;
                      lead_classification?: string;
                      phone?: string;
                    } | null;
                    return (
                      <Card key={deal.id} className="bg-white shadow-sm border-0">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-sm font-medium text-gray-900 leading-tight">
                              {contact?.first_name} {contact?.last_name}
                            </p>
                            {contact?.lead_classification && (
                              <Badge
                                variant="outline"
                                className={`text-xs shrink-0 ${CLASSIFICATION_COLORS[contact.lead_classification as keyof typeof CLASSIFICATION_COLORS]}`}
                              >
                                {CLASSIFICATION_LABELS[contact.lead_classification as keyof typeof CLASSIFICATION_LABELS]}
                              </Badge>
                            )}
                          </div>
                          {deal.deal_value != null && (
                            <p className="text-xs font-semibold text-green-700">
                              ${deal.deal_value.toLocaleString()} {deal.currency ?? "USD"}
                            </p>
                          )}
                          {contact?.phone && (
                            <p className="text-xs text-gray-400">{contact.phone}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
