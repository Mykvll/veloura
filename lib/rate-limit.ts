import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

/**
 * Per-IP rate limiting for the public reserve server actions, backed by Upstash
 * Redis.
 *
 * WHY UPSTASH (and not an in-memory counter): the reserve actions run in
 * Vercel's serverless runtime, where each invocation can be a fresh, isolated
 * instance — an in-process Map wouldn't share counts between requests. Upstash
 * is a network Redis reachable over HTTP, so all invocations see one shared
 * counter.
 *
 * WHY IT'S OPTIONAL: the limiter only switches on when both Upstash env vars are
 * set. Locally they usually aren't, so this no-ops and lets every request
 * through — the dev flow stays frictionless and the app has no hard dependency
 * on a network service just to run. Set UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN in Vercel (Preview + Production) to enable it there.
 */
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

/**
 * Sliding-window limits, one bucket per action. Tuned well above what a real
 * customer clicking through the flow would hit, but low enough to choke a bot
 * spamming holds/payments/fittings. Holds and payments are the abuse-sensitive
 * paths (a hold blocks a dress's dates for ~10 min), so they get tight caps.
 */
const LIMITS = {
  "rent-hold": { tokens: 8, window: "1 m" },
  "rent-payment": { tokens: 8, window: "1 m" },
  fitting: { tokens: 6, window: "1 m" },
} as const;

export type RateLimitedAction = keyof typeof LIMITS;

// Build each limiter once at module load and reuse across requests. Keyed by
// action so one action's traffic can't exhaust another's budget.
const limiters = redis
  ? new Map<RateLimitedAction, Ratelimit>(
      (Object.keys(LIMITS) as RateLimitedAction[]).map((name) => [
        name,
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(
            LIMITS[name].tokens,
            LIMITS[name].window,
          ),
          prefix: `rl:${name}`,
          analytics: false,
        }),
      ]),
    )
  : null;

/** The caller's IP, read from the proxy headers Vercel/Next set in front of us. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  // x-forwarded-for is a comma-separated list; the first entry is the client.
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * True when the request is within the action's per-IP window (or when limiting
 * is disabled because Upstash isn't configured). False when the caller has
 * exceeded the window and should be turned away.
 */
export async function withinRateLimit(
  action: RateLimitedAction,
): Promise<boolean> {
  if (!limiters) return true;
  const ip = await clientIp();
  const { success } = await limiters.get(action)!.limit(ip);
  return success;
}
