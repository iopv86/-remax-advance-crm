"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Save,
  RefreshCw,
} from "lucide-react";
import { saveMetaConfig, testMetaConnection } from "./actions";
import type { MetaFullConfig } from "./actions";

// ── Design tokens (mirrors settings-client.tsx) ──────

const GOLD = "var(--primary)";

const GLASS_CARD: React.CSSProperties = {
  background: "var(--glass-bg)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(201, 150, 58, 0.15)",
};

const FIELD_LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: "var(--muted-foreground)",
  marginBottom: 6,
  fontFamily: "Inter, sans-serif",
  fontWeight: 700,
};

const FIELD_INPUT: React.CSSProperties = {
  width: "100%",
  background: "var(--secondary)",
  border: "1px solid var(--glass-bg-md)",
  borderRadius: 8,
  padding: "10px 14px",
  color: "var(--foreground)",
  fontSize: 14,
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
};

// ── Env status badge ─────────────────────────────────

function EnvBadge({ configured, label }: { configured: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-xl" style={{ background: "var(--secondary)", border: "1px solid var(--glass-bg-md)" }}>
      <div className="flex items-center gap-3">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: configured ? "#34d399" : "#f87171" }}
        />
        <span className="text-sm font-mono" style={{ color: "var(--muted-foreground)" }}>{label}</span>
      </div>
      <span
        className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
        style={
          configured
            ? { background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }
            : { background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }
        }
      >
        {configured ? "Configurado" : "Faltante"}
      </span>
    </div>
  );
}

// ── Copy button ───────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-2 rounded-lg transition-all flex-shrink-0"
      style={{ color: copied ? "#34d399" : GOLD }}
      title="Copiar"
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(201,150,58,0.1)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ── Main component ────────────────────────────────────

interface Props {
  initialConfig: MetaFullConfig;
}

