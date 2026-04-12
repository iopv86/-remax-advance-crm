"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative flex items-center gap-3 w-full rounded-2xl px-4 py-3 transition-all duration-200"
      style={{
        background: isDark ? "rgba(244, 63, 94, 0.08)" : "var(--secondary)",
        border: `1px solid ${isDark ? "rgba(244, 63, 94, 0.2)" : "var(--border)"}`,
      }}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300"
        style={{
          background: isDark ? "rgba(244, 63, 94, 0.15)" : "var(--red-muted)",
        }}
      >
        {isDark ? (
          <Sun className="w-4 h-4" style={{ color: "var(--red)" }} />
        ) : (
          <Moon className="w-4 h-4" style={{ color: "var(--red)" }} />
        )}
      </div>

      <div className="flex-1 text-left">
        <p className="font-sans text-sm font-medium text-foreground">
          {isDark ? "Modo Claro" : "Modo Oscuro"}
        </p>
        <p className="font-sans text-xs text-muted-foreground mt-0.5">
          {isDark ? "Cambiar a tema luminoso" : "Cambiar a tema premium oscuro"}
        </p>
      </div>

      {/* Toggle pill */}
      <div
        className="relative w-11 h-6 rounded-full transition-all duration-300 shrink-0"
        style={{ background: isDark ? "var(--red)" : "var(--border)" }}
      >
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300"
          style={{ left: isDark ? "calc(100% - 1.375rem)" : "2px" }}
        />
      </div>
    </button>
  );
}
