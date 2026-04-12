import { Bot, Zap, MessageSquare, Brain, Database, ArrowRight, Activity } from "lucide-react";

export default function AvaPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Inteligencia Artificial
            </p>
            <h1
              style={{
                fontFamily: "var(--font-playfair),Georgia,serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                lineHeight: 1.1,
              }}
            >
              Ava IA
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Railway — Activo
          </div>
        </div>
      </div>

      <div className="p-7 space-y-6 max-w-4xl">
        {/* Status card */}
        <div className="card-glow p-6 animate-fade-up-1">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--red-muted)" }}
            >
              <Bot className="w-7 h-7" style={{ color: "var(--red)" }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display font-semibold text-foreground text-xl">Ava</h2>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-sans font-medium"
                  style={{ background: "oklch(0.6 0.2 145 / 15%)", color: "oklch(0.4 0.14 145)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  Python 3.11 · Claude claude-sonnet-4-6
                </span>
              </div>
              <p className="font-sans text-sm text-muted-foreground">
                Agente de calificación de leads en WhatsApp con memoria por contacto. Desplegado en Railway con FastAPI.
              </p>
            </div>
          </div>
        </div>

        {/* Architecture cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-up-2">
          {[
            {
              icon: MessageSquare,
              title: "Entrada",
              desc: "WhatsApp Cloud API → FastAPI webhook en Railway",
              color: "var(--teal)",
            },
            {
              icon: Brain,
              title: "Procesamiento",
              desc: "Claude claude-sonnet-4-6 con herramientas en agent/tools.py",
              color: "var(--red)",
            },
            {
              icon: Database,
              title: "Memoria",
              desc: "SQLite local + sincronización a Supabase via tools.py",
              color: "oklch(0.72 0.18 280)",
            },
          ].map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="card-glow p-4">
              <div className="p-2 rounded-lg w-fit mb-3" style={{ background: `${color}18` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <p className="font-sans font-semibold text-sm text-foreground mb-1">{title}</p>
              <p className="font-sans text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>

        {/* Capabilities */}
        <div className="card-glow p-6 animate-fade-up-3">
          <div className="flex items-center gap-2 mb-5">
            <Zap className="w-4 h-4" style={{ color: "var(--amber)" }} />
            <h3 className="font-sans font-semibold text-foreground">Capacidades</h3>
          </div>
          <div className="space-y-3">
            {[
              { text: "Calificación de 6 dimensiones: presupuesto, urgencia, pago, ubicación, tipo, propósito", done: true },
              { text: "Memoria de conversación con SQLite persistente por contacto", done: true },
              { text: "Respuestas en español natural con contexto inmobiliario RE/MAX", done: true },
              { text: "Integración WhatsApp Cloud API con webhooks de Meta", done: true },
              { text: "Auto-sincronización contactos y mensajes a Supabase CRM", done: true },
              { text: "Function calling: crear tareas y deals automáticamente (próximamente)", done: false },
              { text: "Búsqueda semántica de propiedades con embed vectors (próximamente)", done: false },
            ].map(({ text, done }) => (
              <div key={text} className="flex items-start gap-3">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: done ? "oklch(0.6 0.2 145 / 15%)" : "var(--secondary)",
                    color: done ? "oklch(0.4 0.14 145)" : "var(--muted-foreground)",
                  }}
                >
                  {done ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5 8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <ArrowRight className="w-2.5 h-2.5" />
                  )}
                </div>
                <p className={"font-sans text-sm " + (done ? "text-foreground" : "text-muted-foreground")}>
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Railway deployment info */}
        <div className="card-glow p-5 animate-fade-up-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-3.5 h-3.5" style={{ color: "var(--teal)" }} />
            <p className="font-sans text-xs uppercase tracking-widest text-muted-foreground">
              Despliegue Railway
            </p>
          </div>
          <code
            className="block font-mono text-sm p-3 rounded-lg break-all"
            style={{ background: "var(--secondary)", color: "var(--teal)", border: "1px solid var(--border)" }}
          >
            https://remax-advance-ava-production.up.railway.app
          </code>
          <p className="font-sans text-xs text-muted-foreground mt-3">
            Webhook Meta: <code className="font-mono">/webhook</code> · Chat CRM: <code className="font-mono">/api/ava</code>
          </p>
        </div>
      </div>
    </div>
  );
}
