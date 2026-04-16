"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, Download } from "lucide-react";
import { useCallback, useRef } from "react";

interface Props {
  currentClassification?: string;
  currentSearch?: string;
  totalCount: number;
}

const PILLS = [
  { label: "Todos", value: "" },
  { label: "Leads Calientes", value: "hot" },
  { label: "Warm Leads", value: "warm" },
  { label: "Leads Fríos", value: "cold" },
];

export function ContactsFilterBar({ currentClassification, currentSearch, totalCount }: Props) {
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
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* Filter pills */}
      <div
        className="flex items-center gap-2 p-1.5 rounded-full px-4"
        style={{ background: "var(--muted)" }}
      >
        {PILLS.map((pill) => {
          const active = (currentClassification ?? "") === pill.value;
          return (
            <button
              key={pill.value}
              onClick={() => setClassification(pill.value)}
              className="px-4 py-1.5 text-xs font-semibold rounded-full transition-all"
              style={
                active
                  ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                  : { color: "#64748b" }
              }
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Right: search + sort + export */}
      <div className="flex items-center gap-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            defaultValue={currentSearch ?? ""}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 pr-4 py-1.5 text-sm rounded-lg border-none transition-all"
            style={{
              background: "white",
              color: "#1C1917",
              outline: "none",
              border: "1px solid transparent",
              width: 200,
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
            onBlur={(e) => (e.target.style.borderColor = "transparent")}
          />
        </div>

        <button
          className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:border-slate-200"
          style={{
            color: "#475569",
            background: "white",
            border: "1px solid transparent",
          }}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Última actividad
        </button>

        <button
          className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
          style={{ color: "#94a3b8" }}
        >
          <Download className="w-4 h-4" />
          Exportar
        </button>
      </div>
    </div>
  );
}
