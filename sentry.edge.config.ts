import * as Sentry from "@sentry/nextjs";

// No beforeBreadcrumb hook here on purpose.
//
// The credential-in-URL risk this guards against lives in the Node runtime --
// the cron routes that call the Meta Graph API (lib/meta-graph.ts). The edge
// runtime only runs middleware, which makes no such calls, so scrubbing here
// protects nothing.
//
// It also does not work: importing lib/sentry-scrub into this config made every
// middleware invocation fail on Vercel with MIDDLEWARE_INVOCATION_FAILED (500 on
// every route). It passed local `next start` only because NEXT_PUBLIC_SENTRY_DSN
// is unset locally, so Sentry never initialises and the hook never runs.
// See sentry.server.config.ts for the scrubbing that does apply.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
