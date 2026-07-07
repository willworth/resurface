// apps/resurface/components/resurface-client.tsx

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { readCachedPayload, writeCachedPayload } from '@/lib/client/read-cache'
import { SnoozePreset } from '@/lib/server/snooze'
import { ResurfaceItem } from '@/lib/server/types'

type NextItemResponse = {
  item: ResurfaceItem | null
  forceDecision: boolean
  remaining: number
}

const NEXT_ITEM_CACHE_KEY = 'resurface:read-cache:next-item'

const SNOOZE_SHORTCUTS: Array<{
  key: string
  label: string
  value: SnoozePreset
  shortLabel: string
}> = [
  { key: '1', label: 'Tomorrow', value: 'tomorrow', shortLabel: '1d' },
  { key: '2', label: '3 days', value: 'this-weekend', shortLabel: '3d' },
  { key: '3', label: 'Next week', value: 'next-week', shortLabel: '1w' },
  { key: '4', label: 'Month', value: 'in-a-month', shortLabel: '1m' },
  { key: '5', label: 'Surprise', value: 'surprise', shortLabel: '?' },
]

const CATEGORY_LABELS: Record<ResurfaceItem['category'], string> = {
  link: 'LINK',
  quote: 'QUOTE',
  music: 'MUSIC',
  tool: 'TOOL',
  article: 'ARTICLE',
  idea: 'IDEA',
  reference: 'REFERENCE',
}

function daysAgo(iso: string): number {
  const captured = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - captured.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

function daysAgoLabel(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function categoryClassName(category: ResurfaceItem['category']): string {
  const map: Record<string, string> = {
    music: 'card card-music',
    quote: 'card card-quote',
    tool: 'card card-tool',
    article: 'card card-article',
    idea: 'card card-idea',
    reference: 'card card-reference',
  }
  return map[category] ?? 'card card-link'
}

function cleanTitle(item: ResurfaceItem): string {
  const raw = item.title ?? ''
  const stripped = raw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  if (stripped === item.url || stripped === item.originalText) {
    try {
      return new URL(item.url ?? '').hostname.replace('www.', '')
    } catch {
      return stripped
    }
  }
  return stripped.trim()
}

function getDescription(item: ResurfaceItem): string | null {
  const text = item.originalText ?? ''
  if (text === item.url) return null
  if (text === item.title) return null
  return text
}

function CaptureComposer({
  onCaptured,
  inline = false,
  disabled = false,
}: {
  onCaptured: () => void
  inline?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(inline)
  const [text, setText] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (inline) setOpen(true)
  }, [inline])

  const submit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) return

    setSaving(true)
    setFlash(null)

    try {
      const isUrl = /^https?:\/\//i.test(trimmed)

      const item = {
        text: isUrl ? notes.trim() || trimmed : trimmed,
        url: isUrl ? trimmed : null,
        source: 'web-ui',
        summary: notes.trim() || null,
      }

      const res = await fetch('/api/ingest/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [item], source: 'web-ui' }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to save')
      }

      const result = (await res.json()) as {
        persisted: number
        duplicates: number
      }

      if (result.duplicates > 0) {
        setFlash('Already saved')
      } else {
        setFlash('Saved ✓')
        setText('')
        setNotes('')
        onCaptured()
      }

      setTimeout(() => setFlash(null), 2000)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : 'Error')
      setTimeout(() => setFlash(null), 3000)
    } finally {
      setSaving(false)
    }
  }, [text, notes, onCaptured])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void submit()
      }
      if (e.key === 'Escape' && !inline) {
        setOpen(false)
      }
    },
    [inline, submit]
  )

  if (!open) {
    return (
      <button
        type="button"
        className="capture-toggle"
        onClick={() => setOpen(true)}
        title="Quick capture (paste a URL or idea)"
      >
        +
      </button>
    )
  }

  return (
    <div
      className={inline ? 'capture-panel' : 'capture-form'}
      onKeyDown={handleKeyDown}
    >
      {inline ? (
        <div className="capture-panel-head">
          <h2>Capture</h2>
          <p>Drop in a URL, note, or idea without leaving the front page.</p>
        </div>
      ) : null}
      <textarea
        autoFocus={!inline}
        className="capture-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a URL or type an idea…"
        disabled={saving || disabled}
        rows={inline ? 4 : 2}
      />
      <input
        className="capture-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        disabled={saving || disabled}
      />
      <div className="capture-actions">
        <button
          type="button"
          className="capture-save"
          onClick={submit}
          disabled={saving || disabled || !text.trim()}
        >
          {saving ? '…' : 'Save'}
        </button>
        {!inline ? (
          <button
            type="button"
            className="capture-cancel"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        ) : null}
        {flash ? <span className="capture-flash">{flash}</span> : null}
      </div>
      <span className="capture-hint">⌘↵ to save{inline ? '' : ' · Esc to close'}</span>
    </div>
  )
}

