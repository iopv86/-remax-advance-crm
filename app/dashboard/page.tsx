import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CheckSquare, DollarSign, Flame, MessageSquare } from "lucide-react";
import { CLASSIFICATION_COLORS, CLASSIFICATION_LABELS } from "@/lib/types";
import type { Contact, Task } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().split("T")[0];

  const [
    { count: totalContacts },
    { count: newLeadsWeek },
    { count: hotLeads },
    { data: recentContacts },
    { data: pendingTasks },
    { data: deals },
  ] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("contacts").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("lead_classification", "hot"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, lead_classification, lead_status, source, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("tasks")
      .select("id, title, due_date, priority, status, contact:contacts(first_name, last_name)")
      .eq("status", "pending")
      .lte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(5),
    supabase
      .from("deals")
      .select("deal_value, currency, stage")
      .not("stage", "in", '("closed_lost")'),
  ]);

  const pipelineValue = (deals ?? []).reduce((sum, d) => sum + (d.deal_value ?? 0), 0);

  const kpis = [
    {
      label: "Total contactos",
      value: totalContacts ?? 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Leads esta semana",
      value: newLeadsWeek ?? 0,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Leads HOT",
      value: hotLeads ?? 0,
      icon: Flame,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Pipeline activo",
      value: `$${pipelineValue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Resumen operativo RE/MAX Advance</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`p-3 rounded-lg ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent leads */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Leads recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {((recentContacts as unknown as Contact[]) ?? []).length === 0 && (
              <p className="text-sm text-gray-400">No hay contactos aún.</p>
            )}
            {((recentContacts as unknown as Contact[]) ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {c.first_name} {c.last_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: es })}
                  </p>
                </div>
                {c.lead_classification && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${CLASSIFICATION_COLORS[c.lead_classification]}`}
                  >
                    {CLASSIFICATION_LABELS[c.lead_classification]}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Pending tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="w-4 h-4" /> Tareas vencidas / pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {((pendingTasks as unknown as Task[]) ?? []).length === 0 && (
              <p className="text-sm text-gray-400">No hay tareas pendientes.</p>
            )}
            {((pendingTasks as unknown as Task[]) ?? []).map((t) => (
              <div key={t.id} className="flex items-start justify-between py-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                  {t.contact && (
                    <p className="text-xs text-gray-400">
                      {(t.contact as { first_name?: string; last_name?: string }).first_name}{" "}
                      {(t.contact as { first_name?: string; last_name?: string }).last_name}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ml-2 ${
                    t.priority === "urgent"
                      ? "border-red-300 text-red-700"
                      : t.priority === "high"
                      ? "border-orange-300 text-orange-700"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  {t.priority}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
