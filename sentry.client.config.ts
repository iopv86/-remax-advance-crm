import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10 % of transactions in production, 100 % elsewhere.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Only initialise when a DSN is actually configured.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Hide source maps from client bundles.
  integrations: [],
});
