"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="flex min-h-screen overflow-hidden bg-[#FAFAF9] text-[#1C1917]">
      {/* LEFT PANEL: Brand Side */}
      <section
        className="hidden md:flex md:w-1/2 flex-col justify-between p-16 relative overflow-hidden"
        style={{ background: "#111827" }}
      >
        {/* Top spacer */}
        <div />

        {/* Center Content */}
        <div className="flex flex-col items-center text-center">
          {/* AE Monogram */}
          <div className="relative w-20 h-20 flex items-center justify-center mb-8">
            <div
              className="absolute w-full"
              style={{
                height: 4,
                background: "#e11d48",
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
            />
            <svg
              className="w-full h-full fill-none stroke-white"
              strokeWidth="4"
              viewBox="0 0 100 100"
            >
              <path d="M20 80 L50 20 L80 80" />
              <path d="M40 80 L40 20 L75 20 M40 80 L75 80" />
            </svg>
          </div>

          <h1
            className="font-extrabold text-[28px] tracking-tight text-white uppercase leading-none"
            style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
          >
            ADVANCE
          </h1>
          <p
            className="text-sm uppercase mt-1"
            style={{ color: "#575e70", letterSpacing: "0.2em", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
          >
            ESTATES
          </p>
          <p className="mt-8 text-base max-w-xs leading-relaxed" style={{ color: "#6b7280" }}>
            El CRM que trabaja mientras tú cierras tratos.
          </p>
        </div>

        {/* Bottom Stats */}
        <div className="flex flex-col gap-6">
          {[
            { value: "248", label: "contactos gestionados" },
            { value: "RD$ 45M", label: "en pipeline activo" },
            { value: "34", label: "tratos en curso" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-4">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill="#6b7280" />
              </svg>
              <div>
                <span
                  className="font-bold text-white text-lg leading-none"
                  style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
                >
                  {stat.value}
                </span>
                <p
                  className="text-xs uppercase tracking-widest font-semibold mt-1"
                  style={{ color: "#6b7280" }}
                >
                  {stat.label}
                </p>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 mt-6">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.15em]"
              style={{ color: "#6b7280" }}
            >
              Powered by Advance Estate IA
            </span>
          </div>
        </div>
      </section>

      {/* RIGHT PANEL: Form Side */}
      <section
        className="w-full md:w-1/2 flex flex-col items-center justify-center p-8 relative"
        style={{ background: "#FAFAF9" }}
      >
        {/* Version info */}
        <div className="absolute top-8 right-12 flex items-center gap-3">
          <span
            className="font-bold text-[11px] tracking-tight"
            style={{ color: "rgba(87,94,112,0.6)", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}
          >
            ADVANCE ESTATE
          </span>
          <span
            className="font-medium text-[11px] px-2 py-0.5 rounded"
            style={{ color: "rgba(87,94,112,0.4)", background: "#F5F4F2" }}
          >
            v2.1
          </span>
        </div>

        <div className="w-full max-w-[380px] flex flex-col">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-3 md:hidden">
            <div className="relative w-9 h-9 flex items-center justify-center">
              <div
                className="absolute w-full"
                style={{ height: 3, background: "#e11d48", top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
              />
              <svg className="w-full h-full fill-none stroke-[#1C1917]" strokeWidth="4" viewBox="0 0 100 100">
                <path d="M20 80 L50 20 L80 80" />
                <path d="M40 80 L40 20 L75 20 M40 80 L75 80" />
              </svg>
            </div>
            <span
              className="font-bold text-xl tracking-tight"
              style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "#1C1917" }}
            >
              Advance Estate
            </span>
          </div>

          <header className="mb-10">
            <h2
              className="font-bold text-[28px] tracking-tight mb-1"
              style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif", color: "#1C1917" }}
            >
              Bienvenido de vuelta
            </h2>
            <p className="text-sm" style={{ color: "#575e70" }}>
              Ingresa a tu espacio de trabajo
            </p>
          </header>

          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="font-bold text-[11px] uppercase tracking-wider"
                style={{ color: "rgba(28,25,23,0.7)" }}
              >
                Correo electrónico
              </label>
              <input
                type="email"
                id="email"
                placeholder="ivan@advanceestate.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full h-12 px-4 rounded-lg text-sm transition-all duration-200"
                style={{
                  background: "#eeeeed",
                  border: "none",
                  borderBottom: "2px solid transparent",
                  color: "#1C1917",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderBottomColor = "#e11d48";
                  e.target.style.background = "#ffffff";
                }}
                onBlur={(e) => {
                  e.target.style.borderBottomColor = "transparent";
                  e.target.style.background = "#eeeeed";
                }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-end">
                <label
                  htmlFor="password"
                  className="font-bold text-[11px] uppercase tracking-wider"
                  style={{ color: "rgba(28,25,23,0.7)" }}
                >
                  Contraseña
                </label>
                <a
                  href="#"
                  className="text-[11px] font-bold transition-opacity hover:opacity-70"
                  style={{ color: "#e11d48" }}
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-12 px-4 pr-12 rounded-lg text-sm transition-all duration-200"
                  style={{
                    background: "#eeeeed",
                    border: "none",
                    borderBottom: "2px solid transparent",
                    color: "#1C1917",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderBottomColor = "#e11d48";
                    e.target.style.background = "#ffffff";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderBottomColor = "transparent";
                    e.target.style.background = "#eeeeed";
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "rgba(87,94,112,0.5)" }}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-white font-bold text-sm rounded-lg transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-60 mt-2"
              style={{
                background: "#e11d48",
                fontFamily: "var(--font-manrope), Manrope, sans-serif",
              }}
            >
              {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: "#e8e8e7" }} />
            </div>
            <span
              className="relative px-4 text-[10px] font-bold uppercase tracking-widest"
              style={{ background: "#FAFAF9", color: "rgba(87,94,112,0.5)" }}
            >
              o continúa con
            </span>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full h-12 bg-white text-sm font-bold rounded-lg flex items-center justify-center gap-3 transition-all duration-200 hover:bg-stone-50"
            style={{
              border: "1px solid rgba(229,189,190,0.3)",
              color: "#1C1917",
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
            }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            Google
          </button>

          <footer className="mt-12 text-center">
            <p className="text-[12px]" style={{ color: "#575e70" }}>
              ¿No tienes cuenta?{" "}
              <a
                href="#"
                className="font-bold transition-opacity hover:opacity-70"
                style={{ color: "#1C1917" }}
              >
                Contacta a tu administrador
              </a>
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}
