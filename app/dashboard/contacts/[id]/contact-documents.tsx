"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Upload, FileText, FileImage, File, Trash2, Download, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContactDocument {
  id: string;
  contact_id: string;
  agent_id: string;
  name: string;
  doc_type: string;
  file_url: string;
  file_size?: number;
  mime_type?: string;
  created_at: string;
}

const DOC_TYPES = [
  { value: "contract", label: "Contrato" },
  { value: "id", label: "Identificación" },
  { value: "proposal", label: "Propuesta" },
  { value: "photo", label: "Foto" },
  { value: "other", label: "Otro" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.value, d.label])
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime?: string }) {
  const style = { width: 20, height: 20 };
  if (!mime) return <File style={style} />;
  if (mime.startsWith("image/")) return <FileImage style={style} />;
  if (mime === "application/pdf") return <FileText style={style} />;
  return <File style={style} />;
}

const GOLD = "var(--primary)";
const BG_SURFACE = "var(--card)";
const BG_ELEVATED = "var(--secondary)";
const TEXT_PRIMARY = "var(--foreground)";
const TEXT_MUTED = "var(--muted-foreground)";
const BORDER_DIM = "rgba(255,255,255,0.06)";

// ─── Component ────────────────────────────────────────────────────────────────

export function ContactDocuments({
  contactId,
  agentId,
  initialDocs,
}: {
  contactId: string;
  agentId: string;
  initialDocs: ContactDocument[];
}) {
  const [docs, setDocs] = useState<ContactDocument[]>(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("other");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg", "image/png", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]);
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  async function uploadFile(file: File) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast.error("Tipo de archivo no permitido. Solo PDF, imágenes, Word y Excel.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("El archivo supera el límite de 10 MB.");
      return;
    }
    setUploading(true);
    const supabase = createClient();

    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${contactId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("contact-documents")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      toast.error("Error al subir: " + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: inserted, error: dbError } = await supabase
      .from("contact_documents")
      .insert({
        contact_id: contactId,
        agent_id: agentId,
        name: file.name,
        doc_type: selectedType,
        file_url: path,  // store storage path, not public URL
        file_size: file.size,
        mime_type: file.type,
      })
      .select("id, contact_id, agent_id, name, doc_type, file_url, file_size, mime_type, created_at")
      .single();

    if (dbError || !inserted) {
      toast.error("Error al guardar: " + (dbError?.message ?? "desconocido"));
      // Clean up uploaded file
      await supabase.storage.from("contact-documents").remove([path]);
      setUploading(false);
      return;
    }

    setDocs((prev) => [inserted as ContactDocument, ...prev]);
    toast.success(`"${file.name}" subido`);
    setUploading(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await uploadFile(file);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadFile(file);
  }

  async function handleDownload(doc: ContactDocument) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("contact-documents")
      .createSignedUrl(doc.file_url, 60);  // 60s expiry
    if (error || !data) {
      toast.error("Error al obtener enlace de descarga");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(doc: ContactDocument) {
    if (!confirm(`¿Eliminar "${doc.name}"?`)) return;
    setDeletingId(doc.id);
    const supabase = createClient();

    const { error: storageError } = await supabase.storage
      .from("contact-documents")
      .remove([doc.file_url]);

    if (storageError) {
      toast.error("Error al eliminar archivo: " + storageError.message);
      setDeletingId(null);
      return;
    }

    const { error: dbError } = await supabase
      .from("contact_documents")
      .delete()
      .eq("id", doc.id);

    if (dbError) {
      toast.error("Error al eliminar registro: " + dbError.message);
      setDeletingId(null);
      return;
    }

    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast.success("Documento eliminado");
    setDeletingId(null);
  }

  return (
    <div style={{ padding: 28 }}>
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? GOLD : "rgba(201,150,58,0.2)"}`,
          borderRadius: 12,
          padding: "28px 24px",
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          background: dragOver ? "rgba(201,150,58,0.05)" : "transparent",
          transition: "all 0.2s",
          marginBottom: 20,
        }}
      >
        <Upload style={{ width: 28, height: 28, color: GOLD, margin: "0 auto 10px", opacity: 0.7 }} />
        {uploading ? (
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>Subiendo…</p>
        ) : (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, margin: "0 0 4px" }}>
              Arrastra un archivo o haz clic para subir
            </p>
            <p style={{ fontSize: 11, color: TEXT_MUTED, margin: 0 }}>
              PDF, imágenes, Word, Excel · Máx. 10 MB
            </p>
          </>
        )}
      </div>

      {/* Type selector + upload trigger */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {DOC_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setSelectedType(t.value)}
            style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
              background: selectedType === t.value ? "rgba(201,150,58,0.15)" : BG_ELEVATED,
              color: selectedType === t.value ? GOLD : TEXT_MUTED,
              outline: selectedType === t.value ? `1px solid rgba(201,150,58,0.3)` : "none",
            }}
          >
            {t.label}
          </button>
        ))}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: TEXT_MUTED }}>
          <File style={{ width: 36, height: 36, margin: "0 auto 10px", opacity: 0.2 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Sin documentos. Sube el primero.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docs.map((doc) => (
            <div
              key={doc.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", background: BG_ELEVATED,
                border: `1px solid ${BORDER_DIM}`, borderRadius: 10,
              }}
            >
              {/* Icon */}
              <div style={{ color: doc.doc_type === "contract" ? GOLD : doc.doc_type === "id" ? "#6366f1" : TEXT_MUTED, flexShrink: 0 }}>
                <FileIcon mime={doc.mime_type} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2, display: "flex", gap: 8 }}>
                  <span
                    style={{
                      padding: "1px 6px", borderRadius: 4, background: "rgba(201,150,58,0.1)", color: GOLD, fontSize: 10, fontWeight: 600,
                    }}
                  >
                    {TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                  </span>
                  {formatBytes(doc.file_size) && <span>{formatBytes(doc.file_size)}</span>}
                  <span>{format(new Date(doc.created_at), "d MMM yyyy", { locale: es })}</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => handleDownload(doc)}
                  title="Descargar"
                  style={{ background: "none", border: `1px solid ${BORDER_DIM}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: TEXT_MUTED, display: "flex", alignItems: "center" }}
                >
                  <Download style={{ width: 13, height: 13 }} />
                </button>
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deletingId === doc.id}
                  title="Eliminar"
                  style={{ background: "none", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "4px 6px", cursor: deletingId === doc.id ? "wait" : "pointer", color: "#ef4444", display: "flex", alignItems: "center" }}
                >
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
