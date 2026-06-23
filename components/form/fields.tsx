"use client";

/**
 * Legible, theme-aware form primitives — single source of truth for editor forms.
 * Replaces the old per-component Label helpers that hardcoded `text-slate-500`
 * (≈2.5:1 contrast on the dark #0D0E14 background — failed WCAG AA).
 *
 * Labels use `--secondary-foreground` (#B8B0A4 dark, ≈9:1) — unambiguously AA.
 * Controls use the proven `--glass-bg` / `--glass-border` / `--foreground` tokens.
 */

import type { CSSProperties, ReactNode } from "react";

export const FIELD_STYLE: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 14,
  background: "var(--glass-bg)",
  border: "1px solid var(--glass-border)",
  color: "var(--foreground)",
  outline: "none",
  boxSizing: "border-box",
};

export const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--secondary-foreground)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  marginBottom: 6,
};

/** Labeled wrapper for a single control. */
export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  style,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      <label htmlFor={htmlFor} style={LABEL_STYLE}>
        {label}
        {required && <span style={{ color: "var(--red)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>{hint}</p>
      )}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "date";
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={FIELD_STYLE}
    />
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={FIELD_STYLE}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...FIELD_STYLE, resize: "vertical" }}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function NativeSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={FIELD_STYLE}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Comma/Enter-driven tag input backed by a string[] (e.g. preferred_locations).
 * Adds a tag on Enter or comma; removes the last tag on Backspace when the
 * draft is empty; click a chip's × to remove it.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  draft,
  onDraftChange,
}: {
  id?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  draft: string;
  onDraftChange: (v: string) => void;
}) {
  function commit() {
    const t = draft.trim().replace(/,$/, "").trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    onDraftChange("");
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: value.length ? 8 : 0 }}>
        {value.map((tag) => (
          <span
            key={tag}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              background: "var(--accent)",
              color: "var(--accent-foreground)",
              border: "1px solid var(--border)",
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, lineHeight: 1 }}
              aria-label={`Quitar ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        id={id}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) {
            onDraftChange(v);
            commit();
          } else {
            onDraftChange(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        style={FIELD_STYLE}
      />
    </div>
  );
}
