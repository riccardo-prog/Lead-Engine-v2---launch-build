/**
 * In-memory rate limiter. Token bucket algorithm.
 *
 * WARNING: This is effectively a no-op on Vercel serverless — each function
 * invocation may get a fresh process with an empty bucket. The setInterval
 * sweeper also does not work without a long-lived process.
 *
 * TODO: Replace with Upstash Ratelimit (@upstash/ratelimit) before production.
 * The INTERNAL_API_SECRET still protects the intake endpoint, so this is a
 * defense-in-depth gap, not a total exposure.
 */

type Bucket = {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()

// Sweep stale buckets every 5 minutes to prevent unbounded memory growth.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000
const STALE_MS = 30 * 60 * 1000

let sweeperStarted = false
function startSweeper() {
  if (sweeperStarted) return
  sweeperStarted = true
  setInterval(() => {
    const cutoff = Date.now() - STALE_MS
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.lastRefill < cutoff) buckets.delete(key)
    }
  }, SWEEP_INTERVAL_MS).unref?.()
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetInSeconds: number
}

/**
 * @param key        Unique identity for the caller (user id, token hash, IP).
 * @param capacity   Max requests in a burst.
 * @param refillPerMinute  Tokens added per minute (steady-state rate).
 */
export function rateLimit({
  key,
  capacity,
  refillPerMinute,
}: {
  key: string
  capacity: number
  refillPerMinute: number
}): RateLimitResult {
  startSweeper()

  const now = Date.now()
  const bucket = buckets.get(key) || { tokens: capacity, lastRefill: now }

  const elapsedMs = now - bucket.lastRefill
  const refillAmount = (elapsedMs / 60_000) * refillPerMinute
  bucket.tokens = Math.min(capacity, bucket.tokens + refillAmount)
  bucket.lastRefill = now

  if (bucket.tokens < 1) {
    const secondsToOneToken = Math.ceil((1 - bucket.tokens) / (refillPerMinute / 60))
    buckets.set(key, bucket)
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: secondsToOneToken,
    }
  }

  bucket.tokens -= 1
  buckets.set(key, bucket)

  return {
    allowed: true,
    remaining: Math.floor(bucket.tokens),
    resetInSeconds: Math.ceil((capacity - bucket.tokens) / (refillPerMinute / 60)),
  }
}