"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageSquare, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ConversationComposer } from "./conversation-composer";
import type { Message } from "@/lib/types";
import { CLASSIFICATION_LABELS } from "@/lib/types";

interface ConversationMessage extends Message {
  contact: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    lead_classification?: string;
  } | null;
}

interface Props {
  initialConversations: ConversationMessage[];
}

function deduplicate(messages: ConversationMessage[]): ConversationMessage[] {
  const seen = new Set<string>();
  const result: ConversationMessage[] = [];
  for (const msg of messages) {
    if (!seen.has(msg.contact_id)) {
      seen.add(msg.contact_id);
      result.push(msg);
    }
  }
  return result;
}

export function ConversationsClient({ initialConversations }: Props) {
  const [conversations, setConversations] = useState<ConversationMessage[]>(initialConversations);

  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      const { data } = await supabase
        .from("messages")
        .select(
          "id, contact_id, direction, channel, content, is_automated, created_at, contact:contacts(first_name, last_name, phone, lead_classification)"
        )
        .eq("channel", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(200);

      if (data) {
        setConversations(deduplicate(data as ConversationMessage[]));
      }
    }

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: "channel=eq.whatsapp" },
        () => {
          // Refetch full list on any change — simpler than merging locally
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Canal WhatsApp
            </p>
            <h1
              style={{
                fontFamily: "var(--font-display),var(--font-manrope),system-ui,sans-serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "var(--foreground)",
                lineHeight: 1.1,
              }}
            >
              Conversaciones
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-teal-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-teal-700 shadow-sm backdrop-blur">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="tabular-nums">{conversations.length}</span> chats
          </div>
        </div>
      </div>

      <div className="p-7 animate-fade-up-1">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-sans text-sm">No hay conversaciones registradas.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {conversations.map((msg) => {
              const contact = msg.contact;
              return (
                <div key={msg.contact_id} className="card-glow p-4 space-y-3">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-sans font-semibold text-sm"
                      style={{ background: "var(--red-muted)", color: "var(--red)" }}
                    >
                      {(contact?.first_name?.[0] ?? "?").toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-sans font-semibold text-sm text-foreground">
                          {contact?.first_name} {contact?.last_name}
                        </p>
                        {contact?.phone && (
                          <a
                            href={`https://wa.me/${contact.phone.replace(/[\s\-+().]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-[#25D366] hover:underline"
                          >
                            {contact.phone}
                          </a>
                        )}
                        {contact?.lead_classification && (
                          <span
                            className={
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border " +
                              (contact.lead_classification === "hot" ? "badge-hot" :
                               contact.lead_classification === "warm" ? "badge-warm" :
                               contact.lead_classification === "cold" ? "badge-cold" : "badge-unqualified")
                            }
                          >
                            {CLASSIFICATION_LABELS[contact.lead_classification as keyof typeof CLASSIFICATION_LABELS]}
                          </span>
                        )}
                        {msg.is_automated && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium"
                            style={{ background: "var(--red-muted)", color: "var(--red)" }}
                          >
                            <Bot className="w-2.5 h-2.5" /> Ava
                          </span>
                        )}
                      </div>
                      <p className="font-sans text-sm text-muted-foreground truncate">{msg.content}</p>
                    </div>

                    <div className="text-right shrink-0 space-y-1.5">
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </p>
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[10px] font-sans font-medium"
                        style={
                          msg.direction === "inbound"
                            ? { background: "var(--teal-muted)", color: "var(--teal)" }
                            : { background: "var(--amber-muted)", color: "oklch(0.52 0.13 65)" }
                        }
                      >
                        {msg.direction === "inbound" ? "Entrada" : "Salida"}
                      </span>
                    </div>
                  </div>

                  {contact?.phone && (
                    <ConversationComposer
                      contactId={msg.contact_id}
                      phone={contact.phone}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
