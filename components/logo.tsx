import { cn } from "@/lib/utils";
import Image from "next/image";

/**
 * AE Monogram — pure vector, used for small sidebar icon.
 * Estate Gold #C9963A, Cinzel serif, scales perfectly at any px size.
 * Kept as inline SVG so it stays crisp at 28–64px (unlike embedded-PNG logos).
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
  /** "login" renders the full professional logo for the brand strip */
  variant?: "sidebar" | "login";
  /**
   * "professional" — use the Canva-sourced SVG files from /public/logos/.
   * "inline" (default) — use the inline SVG monogram (vector, crisp at any size).
   */
  logoStyle?: "professional" | "inline";
}

export function Logo({
  className,
  iconOnly = false,
  size = "md",
  variant = "sidebar",
  logoStyle = "inline",
}: LogoProps) {
  const monogramSize = size === "sm" ? 36 : size === "md" ? 44 : 64;
  const nameSize = size === "sm" ? "13px" : size === "md" ? "16px" : "20px";
  const subSize = size === "sm" ? "9px" : "10px";

  /* ── Login lockup — professional logotipo centered ──────────────── */
  if (variant === "login") {
    return (
      <div className={cn("flex flex-col items-center gap-2 select-none", className)}>
        <Image
          src="/logos/logotipo.svg"
          alt="Advance Estate"
          width={280}
          height={280}
          priority
          style={{ width: 280, height: "auto" }}
          unoptimized
        />
      </div>
    );
  }

  /* ── Sidebar lockup — horizontal ──────────────────────────────────── */
  const icon =
    logoStyle === "professional" ? (
      <Image
        src="/logos/monograma.svg"
        alt="AE"
        width={monogramSize}
        height={monogramSize}
        style={{ width: monogramSize, height: monogramSize, objectFit: "contain", flexShrink: 0 }}
        unoptimized
      />
    ) : (
      <AEMonogram size={monogramSize} />
    );

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {icon}

      {!iconOnly && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              fontWeight: 800,
              fontSize: nameSize,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              background: "linear-gradient(135deg, #F5E6C8 0%, #C9963A 60%, #A67828 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Advance Estate
          </span>
          <span
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              fontWeight: 400,
              color: "rgba(255,255,255,0.3)",
              fontSize: subSize,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginTop: "3px",
            }}
          >
            Luxury Real Estate
          </span>
        </div>
      )}
    </div>
  );
}
