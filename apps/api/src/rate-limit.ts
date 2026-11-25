/**
 * In-memory fixed-window limiter, per key. Good enough for one API instance; move to
 * Redis when the API runs on more than one instance.
 */
export const createRateLimiter = (max: number, windowMs: number, now: () => number = Date.now) => {
  const windows = new Map<string, { start: number; count: number }>()
  return {
    /** Returns seconds to wait, or 0 when the call is allowed (and counted). */
    consume(key: string): number {
      const t = now()
      const w = windows.get(key)
      if (!w || t - w.start >= windowMs) {
        windows.set(key, { start: t, count: 1 })
        return 0
      }
      if (w.count >= max) return Math.ceil((w.start + windowMs - t) / 1000)
      w.count++
      return 0
    },
  }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>
