interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();
const MAX_TRACKED_KEYS = 2000;

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  now = Date.now()
): RateLimitDecision {
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, bucket] of buckets.entries()) {
      const fresh = bucket.timestamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) {
        buckets.delete(k);
      } else {
        bucket.timestamps = fresh;
      }
    }
  }

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryMs = Math.max(1000, windowMs - (now - oldest));
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryMs / 1000),
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - bucket.timestamps.length),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimiterForTests(): void {
  buckets.clear();
}
