import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Message } from "@/lib/types";
import { MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default async function ConversationsPage() {
  const supabase = await createClient();

  // Get last message per contact
  const { data: messages } = await supabase
    .from("messages")
    .select(
      "id, contact_id, direction, channel, content, is_automated, created_at, contact:contacts(first_name, last_name, phone, lead_classification)"
    )
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(200);

  // Deduplicate: last message per contact
  const seen = new Set<string>();
  const conversations: typeof messages = [];
  for (const msg of messages ?? []) {
    if (!seen.has(msg.contact_id)) {
      seen.add(msg.contact_id);
      conversations.push(msg);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conversaciones WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-1">{conversations.length} conversaciones</p>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay conversaciones registradas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((msg) => {
            const contact = msg.contact as {
              first_name?: string;
              last_name?: string;
              phone?: string;
              lead_classification?: string;
            } | null;
            return (
              <Card key={msg.id} className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-gray-600">
                      {contact?.first_name?.[0] ?? "?"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {contact?.first_name} {contact?.last_name}
                      </p>
                      {contact?.phone && (
                        <span className="text-xs text-gray-400">{contact.phone}</span>
                      )}
                      {msg.is_automated && (
                        <Badge variant="secondary" className="text-xs">IA</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate">{msg.content}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: es })}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        msg.direction === "inbound"
                          ? "border-green-300 text-green-700"
                          : "border-blue-300 text-blue-700"
                      }`}
                    >
                      {msg.direction === "inbound" ? "Entrada" : "Salida"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
