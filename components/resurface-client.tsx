// apps/resurface/components/resurface-client.tsx

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SnoozePreset } from '@/lib/server/snooze'
import { ResurfaceItem } from '@/lib/server/types'

type NextItemResponse = {
  item: ResurfaceItem | null
  forceDecision: boolean
  remaining: number
}

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

/** Try to extract a clean title from potentially messy markdown-in-title text */
function cleanTitle(item: ResurfaceItem): string {
  const raw = item.title ?? ''
  // Strip markdown link syntax: [text](url) → text
  const stripped = raw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // If title is just the URL, use domain instead
  if (stripped === item.url || stripped === item.originalText) {
    try {
      return new URL(item.url ?? '').hostname.replace('www.', '')
    } catch {
      return stripped
    }
  }
  return stripped.trim()
}

/** Get display text — avoid showing URL twice */
function getDescription(item: ResurfaceItem): string | null {
  const text = item.originalText ?? ''
  // If originalText is just the URL, skip it (URL is shown separately)
  if (text === item.url) return null
  // If it's the same as title, skip it
  if (text === item.title) return null
  return text
}

function QuickCapture({ onCaptured }: { onCaptured: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const submit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) return

    setSaving(true)
    setFlash(null)

    try {
      // Detect if it's a URL or freeform text
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
      if (e.key === 'Escape') {
        setOpen(false)
      }
    },
    [submit]
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
    <div className="capture-form" onKeyDown={handleKeyDown}>
      <input
        autoFocus
        className="capture-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a URL or type an idea…"
        disabled={saving}
      />
      <input
        className="capture-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        disabled={saving}
      />
      <div className="capture-actions">
        <button
          type="button"
          className="capture-save"
          onClick={submit}
          disabled={saving || !text.trim()}
        >
          {saving ? '…' : 'Save'}
        </button>
        <button
          type="button"
          className="capture-cancel"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
        {flash && <span className="capture-flash">{flash}</span>}
      </div>
      <span className="capture-hint">⌘↵ to save · Esc to close</span>
    </div>
  )
}

export function ResurfaceClient() {
  const [item, setItem] = useState<ResurfaceItem | null>(null)
  const [forceDecision, setForceDecision] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [archivedTo, setArchivedTo] = useState('')
  const [transitioning, setTransitioning] = useState(false)

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
      setRemaining(payload.remaining)
      setArchivedTo(payload.item?.suggestedArchive ?? '')
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
      if (!item) return

      setTransitioning(true)
      setError(null)

      // Brief fade-out before loading next
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

        await loadNext()
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
      if (!item || forceDecision) return
      void takeAction(`/api/items/${item.id}/snooze`, { preset })
    },
    [item, forceDecision, takeAction]
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
      } else if (key === 'd') {
        event.preventDefault()
        onDrop()
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
  }, [forceDecision, item, onArchive, onDrop, onOpen, onSnooze])

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
      <section className="stack">
        <header className="header">
          <div className="header-row">
            <h1>Resurface</h1>
            <div className="header-right">
              {remaining > 0 && (
                <Link href="/items" className="remaining">
                  {remaining} items
                </Link>
              )}
              <QuickCapture onCaptured={loadNext} />
            </div>
          </div>
        </header>

        {loading && !transitioning && (
          <p className="status">Loading next item…</p>
        )}

        {!loading && error && <p className="error">{error}</p>}

        {!loading && !error && !item && (
          <div className="empty-state">
            <h2>Nothing to surface right now</h2>
            <p>All active items are either snoozed or resolved.</p>
          </div>
        )}

        {!loading && !error && item && (
          <article
            className={`${categoryClassName(item.category)}${transitioning ? ' fading' : ''}`}
          >
            <div className="meta-row">
              <span className="badge">{CATEGORY_LABELS[item.category]}</span>
              <div className="meta-right">
                {item.snoozeCount > 0 && (
                  <span className="snooze-count">
                    snoozed {item.snoozeCount}/5
                  </span>
                )}
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

            <label className="archive-label" htmlFor="archive-category">
              Archive to
            </label>
            <input
              id="archive-category"
              value={archivedTo}
              onChange={(event) => setArchivedTo(event.target.value)}
              className="archive-input"
              placeholder="e.g. Dev Tools / AI Agents"
            />

            {forceDecision ? (
              <p className="warning">
                Snoozed 5 times — time to decide. Archive or drop.
              </p>
            ) : null}

            <div className="actions">
              <button
                type="button"
                className="action-archive"
                onClick={onArchive}
              >
                ✓ Archive
              </button>

              <div className="snooze-bar">
                {SNOOZE_SHORTCUTS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    disabled={forceDecision}
                    className="snooze-btn"
                    onClick={() => onSnooze(preset.value)}
                    title={preset.label}
                  >
                    {preset.shortLabel}
                  </button>
                ))}
              </div>

              <button type="button" className="action-drop" onClick={onDrop}>
                ✕ Drop
              </button>
            </div>

            <div className="shortcut-cheat">
              <span>
                <kbd>A</kbd> archive
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
                <kbd>D</kbd> drop
              </span>
              <span>
                <kbd>O</kbd> open
              </span>
            </div>
          </article>
        )}
      </section>
    </main>
  )
}
