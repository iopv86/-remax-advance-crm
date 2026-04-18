"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { Search, Lock, MessageSquare, ExternalLink, ArrowRight } from "lucide-react";
import Link from "next/link";
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
  const [assignedAgent, setAssignedAgent] = useState<{ full_name: string | null } | null>(null);
  const [contactDeals, setContactDeals] = useState<{ id: string; stage: string; deal_value: number | null; currency: string | null }[]>([]);
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

  // Fetch assigned agent + deals for the selected contact
  useEffect(() => {
    if (!selectedContactId) {
      setAssignedAgent(null);
      setContactDeals([]);
      return;
    }
    (async () => {
      const { data: contact } = await supabase
        .from("contacts")
        .select("assigned_agent_id")
        .eq("id", selectedContactId)
        .single();

      if (contact?.assigned_agent_id) {
        const { data: agent } = await supabase
          .from("agents")
          .select("full_name")
          .eq("id", contact.assigned_agent_id)
          .single();
        setAssignedAgent(agent);
      } else {
        setAssignedAgent(null);
      }

      const { data: deals } = await supabase
        .from("deals")
        .select("id, stage, deal_value, currency")
        .eq("contact_id", selectedContactId)
        .order("created_at", { ascending: false })
        .limit(5);
      setContactDeals((deals ?? []) as { id: string; stage: string; deal_value: number | null; currency: string | null }[]);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const FILTER_TABS: { key: Filter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "ava", label: "Ava activa" },
    { key: "tomado", label: "Tomado" },
    { key: "sin_respuesta", label: "Sin respuesta" },
  ];

  return (
    <div className="flex overflow-hidden" style={{ height: "100vh" }}>
      {/* ── LEFT PANEL: Conversation list ── */}
      <section
        className="flex flex-col flex-shrink-0 border-r"
        style={{
          width: 280,
          background: "#14151C",
          borderColor: "rgba(79,69,55,0.1)",
        }}
      >
        {/* Header */}
        <div className="p-5 flex-shrink-0">
          <h1 className="text-[18px] font-bold mb-4 text-white font-headline">
            Conversaciones
          </h1>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9899A8]" />
            <input
              type="text"
              placeholder="Buscar chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg pl-9 py-2 text-xs outline-none focus:ring-1 focus:ring-[#f5bd5d] text-[#e5e2e1]"
              style={{
                background: "#0e0e0e",
                border: "none",
              }}
            />
          </div>

          {/* Filter tabs */}
          <div
            className="flex gap-4 pb-2 overflow-x-auto"
            style={{ borderBottom: "1px solid rgba(79,69,55,0.1)" }}
          >
            {FILTER_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className="text-xs font-medium whitespace-nowrap pb-2 transition-colors"
                style={{
                  color: filter === key ? "#f5bd5d" : "#9899A8",
                  borderBottom: filter === key ? "2px solid #f5bd5d" : "2px solid transparent",
                  fontWeight: filter === key ? 600 : 500,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-xs text-[#545567]">
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
                  className="w-full flex items-center px-4 transition-colors text-left hover:bg-[#1C1D27]/50"
                  style={{
                    height: 68,
                    background: isActive ? "#1C1D27" : "transparent",
                    borderLeft: isActive ? "2px solid #f5bd5d" : "2px solid transparent",
                  }}
                >
                  {/* Avatar with initials */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mr-3 text-xs font-bold relative"
                    style={{
                      background: "rgba(201,150,58,0.15)",
                      color: "#C9963A",
                    }}
                  >
                    {initials}
                    {/* Online dot */}
                    <span
                      className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                      style={{
                        background: "#22c55e",
                        borderColor: isActive ? "#1C1D27" : "#14151C",
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-sm font-medium truncate text-white">
                        {contactName(conv.contact)}
                      </span>
                      <span className="text-[11px] flex-shrink-0 ml-2 text-[#545567]">
                        {formatDistanceToNow(new Date(conv.created_at), { locale: es, addSuffix: false })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-[12px] truncate pr-2 text-[#9899A8]">
                        {conv.content}
                      </p>
                      {conv.is_automated ? (
                        <span
                          className="flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-tighter"
                          style={{
                            background: "#22242F",
                            color: "#C9963A",
                          }}
                        >
                          Ava
                        </span>
                      ) : (
                        conv.direction === "inbound" && (
                          <span
                            className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{
                              background: "#C9963A",
                              color: "#281900",
                            }}
                          >
                            1
                          </span>
                        )
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
        style={{ background: "#0D0E12" }}
      >
        {!selectedContactId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#545567]">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p className="text-sm">Selecciona una conversación</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div
              className="flex items-center justify-between px-8 flex-shrink-0 z-10 backdrop-blur-md border-b"
              style={{
                height: 64,
                background: "rgba(13,14,18,0.9)",
                borderColor: "rgba(79,69,55,0.1)",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: "rgba(201,150,58,0.15)", color: "#C9963A" }}
                >
                  {getInitials(selectedContact?.first_name, selectedContact?.last_name)}
                </div>
                <div>
                  <p className="font-semibold text-white font-headline">
                    {contactName(selectedContact)}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[11px] text-[#9899A8]">
                      En línea — WhatsApp
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {avaActive && (
                  <button
                    onClick={handleTakeConversation}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(201,150,58,0.3)]"
                    style={{
                      background: "#f5bd5d",
                      color: "#281900",
                    }}
                  >
                    Tomar conversación
                  </button>
                )}
                {!avaActive && (
                  <span className="text-xs text-green-500 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4" />
                    Modo manual
                  </span>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
              {threadLoading ? (
                <div className="flex items-center justify-center h-full text-[#545567]">
                  <p className="text-sm">Cargando mensajes...</p>
                </div>
              ) : threadMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[#545567]">
                  <p className="text-sm">No hay mensajes aún.</p>
                </div>
              ) : (
                <>
                  {/* Day separator */}
                  <div className="flex items-center gap-4 py-4">
                    <div className="flex-1 h-[1px]" style={{ background: "rgba(79,69,55,0.1)" }} />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#545567]">
                      {format(new Date(threadMessages[0].created_at), "d MMM yyyy", { locale: es })}
                    </span>
                    <div className="flex-1 h-[1px]" style={{ background: "rgba(79,69,55,0.1)" }} />
                  </div>

                  {threadMessages.map((msg) => {
                    const isInbound = msg.direction === "inbound";
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[80%] gap-1 ${
                          isInbound ? "items-end self-end" : "items-start self-start"
                        }`}
                      >
                        {!isInbound && msg.is_automated && (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#f5bd5d] mb-1 ml-1">
                            Ava AI
                          </span>
                        )}
                        <div
                          className={`px-4 py-3 text-sm leading-relaxed text-[#e5e2e1] ${
                            isInbound
                              ? "rounded-2xl rounded-tr-none"
                              : "rounded-2xl rounded-tl-none"
                          }`}
                          style={
                            isInbound
                              ? {
                                  background: "#22242F",
                                  border: "1px solid rgba(79,69,55,0.1)",
                                }
                              : {
                                  background: "#1C1D27",
                                  border: "1px solid rgba(245,189,93,0.1)",
                                  boxShadow: msg.is_automated
                                    ? "0 0 15px rgba(201,150,58,0.04)"
                                    : "none",
                                }
                          }
                        >
                          {msg.content}
                        </div>
                        <span
                          className={`text-[10px] text-[#545567] ${isInbound ? "mr-1" : "ml-1"}`}
                        >
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
              className="p-6 flex-shrink-0 border-t"
              style={{
                background: "#0D0E12",
                borderColor: "rgba(79,69,55,0.1)",
              }}
            >
              {avaActive ? (
                <button
                  onClick={handleTakeConversation}
                  className="flex items-center gap-4 rounded-xl px-6 py-4 w-full transition-all group hover:bg-[#0e0e0e]"
                  style={{
                    background: "rgba(14,14,14,0.5)",
                    border: "1px solid rgba(79,69,55,0.2)",
                    cursor: "pointer",
                  }}
                >
                  <Lock className="w-4 h-4 flex-shrink-0 text-[#545567] group-hover:text-[#f5bd5d] transition-colors" />
                  <span className="text-sm italic text-[#545567] flex-1 text-left">
                    Ava está activa —{" "}
                    <span className="text-[#e5e2e1] not-italic underline">
                      toma la conversación
                    </span>{" "}
                    para responder manualmente
                  </span>
                </button>
              ) : (
                <WhatsAppComposer
                  contactId={selectedContactId!}
                  phone={selectedContact?.phone ?? ""}
                  onSent={() => setRefreshKey((k) => k + 1)}
                />
              )}
            </div>
          </>
        )}
      </section>

      {/* ── RIGHT PANEL: Contact profile ── */}
      <section
        className="flex flex-col flex-shrink-0 overflow-y-auto border-l"
        style={{
          width: 320,
          background: "#14151C",
          borderColor: "rgba(79,69,55,0.1)",
        }}
      >
        {!selectedContact ? (
          <div className="flex flex-col items-center justify-center h-full text-[#545567]">
            <p className="text-xs">Selecciona una conversación</p>
          </div>
        ) : (
          <div className="p-6">
            {/* Profile glass card */}
            <div
              className="rounded-2xl p-6 flex flex-col items-center text-center mb-8 border"
              style={{
                background: "rgba(20,21,28,0.6)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderColor: "rgba(79,69,55,0.1)",
              }}
            >
              {/* Avatar */}
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4 border-2 p-1"
                style={{
                  background: "rgba(201,150,58,0.15)",
                  color: "#C9963A",
                  borderColor: "rgba(245,189,93,0.2)",
                }}
              >
                {getInitials(selectedContact.first_name, selectedContact.last_name)}
              </div>

              <h3 className="text-lg font-bold text-white mb-1 font-headline">
                {contactName(selectedContact)}
              </h3>
              {selectedContact.phone && (
                <p className="text-xs text-[#9899A8] mb-2">{selectedContact.phone}</p>
              )}

              {/* Profile link */}
              {selectedContact.id && (
                <Link
                  href={`/dashboard/contacts/${selectedContact.id}`}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest mb-4 transition-opacity hover:opacity-70"
                  style={{ color: "#C9963A" }}
                >
                  Ver perfil completo
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              )}

              {/* Badges */}
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {/* Source badge */}
                <span
                  className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border"
                  style={{
                    background: "rgba(0,59,92,0.4)",
                    color: "#5DADE2",
                    borderColor: "rgba(93,173,226,0.2)",
                  }}
                >
                  WhatsApp
                </span>

                {/* Classification / score badge */}
                {selectedContact.lead_classification && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border flex items-center gap-1"
                    style={{
                      background: "rgba(245,189,93,0.1)",
                      color: "#f5bd5d",
                      borderColor: "rgba(245,189,93,0.2)",
                    }}
                  >
                    {CLASSIFICATION_LABELS[selectedContact.lead_classification as keyof typeof CLASSIFICATION_LABELS] ?? selectedContact.lead_classification}
                  </span>
                )}
              </div>

              <div className="w-full h-[1px] mb-6" style={{ background: "rgba(79,69,55,0.1)" }} />

              {/* Interests / quick stats */}
              <div className="w-full space-y-3 text-left">
                <p className="text-[11px] uppercase tracking-widest font-bold text-[#545567]">
                  Actividad
                </p>
                <div className="flex flex-wrap gap-2">
                  <span
                    className="text-[10px] px-2 py-1 rounded"
                    style={{ background: "#22242F", color: "#9899A8" }}
                  >
                    {threadMessages.length} mensajes
                  </span>
                  {selectedConv && (
                    <span
                      className="text-[10px] px-2 py-1 rounded"
                      style={{ background: "#22242F", color: "#9899A8" }}
                    >
                      {formatDistanceToNow(new Date(selectedConv.created_at), { locale: es, addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Assigned agent section */}
            <div className="mb-6">
              <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#545567] mb-4">
                Agente Asignado
              </h4>
              <div
                className="flex items-center gap-3 p-3 rounded-xl border"
                style={{
                  background: "#1C1D27",
                  borderColor: "rgba(79,69,55,0.1)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: "rgba(201,150,58,0.15)", color: "#C9963A" }}
                >
                  {assignedAgent?.full_name?.[0]?.toUpperCase() ?? "—"}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#e5e2e1]">
                    {assignedAgent?.full_name ?? "Sin asignar"}
                  </p>
                  <p className="text-[10px] text-[#9899A8]">RE/MAX Advance</p>
                </div>
              </div>
            </div>

            {/* Deals section */}
            {contactDeals.length > 0 && (
              <div className="mb-8">
                <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#545567] mb-4">
                  Oportunidades
                </h4>
                <div className="space-y-2">
                  {contactDeals.map((deal) => (
                    <Link
                      key={deal.id}
                      href={`/dashboard/pipeline/${deal.id}`}
                      className="flex items-center justify-between p-3 rounded-xl border group transition-colors hover:border-[rgba(201,150,58,0.3)]"
                      style={{
                        background: "#1C1D27",
                        borderColor: "rgba(79,69,55,0.1)",
                        textDecoration: "none",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#e5e2e1] truncate capitalize">
                          {deal.stage.replace(/_/g, " ")}
                        </p>
                        {deal.deal_value && (
                          <p className="text-[10px] text-[#9899A8]">
                            {deal.currency ?? "USD"} {deal.deal_value.toLocaleString("es-DO")}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#545567] flex-shrink-0 ml-2 group-hover:text-[#C9963A] transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {threadMessages.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#545567] mb-6">
                  Actividad Reciente
                </h4>
                <div className="space-y-6 relative ml-2">
                  <div
                    className="absolute left-[3px] top-1 bottom-1 w-[1px]"
                    style={{ background: "rgba(79,69,55,0.2)" }}
                  />
                  {threadMessages.slice(-3).map((msg) => (
                    <div key={msg.id} className="relative pl-6">
                      <div
                        className="absolute left-0 top-1 w-[7px] h-[7px] rounded-full"
                        style={{
                          background: msg.is_automated ? "#f5bd5d" : "#4f4537",
                          boxShadow: msg.is_automated
                            ? "0 0 8px rgba(201,150,58,0.4)"
                            : "none",
                        }}
                      />
                      <p className="text-xs text-[#e5e2e1] font-medium truncate">
                        {msg.content.slice(0, 60)}{msg.content.length > 60 ? "…" : ""}
                      </p>
                      <p className="text-[10px] text-[#545567]">
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
