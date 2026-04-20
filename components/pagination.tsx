"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  basePath: string;
  filterParams?: Record<string, string>;
}

export function Pagination({ currentPage, totalCount, pageSize, basePath, filterParams }: PaginationProps) {
  function buildHref(page: number) {
    const p = new URLSearchParams(filterParams ?? {});
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }
  const totalPages = Math.ceil(totalCount / pageSize);
  if (totalPages <= 1) return null;

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);

  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  const btnBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 32, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 600,
    fontFamily: "Inter, sans-serif", textDecoration: "none", transition: "all 0.15s",
    border: "1px solid transparent",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", flexWrap: "wrap", gap: 8 }}>
      <span style={{ fontSize: 12, color: "#9A9088", fontFamily: "Inter, sans-serif" }}>
        {from}–{to} de {totalCount}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {currentPage > 1 ? (
          <Link href={buildHref(currentPage - 1)} style={{ ...btnBase, color: "#9A9088", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ChevronLeft className="w-4 h-4" />
          </Link>
        ) : (
          <span style={{ ...btnBase, color: "rgba(154,144,136,0.3)", border: "1px solid rgba(255,255,255,0.04)", cursor: "default" }}>
            <ChevronLeft className="w-4 h-4" />
          </span>
        )}

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} style={{ ...btnBase, color: "#9A9088", cursor: "default" }}>…</span>
          ) : (
            <Link
              key={p}
              href={buildHref(p)}
              style={{
                ...btnBase,
                background: p === currentPage ? "#C9963A" : "transparent",
                color: p === currentPage ? "#0D0E12" : "#9A9088",
                border: p === currentPage ? "1px solid #C9963A" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {p}
            </Link>
          )
        )}

        {currentPage < totalPages ? (
          <Link href={buildHref(currentPage + 1)} style={{ ...btnBase, color: "#9A9088", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ChevronRight className="w-4 h-4" />
          </Link>
        ) : (
          <span style={{ ...btnBase, color: "rgba(154,144,136,0.3)", border: "1px solid rgba(255,255,255,0.04)", cursor: "default" }}>
            <ChevronRight className="w-4 h-4" />
          </span>
        )}
      </div>
    </div>
  );
}
