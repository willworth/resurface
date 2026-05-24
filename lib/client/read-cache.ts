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
