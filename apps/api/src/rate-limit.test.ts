import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('allows max calls per window per key, then reports the wait', () => {
    let t = 0
    const limiter = createRateLimiter(2, 10_000, () => t)
    expect(limiter.consume('a')).toBe(0)
    expect(limiter.consume('a')).toBe(0)
    expect(limiter.consume('a')).toBe(10)
    expect(limiter.consume('b')).toBe(0)
    t = 4_000
    expect(limiter.consume('a')).toBe(6)
    t = 10_000
    expect(limiter.consume('a')).toBe(0)
  })
})
