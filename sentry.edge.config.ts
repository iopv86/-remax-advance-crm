import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sentry records the raw query string of outgoing requests as http.query,
  // unredacted. Strip anything credential-shaped before it leaves the process.
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
});
