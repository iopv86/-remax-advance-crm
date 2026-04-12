"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  contactId: string;
  phone: string;
  onSent?: () => void;
}

export function WhatsAppComposer({ contactId, phone, onSent }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed) return;
    setLoading(true);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, phone, content: trimmed }),
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Error al enviar mensaje");
      return;
    }
    toast.success("Mensaje enviado");
    setContent("");
    onSent?.();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className="rounded-[20px] border p-3 flex items-end gap-2"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <textarea
        rows={2}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribe un mensaje de WhatsApp… (Ctrl+Enter para enviar)"
        className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground leading-relaxed"
        disabled={loading}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={loading || !content.trim()}
        title="Enviar (Ctrl+Enter)"
        style={{ background: "#25D366", color: "white", borderRadius: "12px" }}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
