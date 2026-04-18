/**
 * Rate limiter — Upstash Redis (distributed) with in-memory fallback.
 *
 * Upstash is used when both env vars are set:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Without them the limiter falls back to per-instance in-memory state,
 * which is fine for local dev but does NOT share state across Vercel
 * edge instances in production.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Upstash path ───────────────────────────────────────────────────────────────

// Cache Ratelimit instances by config so we only initialise each one once.
const limiterCache = new Map<string, Ratelimit>();

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }

  const cacheKey = `${limit}:${windowMs}`;
  if (limiterCache.has(cacheKey)) return limiterCache.get(cacheKey)!;

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${Math.ceil(windowMs / 1000)} s`),
    analytics: false,
    prefix: "crm:rl",
  });

  limiterCache.set(cacheKey, ratelimit);
  return ratelimit;
}

// ── In-memory fallback ─────────────────────────────────────────────────────────

interface MemEntry {
  count: number;
  resetAt: number;
}

const memStore = new Map<string, MemEntry>();

// Purge expired entries every 5 minutes to avoid memory leaks.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore.entries()) {
    if (entry.resetAt < now) memStore.delete(key);
  }
}, 5 * 60 * 1000);

function checkMemLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = memStore.get(key);

  if (!entry || entry.resetAt < now) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Check rate limit for a given key.
 *
 * @param key     Identifier (e.g. `"sign-in:1.2.3.4"`)
 * @param limit   Max requests allowed in the window
 * @param windowMs Window duration in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const ratelimit = getUpstashLimiter(limit, windowMs);

  if (!ratelimit) {
    return checkMemLimit(key, limit, windowMs);
  }

  const { success, remaining, reset } = await ratelimit.limit(key);
  return { allowed: success, remaining, resetAt: reset };
}
