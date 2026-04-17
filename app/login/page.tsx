"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <main
      className="flex min-h-screen overflow-hidden"
      style={{ background: "#131313" }}
    >
      {/* ── LEFT: Atmospheric photo panel (desktop only) ── */}
      <section className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-shrink-0">
        {/* Dark photo overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.55)", zIndex: 10 }}
        />
        {/* Gold vignette edge */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, transparent 75%, rgba(201,150,58,0.07) 100%)",
            zIndex: 20,
          }}
        />
        {/* Villa photo — desaturated dark luxury */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuD455e6muSbNklSgcAIqCp8pFjXLVH41Zu3Tm4yiZCZjRh_IokCM24GcQNlJeFhImg4GnVFzAdzZWpWW9Qq1cfb77kg6UnBklsLRInkk6JUzZwpM3YVdszMB43I2aQftlV9Cb7TIwQyR3mI32_m7gxdOc1j0MM2xwMYzKqgZSMrGMAiNrQIrnEOnWHa3Q6b2jehDGa_MXjaHVMtRPk7t8o5-5gQPMzj2m4jj1Ffq5V4QfNyGIqO-L4JzX18i2UDB5WEfaExzNOrBns"
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "grayscale(1) brightness(0.5)",
          }}
        />
        {/* Logo — centered brand showcase */}
        <div className="absolute z-30 inset-0 flex flex-col items-center justify-center gap-4">
          <Logo variant="login" size="lg" />
        </div>
      </section>

      {/* ── RIGHT: Auth form panel ── */}
      <section
        className="w-full lg:w-[45%] flex flex-col items-center justify-center px-8 lg:px-24"
        style={{ background: "#14151C" }}
      >
        <div className="w-full" style={{ maxWidth: 400 }}>

          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center" style={{ marginBottom: 48 }}>
            <Logo size="sm" />
          </div>

          {/* Heading */}
          <header style={{ marginBottom: 40 }}>
            <h2
              style={{
                fontFamily: "Manrope, var(--font-manrope), sans-serif",
                fontWeight: 700,
                fontSize: 24,
                color: "#ffffff",
                marginBottom: 8,
                letterSpacing: "-0.01em",
              }}
            >
              Bienvenido
            </h2>
            <p
              style={{
                fontFamily: "Inter, var(--font-inter), sans-serif",
                fontSize: 14,
                color: "#9899A8",
              }}
            >
              Portal exclusivo para gestión patrimonial.
            </p>
          </header>

          {/* Form */}
          <form onSubmit={handleLogin}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 32 }}>

              {/* Email */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "#9899A8",
                    marginBottom: 8,
                    fontFamily: "Inter, var(--font-inter), sans-serif",
                  }}
                >
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  placeholder="usuario@advanceestate.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid #22242F",
                    padding: "12px 0",
                    color: "#e5e2e1",
                    fontSize: 14,
                    outline: "none",
                    transition: "border-color 0.3s",
                    fontFamily: "Inter, var(--font-inter), sans-serif",
                  }}
                  onFocus={(e) => (e.target.style.borderBottomColor = "#C9963A")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "#22242F")}
                />
              </div>

              {/* Password */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    marginBottom: 8,
                  }}
                >
                  <label
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: "#9899A8",
                      fontFamily: "Inter, var(--font-inter), sans-serif",
                    }}
                  >
                    Contraseña
                  </label>
                  <a
                    href="#"
                    style={{
                      fontSize: 11,
                      color: "#9899A8",
                      textDecoration: "none",
                      fontFamily: "Inter, var(--font-inter), sans-serif",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      ((e.target as HTMLElement).style.color = "#C9963A")
                    }
                    onMouseLeave={(e) =>
                      ((e.target as HTMLElement).style.color = "#9899A8")
                    }
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid #22242F",
                    padding: "12px 0",
                    color: "#e5e2e1",
                    fontSize: 14,
                    outline: "none",
                    transition: "border-color 0.3s",
                    fontFamily: "Inter, var(--font-inter), sans-serif",
                  }}
                  onFocus={(e) => (e.target.style.borderBottomColor = "#C9963A")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "#22242F")}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  height: 48,
                  background: "#C9963A",
                  color: "#0e0e0e",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 15,
                  fontWeight: 500,
                  fontFamily: "Inter, var(--font-inter), sans-serif",
                  opacity: loading ? 0.7 : 1,
                  transition: "filter 0.3s, opacity 0.3s",
                  letterSpacing: "0.01em",
                }}
                onMouseEnter={(e) => {
                  if (!loading)
                    (e.currentTarget.style.filter = "brightness(1.1)");
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "none";
                }}
              >
                {loading ? "Iniciando sesión..." : "Iniciar sesión"}
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "4px 0" }}>
                <div style={{ flex: 1, height: 1, background: "#22242F" }} />
                <span
                  style={{
                    fontSize: 11,
                    color: "#9899A8",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    fontFamily: "Inter, var(--font-inter), sans-serif",
                  }}
                >
                  o continúa con
                </span>
                <div style={{ flex: 1, height: 1, background: "#22242F" }} />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                style={{
                  width: "100%",
                  height: 48,
                  background: "transparent",
                  border: "1px solid #22242F",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: "#e5e2e1",
                  fontSize: 14,
                  fontFamily: "Inter, var(--font-inter), sans-serif",
                  transition: "background 0.3s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.04)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google Workspace
              </button>
            </div>
          </form>

          {/* Footer */}
          <footer
            style={{
              marginTop: 48,
              borderTop: "1px solid rgba(34,36,47,0.4)",
              paddingTop: 24,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <p
              style={{
                fontSize: 10,
                color: "rgba(152,153,168,0.5)",
                fontFamily: "Inter, var(--font-inter), sans-serif",
              }}
            >
              © 2025 Advance Estate · RE/MAX Advance
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}
