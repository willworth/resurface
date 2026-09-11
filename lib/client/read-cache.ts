'use client'

type CachedPayload<T> = {
  cachedAt: string
  payload: T
}

export type ReadCacheResult<T> = CachedPayload<T> & {
  stale: true
}

export function readCachedPayload<T>(key: string): ReadCacheResult<T> | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const cached = JSON.parse(raw) as CachedPayload<T>
    if (!cached || typeof cached.cachedAt !== 'string') return null

    return { ...cached, stale: true }
  } catch {
    return null
  }
}

export function writeCachedPayload<T>(key: string, payload: T): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ cachedAt: new Date().toISOString(), payload })
    )
  } catch {
    // Cache writes are best-effort only. The remote DB remains the source of truth.
  }
}

export function clearCachedPayload(key: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(key)
  } catch {
    // Cache invalidation is best-effort.
  }
}

export function invalidateReadCache(pattern?: string): void {
  if (typeof window === 'undefined') return

  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key) continue
      if (pattern ? key.includes(pattern) : key.startsWith('resurface:read-cache:')) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Cache invalidation is best-effort.
  }
}
