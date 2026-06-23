"use client";

/**
 * Full-page editor layout — replaces the right-side drawer/sheet editors.
 * Header with back navigation + title, scrollable body, and a sticky bottom
 * action bar (Cancelar / Guardar) reachable on mobile without scrolling.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function FormShell({
  title,
  subtitle,
  backHref,
  onSubmit,
  saving,
  saveLabel = "Guardar cambios",
  children,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  onSubmit: () => void;
  saving: boolean;
  saveLabel?: string;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) onSubmit();
      }}
      style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 96 }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0 24px" }}>
        <Link
          href={backHref}
          aria-label="Volver"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: 10,
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            color: "var(--foreground)",
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--foreground)",
              margin: 0,
              fontFamily: "var(--font-serif), Manrope, sans-serif",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "4px 0 0" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>{children}</div>

      {/* Sticky action bar */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "14px 20px",
          background: "var(--bg-header)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--glass-border)",
          display: "flex",
          justifyContent: "center",
          gap: 12,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 720 }}>
          <Link
            href={backHref}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "11px 16px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              minHeight: 44,
              background: "var(--glass-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--glass-border)",
              textDecoration: "none",
            }}
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 2,
              padding: "11px 16px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              minHeight: 44,
              cursor: saving ? "wait" : "pointer",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              border: "none",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Guardando…" : saveLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Visually grouped section of fields with a heading. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--card)",
        border: "1px solid var(--glass-border)",
        borderRadius: 14,
        padding: "20px 22px",
      }}
    >
      <h2
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--foreground)",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </h2>
      {description && (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 0" }}>
          {description}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
        {children}
      </div>
    </section>
  );
}
