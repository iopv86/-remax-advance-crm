"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";


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
    <main className="flex min-h-screen overflow-hidden">

      {/* ══════════════════════════════════════════
          BRAND STRIP — 38% width, always dark
      ══════════════════════════════════════════ */}
      <section
        className="hidden md:flex md:flex-col relative overflow-hidden flex-shrink-0"
        style={{ width: "38%" }}
      >
        {/* Light mode bg: navy gradient */}
        <div
          className="absolute inset-0 dark:hidden"
          style={{
            background:
              "linear-gradient(160deg, #0f172a 0%, #111827 40%, #1e293b 100%)",
          }}
        />
        {/* Dark mode bg: near-OLED */}
        <div
          className="absolute inset-0 hidden dark:block"
          style={{ background: "#080808", borderRight: "1px solid #1A1A18" }}
        />
        {/* Strip content — logo only, centered */}
        <div className="relative z-10 flex h-full items-center justify-center px-6">
          <Image
            src="/ae-logo-final.svg"
            alt="Advance Estate"
            width={260}
            height={260}
            className="object-contain w-full max-w-[260px]"
            priority
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FORM AREA — 62% (flex-1)
      ══════════════════════════════════════════ */}
      <section
        className="flex-1 flex flex-col items-center justify-center px-10 py-12 relative"
        style={{ background: "var(--background)" }}
      >
        {/* Version badge */}
        <div className="absolute top-7 right-10">
          <span
            className="text-[10px] tracking-[0.08em] uppercase px-2 py-0.5 rounded"
            style={{
              color: "color-mix(in srgb, var(--muted-foreground) 60%, transparent)",
              background: "color-mix(in srgb, var(--muted) 80%, transparent)",
            }}
          >
            v2.1
          </span>
        </div>

        <div className="w-full max-w-[340px] flex flex-col">

          {/* Mobile logo (hidden on desktop) */}
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <Image
              src="/ae-logo-final.svg"
              alt="Advance Estate"
              width={48}
              height={48}
              className="object-contain"
            />
          </div>

          {/* Heading */}
          <header className="mb-8">
            <h1
              className="font-bold text-[26px] tracking-tight mb-1.5"
              style={{
                fontFamily: "var(--font-manrope), Manrope, sans-serif",
                color: "var(--foreground)",
              }}
            >
              Bienvenido de vuelta
            </h1>
            <p
              className="text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Inicia sesión en tu cuenta
            </p>
          </header>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-5">

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
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
                className="w-full h-11 px-4 rounded-md text-sm transition-all duration-200"
                style={{
                  background: "color-mix(in srgb, var(--muted) 70%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
                  color: "var(--foreground)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#e11d48";
                  e.target.style.background = "var(--background)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor =
                    "color-mix(in srgb, var(--border) 60%, transparent)";
                  e.target.style.background =
                    "color-mix(in srgb, var(--muted) 70%, transparent)";
                }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-end">
                <label
                  htmlFor="password"
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Contraseña
                </label>
                <a
                  href="#"
                  className="text-[11px] font-semibold transition-opacity hover:opacity-70"
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
                  className="w-full h-11 px-4 pr-12 rounded-md text-sm transition-all duration-200"
                  style={{
                    background: "color-mix(in srgb, var(--muted) 70%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
                    color: "var(--foreground)",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#e11d48";
                    e.target.style.background = "var(--background)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor =
                      "color-mix(in srgb, var(--border) 60%, transparent)";
                    e.target.style.background =
                      "color-mix(in srgb, var(--muted) 70%, transparent)";
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-white font-bold text-sm rounded-md transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-60 cursor-pointer mt-1"
              style={{
                background: "#e11d48",
                fontFamily: "var(--font-manrope), Manrope, sans-serif",
                boxShadow: "0 4px 16px rgba(225,29,72,0.28)",
              }}
            >
              {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div
                className="w-full"
                style={{
                  height: 1,
                  background:
                    "color-mix(in srgb, var(--border) 50%, transparent)",
                }}
              />
            </div>
            <span
              className="relative px-4 text-[10px] font-bold uppercase tracking-widest"
              style={{
                background: "var(--background)",
                color: "var(--muted-foreground)",
              }}
            >
              o continúa con
            </span>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full h-11 text-sm font-semibold rounded-md flex items-center justify-center gap-3 transition-all duration-200 hover:opacity-90 cursor-pointer"
            style={{
              border:
                "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
              background:
                "color-mix(in srgb, var(--background) 95%, transparent)",
              color: "var(--foreground)",
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google
          </button>

          <footer className="mt-8 text-center">
            <p
              className="text-[12px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              ¿No tienes cuenta?{" "}
              <a
                href="#"
                className="font-semibold transition-opacity hover:opacity-70"
                style={{ color: "var(--foreground)" }}
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