export function MetaAdsConfig({ initialConfig }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState(initialConfig);
  const [form, setForm] = useState({
    meta_pixel_id: initialConfig.db.meta_pixel_id,
    meta_ad_account_id: initialConfig.db.meta_ad_account_id,
    meta_phone_number_id: initialConfig.db.meta_phone_number_id,
    meta_lead_template_name: initialConfig.db.meta_lead_template_name,
  });
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [tokenFeedback, setTokenFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isValidating, setIsValidating] = useState(false);

  const allSecretsConfigured =
    config.env.has_access_token && config.env.has_app_secret && config.env.has_webhook_verify_token;

  const allIdentifiersConfigured =
    !!form.meta_pixel_id && !!form.meta_ad_account_id;

  const isFullyConnected = allSecretsConfigured && allIdentifiersConfigured;

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveMetaConfig(form);
      if (result.ok) {
        setConfig((prev) => ({ ...prev, db: { ...prev.db, ...form } }));
        setFeedback({ ok: true, msg: "Configuración guardada correctamente." });
      } else {
        setFeedback({ ok: false, msg: result.error });
      }
    });
  }

  async function handleValidateToken() {
    setIsValidating(true);
    setTokenFeedback(null);
    const result = await testMetaConnection();
    setIsValidating(false);
    if (result.ok) {
      setTokenFeedback({ ok: true, msg: `Token válido${result.name ? ` — ${result.name}` : ""}` });
    } else {
      setTokenFeedback({ ok: false, msg: result.error ?? "Token inválido" });
    }
  }

  const WEBHOOK_URL = "https://remax-advance-crm.vercel.app/api/meta/lead-webhook";

  return (
    <div className="rounded-2xl overflow-hidden transition-all duration-300" style={GLASS_CARD}>
      {/* Header row — always visible */}
      <button
        type="button"
        className="w-full flex items-center justify-between p-6 text-left transition-all"
        onClick={() => setExpanded((v) => !v)}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(201,150,58,0.03)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <div className="flex items-center gap-4">
          {/* Meta icon */}
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: isFullyConnected ? "rgba(37,99,235,0.12)" : "var(--secondary)",
              border: isFullyConnected ? "1px solid rgba(37,99,235,0.3)" : "1px solid var(--glass-bg-md)",
              color: isFullyConnected ? "#60a5fa" : "var(--muted-foreground)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-base" style={{ color: "var(--foreground)" }}>
              Meta Ads
            </h3>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Facebook / Instagram leads + Conversions API
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex-shrink-0 px-3 py-1 rounded-full font-bold uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              ...(isFullyConnected
                ? { background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }
                : { background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }),
            }}
          >
            {isFullyConnected ? "ACTIVO" : "INCOMPLETO"}
          </span>
          {expanded
            ? <ChevronUp className="w-4 h-4" style={{ color: "var(--muted-foreground)" }} />
            : <ChevronDown className="w-4 h-4" style={{ color: "var(--muted-foreground)" }} />
          }
        </div>
      </button>

      {/* Expanded config panel */}
      {expanded && (
        <div className="px-6 pb-6 flex flex-col gap-6" style={{ borderTop: "1px solid rgba(201,150,58,0.1)" }}>

          {/* Section: Secrets (env vars) */}
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4
                className="font-bold uppercase tracking-widest"
                style={{ fontSize: "10px", color: "var(--muted-foreground)" }}
              >
                Variables de entorno — Vercel
              </h4>
              <a
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: GOLD }}
              >
                Abrir Vercel <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              Estos secretos se configuran directamente en el dashboard de Vercel → Settings → Environment Variables.
              No se almacenan en la base de datos.
            </p>
            <div className="flex flex-col gap-2">
              <EnvBadge configured={config.env.has_access_token} label="META_ACCESS_TOKEN" />
              <EnvBadge configured={config.env.has_app_secret} label="META_APP_SECRET" />
              <EnvBadge configured={config.env.has_webhook_verify_token} label="META_WEBHOOK_VERIFY_TOKEN" />
            </div>

            {/* Token validation */}
            {config.env.has_access_token && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleValidateToken()}
                  disabled={isValidating}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: "rgba(201,150,58,0.1)",
                    color: GOLD,
                    border: "1px solid rgba(201,150,58,0.2)",
                    cursor: isValidating ? "not-allowed" : "pointer",
                    opacity: isValidating ? 0.7 : 1,
                  }}
                >
                  {isValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Verificar token
                </button>
                {tokenFeedback && (
                  <span
                    className="text-xs font-medium flex items-center gap-1"
                    style={{ color: tokenFeedback.ok ? "#34d399" : "#f87171" }}
                  >
                    {tokenFeedback.ok
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : <AlertTriangle className="w-3.5 h-3.5" />
                    }
                    {tokenFeedback.msg}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section: Identifiers (DB) */}
          <div>
            <h4
              className="font-bold uppercase tracking-widest mb-4"
              style={{ fontSize: "10px", color: "var(--muted-foreground)" }}
            >
              Identificadores — editables
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label style={FIELD_LABEL}>Pixel ID</label>
                <input
                  type="text"
                  placeholder="12345678901234"
                  value={form.meta_pixel_id}
                  onChange={(e) => setForm((f) => ({ ...f, meta_pixel_id: e.target.value }))}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <label style={FIELD_LABEL}>Ad Account ID</label>
                <input
                  type="text"
                  placeholder="act_12345678901234"
                  value={form.meta_ad_account_id}
                  onChange={(e) => setForm((f) => ({ ...f, meta_ad_account_id: e.target.value }))}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <label style={FIELD_LABEL}>WhatsApp Phone Number ID</label>
                <input
                  type="text"
                  placeholder="1011993898671913"
                  value={form.meta_phone_number_id}
                  onChange={(e) => setForm((f) => ({ ...f, meta_phone_number_id: e.target.value }))}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <label style={FIELD_LABEL}>
                  Lead Template Name
                  {form.meta_lead_template_name === "ava_lead_bienvenida" && (
                    <span className="ml-2 font-normal normal-case" style={{ color: "#fbbf24" }}>
                      — pendiente aprobación Meta
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="ava_lead_bienvenida"
                  value={form.meta_lead_template_name}
                  onChange={(e) => setForm((f) => ({ ...f, meta_lead_template_name: e.target.value }))}
                  style={FIELD_INPUT}
                />
              </div>
            </div>
          </div>

          {/* Section: Webhook URL */}
          <div>
            <h4
              className="font-bold uppercase tracking-widest mb-3"
              style={{ fontSize: "10px", color: "var(--muted-foreground)" }}
            >
              Webhook URL — Meta Business Manager
            </h4>
            <div
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ background: "var(--secondary)", border: "1px solid var(--glass-bg-md)" }}
            >
              <code
                className="flex-1 text-xs break-all"
                style={{ color: "var(--foreground)", fontFamily: "monospace" }}
              >
                {WEBHOOK_URL}
              </code>
              <CopyButton text={WEBHOOK_URL} />
            </div>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              Registra esta URL en Meta Business Manager → App → Webhooks → Page → leadgen.
              El token de verificación es el valor de{" "}
              <code className="text-xs" style={{ color: GOLD }}>META_WEBHOOK_VERIFY_TOKEN</code>.
            </p>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
              style={{
                background: `linear-gradient(135deg, rgba(201,150,58,0.9) 0%, var(--primary) 100%)`,
                color: "var(--primary-foreground)",
                border: "none",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
                fontFamily: "Inter, sans-serif",
              }}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            {feedback && (
              <span
                className="text-sm font-medium flex items-center gap-1.5"
                style={{ color: feedback.ok ? "#34d399" : "#f87171" }}
              >
                {feedback.ok
                  ? <CheckCircle2 className="w-4 h-4" />
                  : <AlertTriangle className="w-4 h-4" />
                }
                {feedback.msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
