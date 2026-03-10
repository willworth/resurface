// apps/resurface/components/resurface-client.tsx

// packages/apps/resurface/components/resurface-client.tsx

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SnoozePreset } from '@/lib/server/snooze'
import { ResurfaceItem } from '@/lib/server/types'

type NextItemResponse = {
  item: ResurfaceItem | null
  forceDecision: boolean
}

const PRESETS: Array<{ label: string; value: SnoozePreset }> = [
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This weekend', value: 'this-weekend' },
  { label: 'Next week', value: 'next-week' },
  { label: 'In a month', value: 'in-a-month' },
  { label: 'Surprise me', value: 'surprise' },
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

function categoryClassName(category: ResurfaceItem['category']): string {
  switch (category) {
    case 'music':
      return 'card card-music'
    case 'quote':
      return 'card card-quote'
    case 'tool':
      return 'card card-tool'
    case 'article':
      return 'card card-article'
    case 'idea':
      return 'card card-idea'
    case 'reference':
      return 'card card-reference'
    case 'link':
    default:
      return 'card card-link'
  }
}

export function ResurfaceClient() {
  const [item, setItem] = useState<ResurfaceItem | null>(null)
  const [forceDecision, setForceDecision] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLaterMenu, setShowLaterMenu] = useState(false)
  const [archivedTo, setArchivedTo] = useState('')

  const loadNext = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/items/next', { method: 'GET' })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? 'Unable to load item')
      }

      const payload = (await response.json()) as NextItemResponse
      setItem(payload.item)
      setForceDecision(payload.forceDecision)
      setArchivedTo(payload.item?.suggestedArchive ?? '')
      setShowLaterMenu(false)
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Unexpected error'
      )
      setItem(null)
      setForceDecision(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNext()
  }, [loadNext])

  const takeAction = useCallback(
    async (endpoint: string, body: Record<string, unknown> = {}) => {
      if (!item) {
        return
      }

      setLoading(true)
      setError(null)
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error ?? 'Action failed')
        }

        await loadNext()
      } catch (actionError) {
        setLoading(false)
        setError(
          actionError instanceof Error
            ? actionError.message
            : 'Unexpected error'
        )
      }
    },
    [item, loadNext]
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
      if (!item) return
      void takeAction(`/api/items/${item.id}/snooze`, { preset })
    },
    [item, takeAction]
  )

  const onOpen = useCallback(() => {
    if (!item?.url) return
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }, [item])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return
      }

      if (!item) return

      const key = event.key.toLowerCase()
      if (key === 'a') {
        event.preventDefault()
        onArchive()
      }
      if (key === 'l') {
        event.preventDefault()
        setShowLaterMenu((current) => !current)
      }
      if (key === 'd') {
        event.preventDefault()
        onDrop()
      }
      if (key === 'o' && item.url) {
        event.preventDefault()
        onOpen()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [item, onArchive, onDrop, onOpen])

  const savedDaysAgo = useMemo(
    () => (item ? daysAgo(item.capturedAt) : 0),
    [item]
  )

  return (
    <main className="page-shell">
      <section className="stack">
        <header className="header">
          <h1>Resurface</h1>
          <p>One saved item at a time.</p>
        </header>

        {loading && <p className="status">Loading next item…</p>}

        {!loading && error && <p className="error">{error}</p>}

        {!loading && !error && !item && (
          <div className="empty-state">
            <h2>Nothing to surface right now</h2>
            <p>All active items are either snoozed or resolved.</p>
          </div>
        )}

        {!loading && !error && item && (
          <article className={categoryClassName(item.category)}>
            <div className="meta-row">
              <span className="badge">{CATEGORY_LABELS[item.category]}</span>
              <span className="saved">saved {savedDaysAgo} days ago</span>
            </div>

            <h2>{item.title}</h2>
            {item.summary ? <p className="summary">{item.summary}</p> : null}
            <p className="original">{item.originalText}</p>

            {item.url ? (
              <button type="button" className="link" onClick={onOpen}>
                {item.url}
              </button>
            ) : null}

            <label className="archive-label" htmlFor="archive-category">
              Suggested archive
            </label>
            <input
              id="archive-category"
              value={archivedTo}
              onChange={(event) => setArchivedTo(event.target.value)}
              className="archive-input"
            />

            {forceDecision ? (
              <p className="warning">
                You&apos;ve snoozed this 5 times. Archive or drop.
              </p>
            ) : null}

            <div className="actions">
              <button type="button" onClick={onArchive}>
                ✓ Archive (A)
              </button>

              <div className="later-wrap">
                <button
                  type="button"
                  onClick={() => setShowLaterMenu((current) => !current)}
                >
                  ⏰ Later (L)
                </button>
                {showLaterMenu ? (
                  <div className="later-menu">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => onSnooze(preset.value)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button type="button" className="danger" onClick={onDrop}>
                🗑 Drop (D)
              </button>
            </div>

            <p className="hint">
              Keyboard: A archive · L later · D drop · O open URL
            </p>
          </article>
        )}
      </section>
    </main>
  )
}
