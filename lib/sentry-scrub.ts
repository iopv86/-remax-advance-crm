/**
 * Redaction of secrets from anything Sentry is about to transmit.
 *
 * Sentry's automatic fetch/http instrumentation records the RAW query string of
 * every outgoing request as `http.query` on a breadcrumb, and the same data
 * lands on OTel span attributes. Neither is redacted by default. Any credential
 * that reaches a URL therefore reaches Sentry's SaaS on the next captured error.
 *
 * The primary defence is not putting credentials in URLs at all (see
 * lib/meta-graph.ts, which sends Authorization headers). This is the second
 * line, so a future caller who forgets cannot leak a live token.
 */

const SECRET_PARAMS = ["access_token", "token", "api_key", "apikey", "key", "secret", "password"];

/** Replace the value of any secret-looking query param with [REDACTED]. */
export function redactSecrets(input: unknown): unknown {
  if (typeof input !== "string") return input;
  let out = input;
  for (const p of SECRET_PARAMS) {
    out = out.replace(new RegExp(`([?&]${p}=)[^&\\s]+`, "gi"), "$1[REDACTED]");
  }
  return out;
}

interface BreadcrumbLike {
  data?: Record<string, unknown>;
  message?: string;
}

export function scrubBreadcrumb<T extends BreadcrumbLike>(breadcrumb: T): T {
  if (breadcrumb.data) {
    for (const k of ["url", "http.query", "http.url"]) {
      if (typeof breadcrumb.data[k] === "string") {
        breadcrumb.data[k] = redactSecrets(breadcrumb.data[k]);
      }
    }
  }
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = redactSecrets(breadcrumb.message) as string;
  }
  return breadcrumb;
}
