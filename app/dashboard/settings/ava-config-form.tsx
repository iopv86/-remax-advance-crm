"use client";

import { useState, useTransition } from "react";
import { Bot, Save, Loader2 } from "lucide-react";
import { saveAvaConfig } from "./actions";
import { toast } from "sonner";

interface AvaConfig {
  ava_name: string;
  agency_name: string;
  agency_tagline: string;
  ava_markets: string;
  ava_custom_instructions: string;
}

interface AvaConfigFormProps {
  initial: AvaConfig;
}

const inputStyle = {
  background: "var(--input)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--foreground)",
  width: "100%",
  outline: "none",
  fontFamily: "var(--font-inter), system-ui, sans-serif",
} as const;

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "var(--muted-foreground)",
  marginBottom: 6,
};

export function AvaConfigForm({ initial }: AvaConfigFormProps) {
  const [form, setForm] = useState<AvaConfig>(initial);
  const [isPending, startTransition] = useTransition();

  function handleChange(field: keyof AvaConfig, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveAvaConfig(form);
      if (result.ok) {
        toast.success("Configuración de Ava guardada");
      } else {
        toast.error("Error al guardar: " + result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle}>Nombre de Ava</label>
          <input
            style={inputStyle}
            value={form.ava_name}
            onChange={(e) => handleChange("ava_name", e.target.value)}
            placeholder="Ava"
            maxLength={50}
          />
        </div>
        <div>
          <label style={labelStyle}>Nombre de la Agencia</label>
          <input
            style={inputStyle}
            value={form.agency_name}
            onChange={(e) => handleChange("agency_name", e.target.value)}
            placeholder="Advance Estate"
            maxLength={100}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Tagline de la Agencia</label>
        <input
          style={inputStyle}
          value={form.agency_tagline}
          onChange={(e) => handleChange("agency_tagline", e.target.value)}
          placeholder="República Dominicana"
          maxLength={100}
        />
      </div>

      <div>
        <label style={labelStyle}>Mercados principales</label>
        <textarea
          style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
          value={form.ava_markets}
          onChange={(e) => handleChange("ava_markets", e.target.value)}
          placeholder="Santo Domingo: Piantini, Naco..."
          maxLength={2000}
        />
        <p className="font-sans text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
          Un mercado por línea, p.ej. &quot;Santiago: Los Jardines, Urbanización&quot;
        </p>
      </div>

      <div>
        <label style={labelStyle}>Instrucciones adicionales para Ava</label>
        <textarea
          style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
          value={form.ava_custom_instructions}
          onChange={(e) => handleChange("ava_custom_instructions", e.target.value)}
          placeholder="Ej: Siempre mencionar la promotora X. Especialidad en apartamentos sobre plano..."
          maxLength={1000}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-sans font-medium text-white transition-all"
        style={{
          background: isPending ? "var(--muted)" : "var(--primary)",
          cursor: isPending ? "not-allowed" : "pointer",
        }}
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {isPending ? "Guardando…" : "Guardar configuración"}
      </button>
    </form>
  );
}
