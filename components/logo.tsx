import { cn } from "@/lib/utils";

/**
 * AE Monogram — Option A: bold geometric, flat gold, both letters same plane.
 * A and E in Estate Gold #C9963A, slight overlap, angular/condensed style.
 * Inline SVG, transparent background, works at any size.
 */
function AEMonogram({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* A — Estate Gold, bold, slightly larger */}
      <text
        x="28"
        y="68"
        fontFamily="var(--font-cinzel), Cinzel, Georgia, serif"
        fontWeight="700"
        fontSize="72"
        fill="#C9963A"
        textAnchor="middle"
      >
        A
      </text>
      {/* E — same Estate Gold, bold, slightly smaller, slight overlap with A */}
      <text
        x="58"
        y="68"
        fontFamily="var(--font-cinzel), Cinzel, Georgia, serif"
        fontWeight="700"
        fontSize="62"
        fill="#C9963A"
        textAnchor="middle"
      >
        E
      </text>
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Show monogram only — no wordmark text */
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
  /** "login" renders the stacked lockup for the brand strip */
  variant?: "sidebar" | "login";
}

export function Logo({
  className,
  iconOnly = false,
  size = "md",
  variant = "sidebar",
}: LogoProps) {
  const monogramSize = size === "sm" ? 36 : size === "md" ? 44 : 64;
  const nameSize = size === "sm" ? "13px" : size === "md" ? "16px" : "20px";
  const subSize = size === "sm" ? "9px" : "10px";

  /* ── Login lockup — stacked, centered ─────────────────────────── */
  if (variant === "login") {
    return (
      <div className={cn("flex flex-col items-center gap-5 select-none", className)}>
        <AEMonogram size={88} />
        <div className="flex flex-col items-center" style={{ gap: "2px" }}>
          <span
            style={{
              fontFamily: "var(--font-cinzel), Cinzel, serif",
              fontWeight: 700,
              fontSize: "18px",
              letterSpacing: "0.22em",
              color: "#F5F0E8",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            ADVANCE
          </span>
          <span
            style={{
              fontFamily: "var(--font-cinzel), Cinzel, serif",
              fontWeight: 700,
              fontSize: "18px",
              letterSpacing: "0.22em",
              color: "#C9963A",
              textTransform: "uppercase",
              lineHeight: 1.2,
            }}
          >
            ESTATE
          </span>
          <span
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              fontWeight: 400,
              fontSize: "8px",
              letterSpacing: "0.32em",
              color: "rgba(245, 240, 232, 0.3)",
              textTransform: "uppercase",
              marginTop: "8px",
            }}
          >
            REAL ESTATE CRM
          </span>
        </div>
      </div>
    );
  }

  /* ── Sidebar lockup — horizontal ──────────────────────────────── */
  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <AEMonogram size={monogramSize} />

      {!iconOnly && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              fontWeight: 800,
              color: "currentColor",
              fontSize: nameSize,
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            Advance Estate
          </span>
          <span
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              fontWeight: 400,
              color: "rgba(255,255,255,0.35)",
              fontSize: subSize,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginTop: "3px",
            }}
          >
            Real Estate CRM
          </span>
        </div>
      )}
    </div>
  );
}