export function ResurfaceClient() {
  const [item, setItem] = useState<ResurfaceItem | null>(null)
  const [forceDecision, setForceDecision] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cacheNotice, setCacheNotice] = useState<string | null>(null)
  const [showingCachedData, setShowingCachedData] = useState(false)
  const [archivedTo, setArchivedTo] = useState('')
  const [transitioning, setTransitioning] = useState(false)
  const [passedIds, setPassedIds] = useState<string[]>([])
  const [homeSearch, setHomeSearch] = useState('')

  const loadNext = useCallback(async (excludeIds: string[] = []) => {
    setLoading(true)
    setError(null)

    try {
      const query = new URLSearchParams()
      for (const id of excludeIds) {
        query.append('exclude', id)
      }
      const endpoint = query.size > 0 ? `/api/items/next?${query}` : '/api/items/next'
      const response = await fetch(endpoint, { method: 'GET' })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? 'Unable to load item')
      }

      const payload = (await response.json()) as NextItemResponse
      writeCachedPayload(NEXT_ITEM_CACHE_KEY, payload)
      setItem(payload.item)
      setForceDecision(payload.forceDecision)
      setRemaining(payload.remaining)
      setArchivedTo(payload.item?.suggestedArchive ?? '')
      setCacheNotice(null)
      setShowingCachedData(false)
    } catch (nextError) {
      const cached = readCachedPayload<NextItemResponse>(NEXT_ITEM_CACHE_KEY)

      if (cached) {
        const when = new Date(cached.cachedAt).toLocaleString()
        setItem(cached.payload.item)
        setForceDecision(cached.payload.forceDecision)
        setRemaining(cached.payload.remaining)
        setArchivedTo(cached.payload.item?.suggestedArchive ?? '')
        setCacheNotice(
          `Showing last cached item from ${when}. Writes are disabled until Resurface reconnects.`
        )
        setShowingCachedData(true)
      } else {
        setError(
          nextError instanceof Error ? nextError.message : 'Unexpected error'
        )
        setItem(null)
        setForceDecision(false)
        setCacheNotice(null)
        setShowingCachedData(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNext()
  }, [loadNext])

  const takeAction = useCallback(
    async (endpoint: string, body: Record<string, unknown> = {}) => {
      if (!item) return
      if (showingCachedData) {
        setError('Writes are disabled while showing cached data.')
        return
      }

      setTransitioning(true)
      setError(null)

      await new Promise((r) => setTimeout(r, 150))

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error ?? 'Action failed')
        }

        await loadNext(passedIds)
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : 'Unexpected error'
        )
      } finally {
        setTransitioning(false)
      }
    },
    [item, loadNext, passedIds, showingCachedData]
  )

  const onArchive = useCallback(() => {
    if (!item) return
    void takeAction(`/api/items/${item.id}/archive`, {
      archivedTo: archivedTo.trim().length > 0 ? archivedTo.trim() : null,
    })
  }, [archivedTo, item, takeAction])

  const onDrop = useCallback(() => {
    if (!item) return
    void takeAction(`/api/items/${item.id}/drop`)
  }, [item, takeAction])

  const onSnooze = useCallback(
    (preset: SnoozePreset) => {
      if (!item || forceDecision) return
      void takeAction(`/api/items/${item.id}/snooze`, { preset })
    },
    [item, forceDecision, takeAction]
  )

  const onPass = useCallback(async () => {
    if (!item) return
    if (showingCachedData) {
      setError('Writes are disabled while showing cached data.')
      return
    }

    const nextPassedIds = [...passedIds, item.id]
    setPassedIds(nextPassedIds)
    setTransitioning(true)
    setError(null)

    await new Promise((r) => setTimeout(r, 100))

    try {
      const response = await fetch(`/api/items/${item.id}/pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? 'Pass failed')
      }

      await loadNext(nextPassedIds)
    } catch (passError) {
      setPassedIds(passedIds)
      setError(
        passError instanceof Error ? passError.message : 'Unexpected error'
      )
    } finally {
      setTransitioning(false)
    }
  }, [item, loadNext, passedIds, showingCachedData])

  const onOpen = useCallback(() => {
    if (!item?.url) return
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }, [item])

  const onSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const query = homeSearch.trim()
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      window.location.assign(params.size > 0 ? `/library?${params}` : '/library')
    },
    [homeSearch]
  )

  const onToggleStar = useCallback(async () => {
    if (!item) return
    if (showingCachedData) {
      setError('Writes are disabled while showing cached data.')
      return
    }

    setError(null)
    try {
      const response = await fetch(`/api/items/${item.id}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !item.pinnedAt }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? 'Could not update star')
      }

      const payload = (await response.json()) as { item: ResurfaceItem }
      setItem(payload.item)
    } catch (starError) {
      setError(
        starError instanceof Error ? starError.message : 'Could not update star'
      )
    }
  }, [item, showingCachedData])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return
      }

      if (!item) return
      if (showingCachedData) return

      const key = event.key.toLowerCase()

      if (key === 'a') {
        event.preventDefault()
        onArchive()
      } else if (key === 'd') {
        event.preventDefault()
        onDrop()
      } else if (key === 'n' || event.key === 'ArrowRight') {
        event.preventDefault()
        void onPass()
      } else if (key === 'o' && item.url) {
        event.preventDefault()
        onOpen()
      } else if (
        !forceDecision &&
        SNOOZE_SHORTCUTS.some((s) => s.key === key)
      ) {
        event.preventDefault()
        const preset = SNOOZE_SHORTCUTS.find((s) => s.key === key)
        if (preset) onSnooze(preset.value)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    forceDecision,
    item,
    onArchive,
    onDrop,
    onOpen,
    onPass,
    onSnooze,
    showingCachedData,
  ])

  const savedDaysAgo = useMemo(
    () => (item ? daysAgo(item.capturedAt) : 0),
    [item]
  )

  const title = useMemo(() => (item ? cleanTitle(item) : ''), [item])
  const description = useMemo(
    () => (item ? getDescription(item) : null),
    [item]
  )

  return (
    <main className="page-shell">
      <section className="stack home-stack">
        <header className="header home-header">
          <div className="home-heading">
            <h1>Resurface</h1>
            <p className="home-subtitle">
              Review one thing at a time, keep the good stuff, and capture new
              things the moment they cross your mind.
            </p>
          </div>
        </header>

        <div className="home-top-grid">
          <Link href="/library" className="home-library-panel">
            <span className="home-panel-kicker">Library</span>
            <strong>{remaining} in review</strong>
            <span>
              Browse, search, clean up, and manage what you&apos;ve saved.
            </span>
          </Link>

          <form className="home-search-panel" onSubmit={onSearchSubmit}>
            <label htmlFor="home-search">Search saved things</label>
            <div className="home-search-row">
              <input
                id="home-search"
                value={homeSearch}
                onChange={(event) => setHomeSearch(event.target.value)}
                placeholder="Search titles, notes, URLs…"
              />
              <button type="submit">Search</button>
            </div>
          </form>
        </div>

        <div className="home-capture-row">
          <CaptureComposer
            inline
            onCaptured={loadNext}
            disabled={showingCachedData}
          />
        </div>

        {loading && !transitioning ? (
          <p className="status">Loading next item…</p>
        ) : null}

        {!loading && cacheNotice ? (
          <p className="cache-warning">{cacheNotice}</p>
        ) : null}

        {!loading && error ? <p className="error">{error}</p> : null}

        {!loading && !error && !item ? (
          <div className="empty-state">
            <h2>Nothing to surface right now</h2>
            <p>Everything in review is either snoozed or already kept.</p>
          </div>
        ) : null}

        {!loading && !error && item ? (
          <article
            className={`${categoryClassName(item.category)}${transitioning ? ' fading' : ''}`}
          >
            <div className="meta-row">
              <span className="badge">{CATEGORY_LABELS[item.category]}</span>
              <div className="meta-right">
                {item.pinnedAt ? <span className="starred-label">starred</span> : null}
                {item.snoozeCount > 0 ? (
                  <span className="snooze-count">
                    snoozed {item.snoozeCount}/5
                  </span>
                ) : null}
                <span className="saved">{daysAgoLabel(savedDaysAgo)}</span>
              </div>
            </div>

            <h2>{title}</h2>
            {description ? <p className="description">{description}</p> : null}
            {item.summary ? <p className="summary">{item.summary}</p> : null}

            {item.url ? (
              <button type="button" className="link" onClick={onOpen}>
                {(() => {
                  try {
                    const u = new URL(item.url)
                    return u.hostname.replace('www.', '') + u.pathname
                  } catch {
                    return item.url
                  }
                })()}
              </button>
            ) : null}

            <button
              type="button"
              className={`star-inline-btn${item.pinnedAt ? ' star-inline-btn-active' : ''}`}
              onClick={() => void onToggleStar()}
              disabled={showingCachedData}
              title={item.pinnedAt ? 'Remove star' : 'Star this'}
            >
              {item.pinnedAt ? '★ Starred' : '☆ Star'}
            </button>

            <label className="archive-label" htmlFor="archive-category">
              Keep in library
            </label>
            <input
              id="archive-category"
              value={archivedTo}
              onChange={(event) => setArchivedTo(event.target.value)}
              className="archive-input"
              placeholder="e.g. AI tools / essays / drums"
              disabled={showingCachedData}
            />

            {forceDecision ? (
              <p className="warning">
                Snoozed 5 times. You can still pass for now, but this is worth a real keep/drop decision soon.
              </p>
            ) : null}

            <div className="actions">
              <button
                type="button"
                className="action-pass"
                onClick={() => void onPass()}
                disabled={showingCachedData}
              >
                Next
              </button>

              <button
                type="button"
                className="action-archive"
                onClick={onArchive}
                disabled={showingCachedData}
              >
                ✓ Keep
              </button>

              <div className="snooze-bar">
                {SNOOZE_SHORTCUTS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    disabled={forceDecision || showingCachedData}
                    className="snooze-btn"
                    onClick={() => onSnooze(preset.value)}
                    title={preset.label}
                  >
                    {preset.shortLabel}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="action-drop"
                onClick={onDrop}
                disabled={showingCachedData}
              >
                ✕ Drop
              </button>
            </div>

            <div className="shortcut-cheat">
              <span>
                <kbd>A</kbd> keep
              </span>
              <span>
                <kbd>1</kbd> 1d
              </span>
              <span>
                <kbd>2</kbd> 3d
              </span>
              <span>
                <kbd>3</kbd> 1w
              </span>
              <span>
                <kbd>4</kbd> 1m
              </span>
              <span>
                <kbd>5</kbd> ?
              </span>
              <span>
                <kbd>N</kbd> next
              </span>
              <span>
                <kbd>→</kbd> next
              </span>
              <span>
                <kbd>D</kbd> drop
              </span>
              <span>
                <kbd>O</kbd> open
              </span>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  )
}
