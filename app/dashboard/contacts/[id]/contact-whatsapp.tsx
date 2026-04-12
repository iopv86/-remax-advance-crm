"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { WhatsAppComposer } from "@/components/whatsapp-composer";
import type { Message } from "@/lib/types";

interface Props {
  contactId: string;
  phone: string;
  initialMessages: Message[];
}

export function ContactWhatsApp({ contactId, phone, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`messages-contact-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.channel === "whatsapp") {
            setMessages((prev) => [...prev, newMsg]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  return (
    <>
      <div className="space-y-2 mb-4 max-h-80 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center font-sans">Sin mensajes</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs font-sans leading-relaxed ${
                msg.direction === "outbound"
                  ? "bg-[#dcf8c6] text-slate-800 rounded-br-sm"
                  : "bg-white border border-slate-100 text-slate-700 rounded-bl-sm shadow-sm"
              }`}
            >
              {msg.is_automated && (
                <span className="text-[10px] text-muted-foreground block mb-0.5">🤖 Ava</span>
              )}
              <p>{msg.content}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                {format(new Date(msg.created_at), "d MMM, HH:mm", { locale: es })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* onSent is intentionally empty — the realtime subscription picks up the INSERT */}
      <WhatsAppComposer contactId={contactId} phone={phone} />
    </>
  );
}
