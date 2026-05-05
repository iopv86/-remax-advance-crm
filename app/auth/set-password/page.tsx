"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    // Mark agent active now that onboarding is complete
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("agents")
        .update({ is_active: true })
        .eq("id", user.id);
    }

    router.push("/dashboard");
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
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
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: "#9899A8",
    marginBottom: 8,
    fontFamily: "Inter, var(--font-inter), sans-serif",
  };

  return (
    <main className="flex min-h-screen overflow-hidden" style={{ background: "#131313" }}>
      {/* Left panel */}
      <section className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)", zIndex: 10 }} />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to right, transparent 75%, rgba(201,150,58,0.07) 100%)", zIndex: 20 }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuD455e6muSbNklSgcAIqCp8pFjXLVH41Zu3Tm4yiZCZjRh_IokCM24GcQNlJeFhImg4GnVFzAdzZWpWW9Qq1cfb77kg6UnBklsLRInkk6JUzZwpM3YVdszMB43I2aQftlV9Cb7TIwQyR3mI32_m7gxdOc1j0MM2xwMYzKqgZSMrGMAiNrQIrnEOnWHa3Q6b2jehDGa_MXjaHVMtRPk7t8o5-5gQPMzj2m4jj1Ffq5V4QfNyGIqO-L4JzX18i2UDB5WEfaExzNOrBns"
          alt=""
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) brightness(0.5)" }}
        />
        <div className="absolute z-30 inset-0 flex flex-col items-center justify-center gap-5">
          <Logo variant="login" size="lg" />
          <p style={{ fontFamily: "Inter, var(--font-inter), sans-serif", fontSize: "11px", fontWeight: 400, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(201,150,58,0.6)" }}>
            Donde se cierran los mejores negocios
          </p>
        </div>
      </section>

      {/* Right: form */}
      <section
        className="w-full lg:w-[45%] flex flex-col items-center justify-center px-8 lg:px-24"
        style={{ background: "#14151C" }}
      >
        <div className="w-full" style={{ maxWidth: 400 }}>
          <div className="lg:hidden flex flex-col items-center" style={{ marginBottom: 48 }}>
            <Logo size="sm" />
          </div>

          <header style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: "Manrope, var(--font-manrope), sans-serif", fontWeight: 700, fontSize: 24, color: "#ffffff", marginBottom: 8, letterSpacing: "-0.01em" }}>
              Crear contraseña
            </h2>
            <p style={{ fontFamily: "Inter, var(--font-inter), sans-serif", fontSize: 14, color: "#9899A8" }}>
              Elige una contraseña segura para activar tu cuenta.
            </p>
          </header>

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 32 }}>
              <div>
                <label style={labelStyle}>Nueva contraseña</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    style={{ ...inputStyle, paddingRight: 32 }}
                    onFocus={(e) => (e.target.style.borderBottomColor = "#C9963A")}
                    onBlur={(e) => (e.target.style.borderBottomColor = "#22242F")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9899A8" }}
                    aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Confirmar contraseña</label>
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="Repite la contraseña"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderBottomColor = "#C9963A")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "#22242F")}
                />
              </div>
            </div>

            {error && (
              <div
                style={{
                  marginBottom: 20,
                  padding: "10px 14px",
                  borderRadius: 6,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#f87171",
                  fontSize: 13,
                  fontFamily: "Inter, var(--font-inter), sans-serif",
                }}
              >
                {error}
              </div>
            )}

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
              onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.filter = "brightness(1.1)"); }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
            >
              {loading ? "Activando cuenta…" : "Activar cuenta →"}
            </button>
          </form>

          <footer style={{ marginTop: 48, borderTop: "1px solid rgba(34,36,47,0.4)", paddingTop: 24, display: "flex", justifyContent: "center" }}>
            <p style={{ fontSize: 10, color: "rgba(152,153,168,0.5)", fontFamily: "Inter, var(--font-inter), sans-serif" }}>
              © 2025 Advance Estate · RE/MAX Advance
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}
