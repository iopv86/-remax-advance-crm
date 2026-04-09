import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, User, Shield } from "lucide-react";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("email", user?.email ?? "")
    .single();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">Perfil y ajustes de la cuenta</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" /> Mi perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-red-600">
                  {agent?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{agent?.full_name ?? "—"}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
                {agent?.role && (
                  <Badge variant="outline" className="text-xs mt-1">
                    {agent.role === "admin" ? "Administrador" : agent.role === "manager" ? "Manager" : "Agente"}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {agent?.phone && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Teléfono</span>
                  <span className="text-gray-900">{agent.phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Estado</span>
                <Badge className={agent?.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                  {agent?.is_active ? "Activo" : "Inactivo"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" /> Integraciones activas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-700">WhatsApp Cloud API</span>
              <Badge className="bg-green-100 text-green-700">Activo</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-700">OpenAI GPT-4o-mini (Ava)</span>
              <Badge className="bg-green-100 text-green-700">Activo</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-gray-700">n8n Cloud</span>
              <Badge className="bg-green-100 text-green-700">Activo</Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-700">Supabase</span>
              <Badge className="bg-green-100 text-green-700">Activo</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
