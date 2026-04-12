import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, iconOnly = false, size = "md" }: LogoProps) {
  const px = size === "sm" ? 40 : size === "md" ? 48 : 56;
  const iconPx = size === "sm" ? 18 : size === "md" ? 22 : 26;

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {/* Icon mark — orange-red gradient square with house */}
      <div
        style={{
          width: px,
          height: px,
          borderRadius: size === "sm" ? 12 : 14,
          background: "linear-gradient(135deg, #f97316 0%, #e11d48 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 12px 24px rgba(225,29,72,0.28)",
          flexShrink: 0,
        }}
      >
        <svg
          width={iconPx}
          height={iconPx}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* House shape */}
          <path
            d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"
            fill="white"
            fillOpacity="0.95"
          />
        </svg>
      </div>

      {/* Wordmark */}
      {!iconOnly && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontWeight: 600,
              color: "#0f172a",
              fontSize: size === "sm" ? "14px" : size === "md" ? "17px" : "22px",
              letterSpacing: "0.04em",
              lineHeight: 1.1,
            }}
          >
            Advance Estate
          </span>
          <span
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontWeight: 400,
              color: "#94a3b8",
              fontSize: size === "sm" ? "9px" : "10px",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              marginTop: "3px",
            }}
          >
            CRM Inmobiliario
          </span>
        </div>
      )}
    </div>
  );
}
