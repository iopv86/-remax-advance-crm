"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Pencil, Trash2, CheckCircle, Clock } from "lucide-react";

interface WaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  content: string;
  variables?: string[] | null;
  wa_template_id?: string | null;
  is_approved: boolean;
  created_at: string;
}

const GOLD = "var(--primary)";
const BG_PAGE = "var(--background)";
const BG_CARD = "var(--card)";
const BG_ELEVATED = "var(--secondary)";
const TEXT_PRIMARY = "var(--foreground)";
const TEXT_MUTED = "var(--muted-foreground)";
const BORDER = "rgba(255,255,255,0.06)";

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
];

const EMPTY_FORM = {
  name: "",
  category: "MARKETING",
  language: "es",
  content: "",
  variables: "",
  wa_template_id: "",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: 6 }}>
      {children}
    </p>
  );
}

const INPUT = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 13,
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${BORDER}`,
  color: TEXT_PRIMARY,
  outline: "none",
  boxSizing: "border-box" as const,
};

export function TemplatesClient({ initialTemplates }: { initialTemplates: WaTemplate[] }) {
  const [templates, setTemplates] = useState<WaTemplate[]>(initialTemplates);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WaTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(t: WaTemplate) {
    setEditing(t);
    setForm({
      name: t.name,
      category: t.category,
      language: t.language,
      content: t.content,
      variables: (t.variables ?? []).join(", "),
      wa_template_id: t.wa_template_id ?? "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    if (!form.content.trim()) { toast.error("El contenido es requerido"); return; }

    setSaving(true);
    const supabase = createClient();

    const variables = form.variables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      category: form.category,
      language: form.language,
      content: form.content.trim(),
      variables: variables.length > 0 ? variables : null,
      wa_template_id: form.wa_template_id.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from("whatsapp_templates").update(payload).eq("id", editing.id);
      if (error) { toast.error("Error: " + error.message); setSaving(false); return; }
      setTemplates((prev) => prev.map((t) => t.id === editing.id ? { ...t, ...payload } : t));
      toast.success("Plantilla actualizada");
    } else {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .insert({ ...payload, is_approved: false })
        .select()
        .single();
      if (error || !data) { toast.error("Error: " + (error?.message ?? "desconocido")); setSaving(false); return; }
      setTemplates((prev) => [data as WaTemplate, ...prev]);
      toast.success("Plantilla creada");
    }

    setSaving(false);
    closeForm();
  }

  async function handleDelete(t: WaTemplate) {
    if (!confirm(`¿Eliminar plantilla "${t.name}"?`)) return;
    setDeletingId(t.id);
    const supabase = createClient();
    const { error } = await supabase.from("whatsapp_templates").delete().eq("id", t.id);
    if (error) { toast.error("Error al eliminar: " + error.message); setDeletingId(null); return; }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    toast.success("Plantilla eliminada");
    setDeletingId(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: BG_PAGE }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(13,14,18,0.85)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${BORDER}`, padding: "0 32px", height: 80, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: 22, fontWeight: 700, color: TEXT_PRIMARY, margin: 0 }}>
            Plantillas de WhatsApp
          </h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "2px 0 0" }}>
            {templates.length} plantilla{templates.length !== 1 ? "s" : ""} · aprobadas por Meta
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "rgba(201,150,58,0.12)", color: GOLD, border: "1px solid rgba(201,150,58,0.25)" }}
        >
          <Plus size={14} /> Nueva plantilla
        </button>
      </header>

      <div style={{ padding: "28px 32px" }}>
        {templates.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: TEXT_MUTED }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>💬</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>Sin plantillas todavía.</p>
            <p style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>Crea plantillas pre-aprobadas para enviar con Ava.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {templates.map((t) => (
              <div
                key={t.id}
                style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px" }}
              >
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.name}
                    </p>
                    <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(201,150,58,0.1)", color: GOLD }}>
                        {t.category}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: TEXT_MUTED }}>
                        {LANGUAGES.find((l) => l.value === t.language)?.label ?? t.language}
                      </span>
                      {t.is_approved ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(5,150,105,0.1)", color: "#10b981" }}>
                          <CheckCircle size={9} /> Aprobada
                        </span>
                      ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                          <Clock size={9} /> Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 10 }}>
                    <button
                      onClick={() => openEdit(t)}
                      style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 7px", cursor: "pointer", color: TEXT_MUTED, display: "flex", alignItems: "center" }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={deletingId === t.id}
                      style={{ background: "none", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "4px 7px", cursor: deletingId === t.id ? "wait" : "pointer", color: "#ef4444", display: "flex", alignItems: "center" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Content preview */}
                <p style={{ fontSize: 12, color: TEXT_MUTED, margin: 0, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                  {t.content}
                </p>

                {/* Variables */}
                {(t.variables?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(t.variables ?? []).map((v, i) => (
                      <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}

                {/* Meta ID */}
                {t.wa_template_id && (
                  <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 8, opacity: 0.5 }}>
                    ID Meta: {t.wa_template_id}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form drawer */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={() => !saving && closeForm()} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div style={{ position: "relative", zIndex: 1, width: 480, maxWidth: "92vw", height: "100vh", background: "#0D0E12", borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 26px 18px", borderBottom: `1px solid ${BORDER}` }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, margin: 0, fontFamily: "Manrope, sans-serif" }}>
                {editing ? "Editar plantilla" : "Nueva plantilla"}
              </h2>
              <button onClick={() => !saving && closeForm()} style={{ background: "none", border: "none", color: TEXT_MUTED, cursor: "pointer" }}>
                <X size={17} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                <div>
                  <Label>Nombre interno</Label>
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ej. bienvenida_lead" style={INPUT} />
                  <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4 }}>Solo letras minúsculas, números y guiones bajos.</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Label>Categoría</Label>
                    <select value={form.category} onChange={(e) => set("category", e.target.value)} style={INPUT}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Idioma</Label>
                    <select value={form.language} onChange={(e) => set("language", e.target.value)} style={INPUT}>
                      {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Contenido del mensaje</Label>
                  <textarea
                    value={form.content}
                    onChange={(e) => set("content", e.target.value)}
                    rows={6}
                    placeholder={"Hola {{nombre}}, gracias por contactarnos. Soy {{agente}} de Advance Estate…"}
                    style={{ ...INPUT, resize: "none" as const }}
                  />
                  <p style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4 }}>Usa {`{{variable}}`} para campos dinámicos.</p>
                </div>

                <div>
                  <Label>Variables (separadas por coma)</Label>
                  <input value={form.variables} onChange={(e) => set("variables", e.target.value)} placeholder="nombre, agente, propiedad" style={INPUT} />
                </div>

                <div>
                  <Label>ID de Meta (opcional)</Label>
                  <input value={form.wa_template_id} onChange={(e) => set("wa_template_id", e.target.value)} placeholder="ID de la plantilla aprobada en Meta" style={INPUT} />
                </div>

              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 26px 26px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 10 }}>
              <button onClick={() => !saving && closeForm()} style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,0.05)", color: TEXT_MUTED, border: `1px solid ${BORDER}` }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer", background: GOLD, color: "#0D0E12", border: "none", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear plantilla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
