"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { inviteAgent } from "@/app/dashboard/settings/actions";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InviteAgentDialog({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteAgent(email, fullName);
      if (result.ok) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setEmail("");
          setFullName("");
          onClose();
        }, 1500);
      } else {
        setError(result.error ?? "Error desconocido");
      }
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg hover:opacity-70"
          style={{ color: "var(--muted-foreground)" }}
        >
          <X className="w-5 h-5" />
        </button>

        <h2
          className="text-lg font-semibold mb-6"
          style={{ color: "var(--foreground)" }}
        >
          Invitar agente
        </h2>

        {success ? (
          <p
            className="text-center py-4"
            style={{ color: "var(--emerald)" }}
          >
            Invitación enviada
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs uppercase tracking-widest mb-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Nombre completo
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ana García"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none"
                style={{
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
                required
              />
            </div>
            <div>
              <label
                className="block text-xs uppercase tracking-widest mb-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agente@advanceestate.com"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none"
                style={{
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
                required
              />
            </div>
            {error && (
              <p className="text-sm" style={{ color: "var(--destructive)" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="w-full h-11 rounded-lg font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--amber)", color: "var(--background)" }}
            >
              {isPending ? "Enviando..." : "Enviar invitación"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
