import "server-only";

// Server-only transactional email via the Resend REST API. No SDK dependency —
// a raw fetch, matching how Meta / TasaReal are called elsewhere. RESEND_API_KEY
// and FROM_EMAIL are server-only env vars and must never reach the browser (the
// "server-only" import above fails the build if this module is pulled into a
// client component). Fire-and-forget: never throws to the caller; a failed send
// is logged (no PII in the log) and swallowed so it never blocks the flow.
interface SendArgs {
  to: string;
  subject: string;
  text: string;
}

export async function sendAgentEmail({ to, subject, text }: SendArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("[email] RESEND_API_KEY/FROM_EMAIL not configured");
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error("[email] Resend send failed with status", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Resend send error:", (err as Error).message);
    return false;
  }
}
