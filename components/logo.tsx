import { cn } from "@/lib/utils";
import Image from "next/image";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, iconOnly = false, size = "md" }: LogoProps) {
  const px = size === "sm" ? 36 : size === "md" ? 44 : 56;
  const fontSize = size === "sm" ? "14px" : size === "md" ? "17px" : "22px";
  const subSize = size === "sm" ? "9px" : "10px";

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <Image
        src="/ae-logo.svg"
        alt="Advance Estate"
        width={px}
        height={px}
        style={{ objectFit: "contain", flexShrink: 0 }}
        priority
      />

      {!iconOnly && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontFamily: "var(--font-manrope), var(--font-inter), system-ui, sans-serif",
              fontWeight: 800,
              color: "currentColor",
              fontSize,
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            Advance Estate
          </span>
          <span
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
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
