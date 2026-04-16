"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { Search, Lock, MessageSquare } from "lucide-react";
import { CLASSIFICATION_LABELS } from "@/lib/types";
import { WhatsAppComposer } from "@/components/whatsapp-composer";

interface ConversationMessage {
  id: string;
  contact_id: string;
  direction: "inbound" | "outbound";
  channel: string;
  content: string;
  is_automated: boolean;
  created_at: string;
  contact: {
    id?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    lead_classification?: string;
  } | null;
}

interface ThreadMessage {
  id: string;
  contact_id: string;
  direction: "inbound" | "outbound";
  content: string;
  is_automated: boolean;
  created_at: string;
}

interface Props {
  initialConversations: ConversationMessage[];
}

type Filter = "todos" | "ava" | "tomado" | "sin_respuesta";

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

function getInitials(first?: string, last?: string): string {
  return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase() || "?";
}

function contactName(contact: ConversationMessage["contact"]): string {
  if (!contact) return "Contacto desconocido";
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.phone || "Sin nombre";
}

export function ConversationsClient({ initialConversations }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedContactId = searchParams.get("contact");

  const [conversations, setConversations] = useState<ConversationMessage[]>(initialConversations);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [refreshKey, setRefreshKey] = useState(0);
  const [avaPaused, setAvaPaused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // stable supabase client ref
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Refetch conversation list
  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select(
        "id, contact_id, direction, channel, content, is_automated, created_at, contact:contacts(id, first_name, last_name, phone, lead_classification)"
      )
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setConversations(deduplicate(data as ConversationMessage[]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription on message list
  useEffect(() => {
    const channel = supabase
      .channel("conv-list-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: "channel=eq.whatsapp" },
        () => { refetch(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  // Fetch thread when contact changes or after a message is sent
  useEffect(() => {
    if (!selectedContactId) {
      setThreadMessages([]);
      return;
    }
    setThreadLoading(true);
    supabase
      .from("messages")
      .select("id, contact_id, direction, content, is_automated, created_at")
      .eq("contact_id", selectedContactId)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setThreadMessages((data ?? []) as ThreadMessage[]);
        setThreadLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContactId, refreshKey]);

  // Realtime for active thread
  useEffect(() => {
    if (!selectedContactId) return;
    const channel = supabase
      .channel(`thread-${selectedContactId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${selectedContactId}`,
        },
        (payload) => {
          setThreadMessages((prev) => [...prev, payload.new as ThreadMessage]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContactId]);

  // Reset avaPaused when the selected contact changes
  useEffect(() => {
    setAvaPaused(false);
  }, [selectedContactId]);

  // Scroll to bottom on new thread messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  function selectContact(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("contact", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Filter + search
  const filtered = conversations.filter((conv) => {
    const name = contactName(conv.contact).toLowerCase();
    const matchesSearch = !searchQuery || name.includes(searchQuery.toLowerCase()) || conv.content.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === "ava") return conv.is_automated;
    if (filter === "sin_respuesta") return conv.direction === "inbound";
    return true;
  });

  const selectedConv = conversations.find((c) => c.contact_id === selectedContactId);
  const selectedContact = selectedConv?.contact ?? null;

  // Is the last message in thread from Ava (automated outbound)?
  const lastMsg = threadMessages[threadMessages.length - 1];
  const avaActive = !avaPaused && (lastMsg?.is_automated === true && lastMsg?.direction === "outbound");

  const handleTakeConversation = async () => {
    if (!selectedContactId) return;
    await supabase
      .from("contacts")
      .update({ ava_paused: true })
      .eq("id", selectedContactId);
    setAvaPaused(true);
  };

  return (
    <div className="flex overflow-hidden" style={{ height: "100vh" }}>
      {/* ── LEFT PANEL: Conversation list ── */}
      <section
        className="flex flex-col flex-shrink-0 border-r"
        style={{
          width: 280,
          background: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div className="p-5 flex-shrink-0">
          <h1
            className="text-lg font-bold mb-4"
            style={{ fontFamily: "var(--font-manrope, var(--font-display))", color: "var(--foreground)" }}
          >
            Conversaciones
          </h1>

          {/* Search */}
          <div className="relative mb-4">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "var(--muted-foreground)" }}
            />
            <input
              type="text"
              placeholder="Buscar chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg pl-9 py-2 text-xs outline-none"
              style={{
                background: "var(--secondary)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* Filter tabs */}
          <div
            className="flex gap-3 pb-2 overflow-x-auto"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            {(
              [
                { key: "todos", label: "Todos" },
                { key: "ava", label: "Ava activa" },
                { key: "sin_respuesta", label: "Sin respuesta" },
              ] as { key: Filter; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className="text-xs font-medium whitespace-nowrap pb-1 transition-colors"
                style={{
                  color: filter === key ? "var(--primary)" : "var(--muted-foreground)",
                  borderBottom: filter === key ? "2px solid var(--primary)" : "2px solid transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <MessageSquare className="w-6 h-6 mb-2 opacity-30" />
              Sin conversaciones
            </div>
          ) : (
            filtered.map((conv) => {
              const isActive = conv.contact_id === selectedContactId;
              const initials = getInitials(conv.contact?.first_name, conv.contact?.last_name);
              return (
                <button
                  key={conv.contact_id}
                  onClick={() => selectContact(conv.contact_id)}
                  className="w-full flex items-center px-4 transition-colors text-left"
                  style={{
                    height: 68,
                    background: isActive ? "rgba(201, 150, 58, 0.06)" : "transparent",
                    borderLeft: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mr-3 text-xs font-bold"
                    style={{
                      background: "var(--amber-muted)",
                      color: "var(--amber)",
                    }}
                  >
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--foreground)" }}
                      >
                        {contactName(conv.contact)}
                      </span>
                      <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: "var(--muted-foreground)" }}>
                        {formatDistanceToNow(new Date(conv.created_at), { locale: es, addSuffix: false })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs truncate pr-2" style={{ color: "var(--muted-foreground)" }}>
                        {conv.content}
                      </p>
                      {conv.is_automated && (
                        <span
                          className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight"
                          style={{
                            background: "var(--amber-muted)",
                            color: "var(--amber)",
                          }}
                        >
                          Ava
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* ── CENTER PANEL: Chat ── */}
      <section
        className="flex-1 flex flex-col overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        {!selectedContactId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "var(--muted-foreground)" }}>
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm">Selecciona una conversación</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div
              className="flex items-center justify-between px-6 flex-shrink-0"
              style={{
                height: 64,
                background: "var(--card)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "var(--amber-muted)", color: "var(--amber)" }}
                >
                  {getInitials(selectedContact?.first_name, selectedContact?.last_name)}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                    {contactName(selectedContact)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--emerald)" }}
                    />
                    <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                      {selectedContact?.phone ?? "WhatsApp"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                className="px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                Tomar conversación
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {threadLoading ? (
                <div className="flex items-center justify-center h-full" style={{ color: "var(--muted-foreground)" }}>
                  <p className="text-sm">Cargando mensajes...</p>
                </div>
              ) : threadMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full" style={{ color: "var(--muted-foreground)" }}>
                  <p className="text-sm">No hay mensajes aún.</p>
                </div>
              ) : (
                <>
                  {/* Day separator */}
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    <span
                      className="text-[10px] uppercase tracking-widest font-bold"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {format(new Date(threadMessages[0].created_at), "d MMM yyyy", { locale: es })}
                    </span>
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  </div>

                  {threadMessages.map((msg) => {
                    const isInbound = msg.direction === "inbound";
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[75%] gap-1 ${isInbound ? "items-start self-start" : "items-end self-end"}`}
                      >
                        {!isInbound && msg.is_automated && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest mx-1"
                            style={{ color: "var(--amber)" }}
                          >
                            Ava AI
                          </span>
                        )}
                        <div
                          className={`px-4 py-3 text-sm leading-relaxed ${isInbound ? "rounded-2xl rounded-tl-none" : "rounded-2xl rounded-tr-none"}`}
                          style={
                            isInbound
                              ? {
                                  background: "var(--secondary)",
                                  color: "var(--foreground)",
                                  border: "1px solid var(--border)",
                                }
                              : {
                                  background: "var(--card)",
                                  color: "var(--foreground)",
                                  border: "1px solid var(--border)",
                                  boxShadow: msg.is_automated ? "0 0 12px rgba(201,150,58,0.06)" : "none",
                                }
                          }
                        >
                          {msg.content}
                        </div>
                        <span className="text-[10px] mx-1" style={{ color: "var(--muted-foreground)" }}>
                          {format(new Date(msg.created_at), "HH:mm")}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input bar */}
            <div
              className="p-4 flex-shrink-0"
              style={{
                background: "var(--card)",
                borderTop: "1px solid var(--border)",
              }}
            >
              {avaActive ? (
                <button
                  onClick={handleTakeConversation}
                  className="flex items-center gap-3 rounded-xl px-5 py-3 w-full transition-opacity hover:opacity-80"
                  style={{
                    background: "var(--secondary)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                >
                  <Lock className="w-4 h-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
                  <span className="text-sm italic" style={{ color: "var(--muted-foreground)" }}>
                    Ava está activa —{" "}
                    <span style={{ color: "var(--foreground)", fontStyle: "normal", textDecoration: "underline" }}>
                      toma la conversación
                    </span>{" "}
                    para responder manualmente
                  </span>
                </button>
              ) : (
                <WhatsAppComposer
                  contactId={selectedContactId!}
                  phone={selectedContact?.phone ?? ""}
                  onSent={() => setRefreshKey(k => k + 1)}
                />
              )}
            </div>
          </>
        )}
      </section>

      {/* ── RIGHT PANEL: Contact profile ── */}
      <section
        className="flex flex-col flex-shrink-0 overflow-y-auto"
        style={{
          width: 320,
          background: "var(--card)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        {!selectedContact ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: "var(--muted-foreground)" }}>
            <p className="text-xs">Selecciona una conversación</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Profile card */}
            <div
              className="rounded-2xl p-6 flex flex-col items-center text-center"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold mb-3"
                style={{
                  background: "var(--amber-muted)",
                  color: "var(--amber)",
                  border: "2px solid var(--border)",
                }}
              >
                {getInitials(selectedContact.first_name, selectedContact.last_name)}
              </div>
              <h3
                className="text-base font-bold mb-1"
                style={{ fontFamily: "var(--font-manrope, var(--font-display))", color: "var(--foreground)" }}
              >
                {contactName(selectedContact)}
              </h3>
              {selectedContact.phone && (
                <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                  {selectedContact.phone}
                </p>
              )}

              {/* Classification badge */}
              {selectedContact.lead_classification && (
                <span
                  className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{
                    background: "var(--amber-muted)",
                    color: "var(--amber)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {CLASSIFICATION_LABELS[selectedContact.lead_classification as keyof typeof CLASSIFICATION_LABELS] ?? selectedContact.lead_classification}
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="space-y-2">
              <p
                className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3"
                style={{ color: "var(--muted-foreground)" }}
              >
                Actividad
              </p>
              <div
                className="flex justify-between items-center text-sm py-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <span style={{ color: "var(--muted-foreground)" }}>Mensajes en hilo</span>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                  {threadMessages.length}
                </span>
              </div>
              <div
                className="flex justify-between items-center text-sm py-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <span style={{ color: "var(--muted-foreground)" }}>Último mensaje</span>
                <span className="font-mono text-xs" style={{ color: "var(--foreground)" }}>
                  {selectedConv
                    ? formatDistanceToNow(new Date(selectedConv.created_at), { locale: es, addSuffix: true })
                    : "—"}
                </span>
              </div>
            </div>

            {/* Recent thread preview */}
            {threadMessages.length > 0 && (
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Últimos mensajes
                </p>
                <div className="space-y-4 relative ml-2">
                  <div
                    className="absolute left-[3px] top-1 bottom-1 w-px"
                    style={{ background: "var(--border)" }}
                  />
                  {threadMessages.slice(-3).map((msg) => (
                    <div key={msg.id} className="relative pl-5">
                      <div
                        className="absolute left-0 top-1.5 w-[7px] h-[7px] rounded-full"
                        style={{
                          background: msg.is_automated ? "var(--amber)" : "var(--muted-foreground)",
                          boxShadow: msg.is_automated ? "0 0 8px var(--amber-muted)" : "none",
                        }}
                      />
                      <p className="text-xs font-medium truncate" style={{ color: "var(--foreground)" }}>
                        {msg.content.slice(0, 60)}{msg.content.length > 60 ? "…" : ""}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                        {format(new Date(msg.created_at), "HH:mm")} ·{" "}
                        {msg.is_automated ? "Ava" : msg.direction === "inbound" ? "Contacto" : "Agente"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
