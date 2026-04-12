"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowUpRight, Loader2, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
    <div
      className="min-h-screen flex items-center justify-center p-4 md:p-6"
      style={{
        background: "radial-gradient(circle at top left, rgba(219,234,254,.9), transparent 28%), linear-gradient(180deg,#f8fbff 0%,#f3f7fb 45%,#eef3f9 100%)",
      }}
    >
      <div
        className="w-full max-w-[1200px] overflow-hidden"
        style={{
          borderRadius: 32,
          border: "1px solid rgba(255,255,255,0.7)",
          background: "rgba(255,255,255,0.55)",
          boxShadow: "0 24px 80px rgba(15,23,42,0.08)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="grid min-h-[680px] lg:grid-cols-2">

          {/* LEFT — Hero */}
          <div className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top left,rgba(29,78,216,.12),transparent 22%),radial-gradient(circle at bottom right,rgba(225,29,72,.10),transparent 24%),linear-gradient(180deg,#f8fbff 0%,#f3f7fb 100%)" }} />
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,0.14) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,0.14) 1px,transparent 1px)", backgroundSize: "32px 32px", opacity: 0.35 }} />

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-20">
                <div style={{ width: 56, height: 56, borderRadius: 18, background: "linear-gradient(135deg, #f97316, #e11d48)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 30px rgba(225,29,72,0.28)" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" fill="white" fillOpacity="0.95" /></svg>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-playfair),Georgia,serif", fontWeight: 600, color: "#0f172a", fontSize: 22, letterSpacing: "0.04em" }}>Advance Estate</div>
                  <div style={{ fontFamily: "var(--font-inter),sans-serif", color: "#94a3b8", fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", marginTop: 2 }}>CRM Inmobiliario con IA</div>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-white/80 px-4 py-2 text-xs font-medium text-rose-700 shadow-sm backdrop-blur mb-6">
                <Sparkles className="h-3.5 w-3.5" />
                Plataforma comercial premium
              </div>

              <h1 style={{ fontFamily: "var(--font-playfair),Georgia,serif", fontWeight: 800, fontSize: 54, lineHeight: 1.04, letterSpacing: "-0.02em", color: "#0f172a" }}>
                Gestiona clientes,
                <br />
                <span style={{ background: "linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #e11d48 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  oportunidades
                </span>
                <br />y ventas con claridad.
              </h1>

              <p className="mt-5 text-base leading-7 text-slate-500 max-w-md">
                Una experiencia luminosa, elegante y productiva para equipos que necesitan responder rápido, priorizar mejor y cerrar más negocios.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-3 gap-3">
              {[
                { label: "Pipeline activo", value: "$4.2M", sub: "+14% este mes", color: "#10b981" },
                { label: "Seguimientos hoy", value: "18", sub: "6 prioritarios", color: "#2563eb" },
                { label: "Conversión", value: "28%", sub: "Lectura en tiempo real", color: "#7c3aed" },
              ].map((s) => (
                <div key={s.label} className="rounded-[24px] p-4" style={{ border: "1px solid rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.75)", boxShadow: "0 10px 30px rgba(15,23,42,0.06)", backdropFilter: "blur(8px)" }}>
                  <div className="text-xs text-slate-500 mb-1">{s.label}</div>
                  <div style={{ fontFamily: "var(--font-playfair),Georgia,serif", fontWeight: 700, fontSize: 26, color: "#0f172a", letterSpacing: "-0.02em" }}>{s.value}</div>
                  <div className="text-xs mt-1.5" style={{ color: s.color }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — Form */}
          <div className="relative flex items-center justify-center p-6 md:p-10" style={{ background: "linear-gradient(180deg,rgba(255,255,255,.78) 0%,rgba(248,250,252,.94) 100%)" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,0.15) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,0.15) 1px,transparent 1px)", backgroundSize: "28px 28px", opacity: 0.18 }} />

            <div className="relative z-10 w-full max-w-[420px]">
              {/* Mobile logo */}
              <div className="mb-8 text-center lg:hidden">
                <div style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg, #f97316, #e11d48)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", boxShadow: "0 16px 30px rgba(225,29,72,0.28)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" fill="white" fillOpacity="0.95" /></svg>
                </div>
                <div style={{ fontFamily: "var(--font-playfair),Georgia,serif", fontWeight: 600, fontSize: 22, color: "#0f172a", marginTop: 12 }}>Advance Estate</div>
                <div style={{ color: "#94a3b8", fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", marginTop: 3 }}>CRM Inmobiliario con IA</div>
              </div>

              <div style={{ borderRadius: 32, border: "1px solid rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.88)", padding: 32, boxShadow: "0 24px 80px rgba(15,23,42,0.10)", backdropFilter: "blur(12px)" }}>
                <div className="flex items-start justify-between gap-3 mb-7">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-2">Bienvenido</div>
                    <h2 style={{ fontFamily: "var(--font-playfair),Georgia,serif", fontWeight: 700, fontSize: 36, letterSpacing: "-0.02em", color: "#0f172a", lineHeight: 1.1 }}>
                      Inicia sesión
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Accede al panel comercial, revisa oportunidades y da seguimiento a tus clientes.</p>
                  </div>
                  <div className="shrink-0 text-center rounded-2xl px-3 py-2 text-xs font-semibold text-rose-700" style={{ background: "#fff1f2", border: "1px solid #fecdd3", lineHeight: 1.4 }}>En<br />vivo</div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Email</label>
                    <input type="email" placeholder="agente@remaxadvance.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Contraseña</label>
                      <button type="button" className="text-xs text-slate-400 hover:text-slate-700 transition">¿Olvidaste tu contraseña?</button>
                    </div>
                    <div className="relative">
                      <input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 pr-12 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
                      <button type="button" tabIndex={-1} onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
                      <span className="grid h-5 w-5 place-items-center rounded-md border border-slate-200 bg-white text-xs text-blue-600">✓</span>
                      Recordarme en este equipo
                    </label>
                    <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">Acceso seguro</span>
                  </div>

                  <button type="submit" disabled={loading}
                    className="group flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5"
                    style={{ background: "linear-gradient(90deg, #e11d48, #e11d48, #be123c)", boxShadow: "0 16px 35px rgba(190,24,93,0.28)" }}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <>Ingresar al CRM <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></>
                    )}
                  </button>
                </form>

                <div className="my-5 flex items-center gap-4">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">Acceso rápido</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {["Continuar con Google", "Entrar como demo"].map((label) => (
                    <button key={label} type="button" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">{label}</button>
                  ))}
                </div>

                <div className="mt-5 rounded-[24px] p-4" style={{ border: "1px solid #fef3c7", background: "linear-gradient(135deg, #fffbeb, #fff1f2)" }}>
                  <div className="text-sm font-medium text-slate-900 mb-2">Tu espacio comercial en un solo lugar</div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                    {["Clientes", "Pipeline", "Tareas"].map((item) => (
                      <div key={item} className="rounded-xl px-3 py-2 text-center" style={{ background: "rgba(255,255,255,0.7)" }}>{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
