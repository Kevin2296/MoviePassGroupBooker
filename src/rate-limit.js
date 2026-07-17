export class RateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('Te veel aanvragen. Probeer het over enkele minuten opnieuw.');
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  check(key, { limit, windowMs }, now = Date.now()) {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (bucket.count >= limit) {
      throw new RateLimitError(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
    }
    bucket.count++;
  }

  cleanup(now = Date.now()) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
