"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { X } from "lucide-react";

interface EditableContact {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  lead_classification?: string | null;
  lead_status?: string | null;
  source?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_currency?: string | null;
  agent_notes?: string | null;
}

const FIELD_STYLE = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--glass-bg)",
  border: "1px solid var(--glass-border)",
  color: "var(--foreground)",
  outline: "none",
  boxSizing: "border-box" as const,
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>
      {children}
    </p>
  );
}

export function ContactEditButton({ contact }: { contact: EditableContact }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    lead_classification: contact.lead_classification ?? "warm",
    lead_status: contact.lead_status ?? "new",
    source: contact.source ?? "other",
    budget_min: contact.budget_min?.toString() ?? "",
    budget_max: contact.budget_max?.toString() ?? "",
    budget_currency: contact.budget_currency ?? "USD",
    agent_notes: contact.agent_notes ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.first_name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .update({
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        lead_classification: form.lead_classification,
        lead_status: form.lead_status,
        source: form.source,
        budget_min: form.budget_min ? parseFloat(form.budget_min) : null,
        budget_max: form.budget_max ? parseFloat(form.budget_max) : null,
        budget_currency: form.budget_currency,
        agent_notes: form.agent_notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id);

    if (error) {
      toast.error("Error al guardar: " + error.message);
      setSaving(false);
      return;
    }

    toast.success("Contacto actualizado");
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all hover:brightness-95"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        Editar
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
          {/* Backdrop */}
          <div
            onClick={() => !saving && setOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }}
          />

          {/* Panel */}
          <div
            style={{
              position: "relative", zIndex: 1,
              width: 480, maxWidth: "92vw", height: "100vh",
              background: "var(--background)", borderLeft: "1px solid var(--glass-bg-md)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 28px 20px", borderBottom: "1px solid var(--glass-bg-md)" }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)", margin: 0, fontFamily: "Manrope, sans-serif" }}>
                Editar contacto
              </h2>
              <button onClick={() => !saving && setOpen(false)} style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Name */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Label>Nombre</Label>
                    <input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="Nombre" style={FIELD_STYLE} />
                  </div>
                  <div>
                    <Label>Apellido</Label>
                    <input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Apellido" style={FIELD_STYLE} />
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <Label>Teléfono / WhatsApp</Label>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 829 000 0000" style={FIELD_STYLE} />
                </div>
                <div>
                  <Label>Email</Label>
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="correo@ejemplo.com" style={FIELD_STYLE} />
                </div>

                {/* Classification + Status */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Label>Clasificación</Label>
                    <select value={form.lead_classification} onChange={(e) => set("lead_classification", e.target.value)} style={FIELD_STYLE}>
                      <option value="hot">🔥 Caliente</option>
                      <option value="warm">Warm</option>
                      <option value="cold">❄️ Frío</option>
                    </select>
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <select value={form.lead_status} onChange={(e) => set("lead_status", e.target.value)} style={FIELD_STYLE}>
                      <option value="new">Nuevo</option>
                      <option value="contacted">Contactado</option>
                      <option value="qualified">Calificado</option>
                      <option value="unqualified">No calificado</option>
                      <option value="nurturing">Nutriendo</option>
                      <option value="archived">Archivado</option>
                    </select>
                  </div>
                </div>

                {/* Source */}
                <div>
                  <Label>Origen del lead</Label>
                  <select value={form.source} onChange={(e) => set("source", e.target.value)} style={FIELD_STYLE}>
                    <option value="ctwa_ad">Anuncio CTWA</option>
                    <option value="lead_form">Formulario</option>
                    <option value="referral">Referido</option>
                    <option value="walk_in">Walk-in</option>
                    <option value="website">Sitio web</option>
                    <option value="social_media">Redes sociales</option>
                    <option value="other">Otro</option>
                  </select>
                </div>

                {/* Budget */}
                <div>
                  <Label>Presupuesto</Label>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 8 }}>
                    <select value={form.budget_currency} onChange={(e) => set("budget_currency", e.target.value)} style={FIELD_STYLE}>
                      <option value="USD">USD</option>
                      <option value="DOP">RD$</option>
                    </select>
                    <input type="number" value={form.budget_min} onChange={(e) => set("budget_min", e.target.value)} placeholder="Mínimo" style={FIELD_STYLE} />
                    <input type="number" value={form.budget_max} onChange={(e) => set("budget_max", e.target.value)} placeholder="Máximo" style={FIELD_STYLE} />
                  </div>
                </div>

                {/* Agent notes */}
                <div>
                  <Label>Notas del agente</Label>
                  <textarea
                    value={form.agent_notes}
                    onChange={(e) => set("agent_notes", e.target.value)}
                    rows={4}
                    placeholder="Notas privadas sobre este contacto…"
                    style={{ ...FIELD_STYLE, resize: "none" as const }}
                  />
                </div>

              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 28px 28px", borderTop: "1px solid var(--glass-bg-md)", display: "flex", gap: 10 }}>
              <button
                onClick={() => !saving && setOpen(false)}
                style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "var(--glass-bg)", color: "var(--muted-foreground)", border: "1px solid var(--glass-border)" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 2, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer", background: "#C9963A", color: "var(--primary-foreground)", border: "none", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
