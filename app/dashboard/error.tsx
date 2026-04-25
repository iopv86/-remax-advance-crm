"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard Error Boundary]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "var(--glass-bg-md)",
          border: "1px solid rgba(201,150,58,0.15)",
          borderRadius: 20,
          padding: "48px 40px",
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(244,63,94,0.12)",
            border: "1px solid rgba(244,63,94,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: 22,
          }}
        >
          ⚠
        </div>

        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "#C9963A",
            margin: "0 0 8px",
          }}
        >
          Error de página
        </p>

        <h2
          style={{
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "-0.02em",
            color: "var(--foreground)",
            margin: "0 0 12px",
          }}
        >
          Algo salió mal
        </h2>

        <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "0 0 28px", lineHeight: 1.6 }}>
          Esta página encontró un error inesperado. Puedes intentar recargarla o volver al inicio.
        </p>

        {(error.message || error.digest) && (
          <p style={{ fontSize: 10, color: "var(--muted-foreground)", margin: "0 0 20px", fontFamily: "monospace", wordBreak: "break-all" }}>
            {error.message || error.digest}
          </p>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              background: "#C9963A",
              color: "var(--primary-foreground)",
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 24px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
          <a
            href="/dashboard"
            style={{
              background: "var(--glass-bg-md)",
              color: "var(--foreground)",
              fontWeight: 600,
              fontSize: 13,
              padding: "10px 24px",
              borderRadius: 10,
              border: "1px solid var(--glass-border)",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
