import { cn } from "@/lib/utils";
import Image from "next/image";

interface LogoProps {
  className?: string;
  /** Show monogram only — no wordmark text */
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
  /** "login" renders the full lockup for the brand strip */
  variant?: "sidebar" | "login";
}

export function Logo({
  className,
  iconOnly = false,
  size = "md",
  variant = "sidebar",
}: LogoProps) {
  const monogramSize = size === "sm" ? 44 : size === "md" ? 62 : 76;
  const nameSize = size === "sm" ? "13px" : size === "md" ? "15px" : "19px";
  const subSize = size === "sm" ? "9px" : "10px";

  /* ── Login lockup — full Canva logotipo PNG ────────────────────────── */
  if (variant === "login") {
    return (
      <div className={cn("flex flex-col items-center select-none", className)}>
        <Image
          src="/canva-logotipo.png"
          alt="Advance Estate"
          width={480}
          height={192}
          style={{ width: 480, height: "auto", objectFit: "contain" }}
          unoptimized
          priority
        />
      </div>
    );
  }

  /* ── Sidebar lockup — monogram icon + wordmark ─────────────────────── */
  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <Image
        src="/canva-monograma.png"
        alt="AE"
        width={monogramSize}
        height={monogramSize}
        style={{
          width: monogramSize,
          height: monogramSize,
          objectFit: "contain",
          flexShrink: 0,
        }}
        unoptimized
      />

      {!iconOnly && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
              fontWeight: 800,
              fontSize: nameSize,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              background:
                "linear-gradient(135deg, #F5E6C8 0%, #C9963A 60%, #A67828 100%)",
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
              fontWeight: 500,
              color: "rgba(255,255,255,0.35)",
              fontSize: subSize,
              letterSpacing: "0.14em",
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
