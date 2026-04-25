"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

// ── Design tokens (adaptive — CSS vars) ───────────────────────────────────────
const T = {
  surfaceContainerLow: "var(--secondary)",
  surfaceContainerHigh: "var(--secondary)",
  surfaceContainerHighest: "var(--secondary)",
  outlineVariantFaint: "var(--border)",
  onSurface: "var(--foreground)",
  onSurfaceVariant: "var(--muted-foreground)",
  primary: "var(--primary)",
  primaryContainer: "var(--primary)",
  onPrimaryFixed: "var(--primary-foreground)",
} as const;

interface Props {
  currentClassification?: string;
  currentSearch?: string;
  totalCount: number;
}

const PILLS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  { label: "Leads Calientes", value: "hot" },
  { label: "Warm Leads", value: "warm" },
  { label: "Leads Fríos", value: "cold" },
  { label: "Sin calificar", value: "unqualified" },
];

export function ContactsFilterBar({
  currentClassification,
  currentSearch,
  totalCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createQueryString = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      return params.toString();
    },
    [searchParams]
  );

  function setClassification(val: string) {
    const qs = createQueryString({ classification: val || undefined });
    router.push(`${pathname}?${qs}`);
  }

  function handleSearchChange(val: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const qs = createQueryString({ q: val || undefined });
      router.push(`${pathname}?${qs}`);
    }, 300);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 32,
        overflowX: "auto",
        paddingBottom: 4,
      }}
    >
      {/* Filter pills */}
      {PILLS.map((pill) => {
        const active = (currentClassification ?? "") === pill.value;
        return (
          <button
            key={pill.value}
            onClick={() => setClassification(pill.value)}
            style={{
              padding: "6px 16px",
              borderRadius: 9999,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              whiteSpace: "nowrap" as const,
              transition: "background 150ms ease, color 150ms ease",
              background: active ? T.primaryContainer : T.surfaceContainerHigh,
              color: active ? T.onPrimaryFixed : T.onSurfaceVariant,
            }}
          >
            {pill.label}
          </button>
        );
      })}

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 16,
          background: T.outlineVariantFaint,
          margin: "0 8px",
          flexShrink: 0,
        }}
      />

      {/* More filters */}
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 16px",
          borderRadius: 9999,
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          background: T.surfaceContainerHigh,
          color: T.onSurfaceVariant,
          whiteSpace: "nowrap" as const,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        Más filtros
      </button>

      {/* Push search to far right */}
      <div style={{ flex: 1 }} />

      {/* Search input */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: T.onSurfaceVariant,
            pointerEvents: "none",
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Buscar contactos..."
          defaultValue={currentSearch ?? ""}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{
            width: 240,
            background: T.surfaceContainerLow,
            border: `1px solid rgba(79,69,55,0.20)`,
            borderRadius: 8,
            paddingLeft: 40,
            paddingRight: 16,
            paddingTop: 8,
            paddingBottom: 8,
            fontSize: 14,
            color: T.onSurface,
            outline: "none",
            transition: "border-color 150ms ease, box-shadow 150ms ease",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = T.primary;
            e.target.style.boxShadow = `0 0 0 1px ${T.primary}`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(79,69,55,0.20)";
            e.target.style.boxShadow = "none";
          }}
        />
      </div>
    </div>
  );
}
