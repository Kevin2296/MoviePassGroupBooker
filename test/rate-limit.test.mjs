import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, RateLimitError } from '../src/rate-limit.js';

test('begrens aanvragen per tijdelijk, geanonimiseerd client-ID', () => {
  const limiter = new RateLimiter();
  limiter.check('client:create', { limit: 2, windowMs: 1_000 }, 0);
  limiter.check('client:create', { limit: 2, windowMs: 1_000 }, 1);
  assert.throws(() => limiter.check('client:create', { limit: 2, windowMs: 1_000 }, 2), RateLimitError);
  assert.doesNotThrow(() => limiter.check('client:create', { limit: 2, windowMs: 1_000 }, 1_001));
});
