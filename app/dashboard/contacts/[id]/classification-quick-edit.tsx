"use client";

/**
 * Quick-edit for the lead classification badge on the contact detail header.
 * Lets the agent flip hot/warm/cold (or back to "Sin calificar") without opening
 * the full editor. Respects the B-17 freeze contract:
 *   - picking a temperature (hot/warm/cold) → qualification_source='manual' (freeze)
 *   - picking "Sin calificar" (unqualified)  → qualification_source='auto' (gate-managed)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { LeadClassification } from "@/lib/types";

type Choice = "hot" | "warm" | "cold" | "unqualified";

const STYLES: Record<string, { bg: string; color: string; border: string; label: string }> = {
  hot: { bg: "rgba(16,185,129,0.12)", color: "#10b981", border: "rgba(16,185,129,0.25)", label: "Lead Caliente" },
  warm: { bg: "rgba(251,146,60,0.12)", color: "#fb923c", border: "rgba(251,146,60,0.25)", label: "Warm Lead" },
  cold: { bg: "rgba(129,140,248,0.12)", color: "#818cf8", border: "rgba(129,140,248,0.25)", label: "Lead Frío" },
  unqualified: { bg: "var(--glass-bg)", color: "var(--muted-foreground)", border: "var(--glass-border-md)", label: "Sin calificar" },
};

const OPTS: { value: Choice; label: string }[] = [
  { value: "hot", label: "Caliente (HOT)" },
  { value: "warm", label: "Templado (WARM)" },
  { value: "cold", label: "Frío (COLD)" },
  { value: "unqualified", label: "Sin calificar" },
];

export function ClassificationQuickEdit({
  contactId,
  classification,
}: {
  contactId: string;
  classification?: LeadClassification;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = (classification as string) || "unqualified";
  const style = STYLES[current] ?? STYLES.unqualified;

  async function pick(choice: Choice) {
    setOpen(false);
    if (choice === current) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .update({
        lead_classification: choice,
        // Temperature is a manual decision → freeze. "Sin calificar" hands the
        // row back to the auto-qualification gate.
        qualification_source: choice === "unqualified" ? "auto" : "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contactId);
    setSaving(false);
    if (error) {
      toast.error("Error al cambiar clasificación: " + error.message);
      return;
    }
    toast.success("Clasificación actualizada");
    router.refresh();
  }

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border transition-opacity hover:opacity-85"
        style={{ background: style.bg, color: style.color, borderColor: style.border, cursor: saving ? "wait" : "pointer" }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {style.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            role="listbox"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 50,
              minWidth: 180,
              padding: 6,
              borderRadius: 12,
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            {OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === current}
                onClick={() => pick(o.value)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
                style={{ color: "var(--foreground)", textAlign: "left" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: (STYLES[o.value] ?? STYLES.unqualified).color, flexShrink: 0 }} />
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
