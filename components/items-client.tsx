// apps/resurface/components/items-client.tsx

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { readCachedPayload, writeCachedPayload } from '@/lib/client/read-cache'

type SnoozePreset =
  | 'tomorrow'
  | 'this-weekend'
  | 'next-week'
  | 'in-a-month'
  | 'surprise'

const SNOOZE_OPTIONS: Array<{ value: SnoozePreset; label: string }> = [
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this-weekend', label: '3 days' },
  { value: 'next-week', label: 'Next week' },
  { value: 'in-a-month', label: 'Month' },
  { value: 'surprise', label: 'Surprise' },
]

type ListItem = {
  id: string
  url: string | null
  title: string
  summary: string | null
  previewSiteName: string | null
  previewDescription: string | null
  previewImageUrl: string | null
  previewFetchedAt: string | null
  originalText: string
  category: string
  source: string
  status: string
  capturedAt: string
  lastSurfacedAt: string | null
  snoozeCount: number
  suppressUntil: string | null
  suggestedArchive: string | null
  archivedTo: string | null
  libraryShelf: string | null
  libraryPriority: number
  pinnedAt: string | null
  tags: string[]
}

type ListResponse = {
  items: ListItem[]
  total: number
  page: number
  totalPages: number
  pageSize: number
  counts: Record<string, number>
}

type SortCol =
  | 'captured_at'
  | 'title'
  | 'category'
  | 'snooze_count'
  | 'library_priority'
  | 'pinned_at'
  | 'source'
  | 'random'
type ActionKind = 'keep' | 'drop' | 'snooze'

function listCacheKey(params: URLSearchParams): string {
  return `resurface:read-cache:list:${params.toString()}`
}

function OpenInNewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <path
        d="M11.5 4.5h4v4M15.2 4.8l-6.7 6.7M12 10.5v3.2a1.3 1.3 0 0 1-1.3 1.3H6.3A1.3 1.3 0 0 1 5 13.7V9.3A1.3 1.3 0 0 1 6.3 8H9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SelectIcon({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <rect
        x="4.2"
        y="4.2"
        width="11.6"
        height="11.6"
        rx="2.6"
        fill={selected ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {selected ? (
        <path
          d="M7 10.2 9.1 12.3 13.2 8.2"
          fill="none"
          stroke="#101922"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <circle cx="5" cy="10" r="1.4" fill="currentColor" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
      <circle cx="15" cy="10" r="1.4" fill="currentColor" />
    </svg>
  )
}

function CogIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <path
        d="M8.3 3.1h3.4l.4 1.7a5.7 5.7 0 0 1 1.4.8l1.6-.7 1.7 2.9-1.2 1.2c.1.3.1.7.1 1s0 .7-.1 1l1.2 1.2-1.7 2.9-1.6-.7a5.7 5.7 0 0 1-1.4.8l-.4 1.7H8.3l-.4-1.7a5.7 5.7 0 0 1-1.4-.8l-1.6.7-1.7-2.9 1.2-1.2A5 5 0 0 1 4.3 10c0-.3 0-.7.1-1L3.2 7.8l1.7-2.9 1.6.7c.4-.3.9-.6 1.4-.8l.4-1.7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle
        cx="10"
        cy="10"
        r="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
      />
    </svg>
  )
}

function daysAgo(iso: string): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
  )
  if (days === 0) return 'today'
  if (days === 1) return '1d'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

function cleanTitle(title: string, url: string | null): string {
  const stripped = title.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
  if (stripped === url) {
    try {
      return new URL(url ?? '').hostname.replace('www.', '')
    } catch {
      return stripped
    }
  }
  return stripped || 'Untitled'
}

function isGenericTitle(title: string, url: string | null): boolean {
  const stripped = title
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()

  if (!stripped || stripped === 'untitled capture') return true
  if (url && stripped === url.trim().toLowerCase()) return true

  try {
    const host = new URL(url ?? '').hostname.replace(/^www\./, '').toLowerCase()
    return (
      stripped === host ||
      ['youtube', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(stripped)
    )
  } catch {
    return ['youtube', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(
      stripped
    )
  }
}

function itemExcerpt(item: ListItem): string | null {
  const previewDescription = item.previewDescription?.trim()
  if (previewDescription) return previewDescription

  const summary = item.summary?.trim()
  if (summary) return summary

  const text = item.originalText.trim()
  if (!text || text === item.url) return null

  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}…` : cleaned
}

function sourceLabel(source: string): string {
  return source.replace(/[-_]/g, ' ')
}

function sortLabel(col: SortCol): string {
  const labels: Record<SortCol, string> = {
    captured_at: 'Newest',
    title: 'Title',
    category: 'Category',
    snooze_count: 'Snoozes',
    library_priority: 'Priority',
    pinned_at: 'Pinned',
    source: 'Source',
    random: 'Random',
  }
  return labels[col]
}

function canKeep(status: string): boolean {
  return status === 'active' || status === 'snoozed'
}

function canSnooze(status: string): boolean {
  return status === 'active' || status === 'snoozed'
}

function canDrop(status: string): boolean {
  return status !== 'dropped'
}

export function ItemsClient() {
  const [items, setItems] = useState<ListItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState('active')
  const [sort, setSort] = useState<SortCol>('captured_at')
  const [dir, setDir] = useState<'desc' | 'asc'>('desc')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cacheNotice, setCacheNotice] = useState<string | null>(null)
  const [showingCachedData, setShowingCachedData] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [batchSnoozeOpen, setBatchSnoozeOpen] = useState(false)
  const [utilitiesOpen, setUtilitiesOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const enrichingIdsRef = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setActionError(null)
    const params = new URLSearchParams({
      status,
      sort,
      dir,
      page: String(page),
      ...(search ? { q: search } : {}),
    })
    const cacheKey = listCacheKey(params)

    try {
      const res = await fetch(`/api/items/list?${params}`)
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? 'Unable to load library')
      }

      const data = (await res.json()) as ListResponse
      writeCachedPayload(cacheKey, data)
      setItems(data.items)
      setCounts(data.counts)
      setTotalPages(data.totalPages)
      setTotal(data.total)
      setCacheNotice(null)
      setShowingCachedData(false)
    } catch (error) {
      const cached = readCachedPayload<ListResponse>(cacheKey)

      if (cached) {
        const when = new Date(cached.cachedAt).toLocaleString()
        setItems(cached.payload.items)
        setCounts(cached.payload.counts)
        setTotalPages(cached.payload.totalPages)
        setTotal(cached.payload.total)
        setCacheNotice(
          `Showing cached library data from ${when}. Writes are disabled until Resurface reconnects.`
        )
        setShowingCachedData(true)
      } else {
        setActionError(
          error instanceof Error ? error.message : 'Unable to load library'
        )
        setCacheNotice(null)
        setShowingCachedData(false)
      }
    } finally {
      setLoading(false)
    }
  }, [status, sort, dir, search, page])

  useEffect(() => {
    setPage(1)
    setSelectedIds([])
    setMenuItemId(null)
    setBatchSnoozeOpen(false)
  }, [status, search])

  useEffect(() => {
    void load()
  }, [load])

  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => items.some((item) => item.id === id))
    )
  }, [items])

  useEffect(() => {
    const pending = items
      .filter(
        (item) =>
          item.url &&
          ((!item.previewDescription && !item.previewImageUrl) ||
            isGenericTitle(item.title, item.url)) &&
          !enrichingIdsRef.current.has(item.id)
      )
      .slice(0, 4)

    if (pending.length === 0) return

    let cancelled = false

    void (async () => {
      for (const item of pending) {
        enrichingIdsRef.current.add(item.id)

        try {
          const response = await fetch('/api/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.id }),
          })

          if (!response.ok || cancelled) continue

          const payload = (await response.json()) as {
            item?: {
              id: string
              title: string
              previewSiteName: string | null
              previewDescription: string | null
              previewImageUrl: string | null
              previewFetchedAt: string | null
            }
          }

          if (!payload.item) continue

          setItems((current) =>
            current.map((entry) =>
              entry.id === payload.item?.id
                ? {
                    ...entry,
                    title: payload.item.title,
                    previewSiteName: payload.item.previewSiteName,
                    previewDescription: payload.item.previewDescription,
                    previewImageUrl: payload.item.previewImageUrl,
                    previewFetchedAt: payload.item.previewFetchedAt,
                  }
                : entry
            )
          )
        } catch {
          // swallow preview enrichment failures
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [items])

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  )

  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : null

  const toggleSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    )
  }

  const openItem = (item: ListItem) => {
    if (!item.url) return
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  const performAction = useCallback(
    async (targetItems: ListItem[], action: ActionKind, preset?: SnoozePreset) => {
      if (targetItems.length === 0) return
      if (showingCachedData) {
        setActionError('Writes are disabled while showing cached data.')
        return
      }

      setActionBusy(true)
      setActionError(null)

      try {
        for (const item of targetItems) {
          if (action === 'keep' && !canKeep(item.status)) continue
          if (action === 'snooze' && !canSnooze(item.status)) continue
          if (action === 'drop' && !canDrop(item.status)) continue

          const endpoint =
            action === 'keep'
              ? `/api/items/${item.id}/archive`
              : action === 'drop'
                ? `/api/items/${item.id}/drop`
                : `/api/items/${item.id}/snooze`

          const body =
            action === 'keep'
              ? {
                  archivedTo: item.archivedTo ?? item.suggestedArchive ?? null,
                }
              : action === 'snooze'
                ? { preset }
                : undefined

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          })

          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
              error?: string
            }
            throw new Error(payload.error ?? 'Action failed')
          }
        }

        setSelectedIds([])
        setMenuItemId(null)
        setBatchSnoozeOpen(false)
        await load()
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Action failed')
      } finally {
        setActionBusy(false)
      }
    },
    [load, showingCachedData]
  )

  const reEnrichItems = useCallback(
    async (targetItems: ListItem[]) => {
      if (targetItems.length === 0) return
      if (showingCachedData) {
        setActionError('Writes are disabled while showing cached data.')
        return
      }

      setActionBusy(true)
      setActionError(null)

      try {
        for (const item of targetItems) {
          if (!item.url) continue

          const response = await fetch('/api/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.id,
              forcePreviewRefresh: true,
            }),
          })

          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
              error?: string
            }
            throw new Error(payload.error ?? 'Preview refresh failed')
          }
        }

        await load()
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Preview refresh failed'
        )
      } finally {
        setActionBusy(false)
      }
    },
    [load, showingCachedData]
  )

  const sortOptions: SortCol[] = [
    'captured_at',
    'random',
    'title',
    'category',
    'library_priority',
    'pinned_at',
    'snooze_count',
    'source',
  ]

  const visibleYouTubeGithub = items.filter((item) => {
    if (!item.url) return false
    try {
      const host = new URL(item.url).hostname.replace(/^www\./, '')
      return (
        host === 'youtube.com' ||
        host === 'youtu.be' ||
        host === 'm.youtube.com' ||
        host === 'github.com'
      )
    } catch {
      return false
    }
  })

  return (
    <main className="page-shell">
      <section className="items-container">
        <header className="items-header">
          <div className="items-title-row">
            <Link href="/" className="items-back">
              ←
            </Link>
            <div className="items-heading-block">
              <div>
                <h1>Library</h1>
                <p className="items-subtitle">
                  Browsing, search, and long-term reference. Review stays on the
                  front page.
                </p>
              </div>
              <button
                type="button"
                className={`card-icon-btn utility-trigger${utilitiesOpen ? ' card-icon-btn-active' : ''}`}
                title="Library utilities"
                onClick={() => setUtilitiesOpen(true)}
              >
                <CogIcon />
              </button>
            </div>
          </div>

          {utilitiesOpen ? (
            <div className="utility-modal-backdrop" onClick={() => setUtilitiesOpen(false)}>
              <div
                className="utility-modal"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="utility-modal-header">
                  <div>
                    <h2>Library utilities</h2>
                    <p>Low-frequency maintenance tools for the current library view.</p>
                  </div>
                  <button
                    type="button"
                    className="batch-link-btn"
                    onClick={() => setUtilitiesOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="utility-actions">
                  <button
                    type="button"
                    className="batch-action-btn"
                    onClick={() => void reEnrichItems(items)}
                    disabled={actionBusy || showingCachedData || items.length === 0}
                  >
                    Re-enrich visible cards
                  </button>
                  <button
                    type="button"
                    className="batch-action-btn"
                    onClick={() => void reEnrichItems(visibleYouTubeGithub)}
                    disabled={
                      actionBusy ||
                      showingCachedData ||
                      visibleYouTubeGithub.length === 0
                    }
                  >
                    Refresh YouTube/GitHub cards
                  </button>
                </div>

                <p className="utility-note">
                  These actions are intentionally tucked away here rather than promoted
                  into the main Library workflow.
                </p>
              </div>
            </div>
          ) : null}

          {selectedIds.length > 0 ? (
            <div className="library-batch-bar">
              <div className="library-batch-summary">
                <strong>{selectedIds.length} selected</strong>
                {selectedItem?.url ? (
                  <button
                    type="button"
                    className="batch-link-btn"
                    onClick={() => openItem(selectedItem)}
                    disabled={actionBusy}
                  >
                    ↗ Open
                  </button>
                ) : null}
              </div>

              <div className="library-batch-actions">
                {selectedItems.some((item) => canKeep(item.status)) ? (
                  <button
                    type="button"
                    className="batch-action-btn"
                    onClick={() => void performAction(selectedItems, 'keep')}
                    disabled={actionBusy || showingCachedData}
                  >
                    Keep
                  </button>
                ) : null}

                {selectedItems.some((item) => canSnooze(item.status)) ? (
                  <div className="batch-snooze-wrap">
                    <button
                      type="button"
                      className="batch-action-btn"
                      onClick={() => setBatchSnoozeOpen((current) => !current)}
                      disabled={actionBusy || showingCachedData}
                    >
                      Snooze
                    </button>
                    {batchSnoozeOpen ? (
                      <div className="action-popover">
                        {SNOOZE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="popover-action"
                            onClick={() =>
                              void performAction(
                                selectedItems,
                                'snooze',
                                option.value
                              )
                            }
                            disabled={actionBusy || showingCachedData}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedItems.some((item) => canDrop(item.status)) ? (
                  <button
                    type="button"
                    className="batch-action-btn batch-danger-btn"
                    onClick={() => void performAction(selectedItems, 'drop')}
                    disabled={actionBusy || showingCachedData}
                  >
                    Drop
                  </button>
                ) : null}

                <button
                  type="button"
                  className="batch-link-btn"
                  onClick={() => {
                    setSelectedIds([])
                    setBatchSnoozeOpen(false)
                  }}
                  disabled={actionBusy}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}

          <div className="items-controls">
            <div className="items-control-group">
              <span className="control-label">Shelf</span>
              <div className="status-tabs">
                {['active', 'archived', 'dropped', 'snoozed'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`tab ${status === s ? 'tab-active' : ''}`}
                    onClick={() => setStatus(s)}
                  >
                    {s} {counts[s] != null ? `(${counts[s]})` : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="items-control-group">
              <span className="control-label">Order</span>
              <div className="status-tabs">
                {sortOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`tab ${sort === option ? 'tab-active' : ''}`}
                    onClick={() => {
                      if (sort === option && option !== 'random') {
                        setDir((current) =>
                          current === 'desc' ? 'asc' : 'desc'
                        )
                      } else {
                        setSort(option)
                        setDir('desc')
                      }
                    }}
                  >
                    {sortLabel(option)}
                    {sort === option && option !== 'random'
                      ? dir === 'desc'
                        ? ' ↓'
                        : ' ↑'
                      : ''}
                  </button>
                ))}
              </div>
            </div>

            <input
              className="items-search"
              placeholder="Search library…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </header>

        {cacheNotice ? <p className="cache-warning">{cacheNotice}</p> : null}

        {actionError ? <p className="error">{actionError}</p> : null}

        {loading ? (
          <p className="status">Loading…</p>
        ) : items.length === 0 ? (
          <p className="status">No items here yet.</p>
        ) : (
          <div className="library-grid">
            {items.map((item) => {
              const title = cleanTitle(item.title, item.url)
              const excerpt = itemExcerpt(item)
              const selected = selectedIds.includes(item.id)

              return (
                <article
                  key={item.id}
                  className={`library-card library-card-${item.category}${selected ? ' library-card-selected' : ''}`}
                >
                  <div className="library-card-meta">
                    <div className="library-meta-left">
                      <span className={`cat-badge cat-${item.category}`}>
                        {item.category}
                      </span>
                      <span className="library-age">{daysAgo(item.capturedAt)}</span>
                    </div>

                    <div className="library-card-controls">
                      {item.url ? (
                        <button
                          type="button"
                          className="card-icon-btn"
                          title="Open link in new tab"
                          onClick={() => openItem(item)}
                        >
                          <OpenInNewIcon />
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className={`card-icon-btn${selected ? ' card-icon-btn-active' : ''}`}
                        title={selected ? 'Deselect card' : 'Select card'}
                        onClick={() => toggleSelection(item.id)}
                      >
                        <SelectIcon selected={selected} />
                      </button>

                      <div className="card-menu-wrap">
                        <button
                          type="button"
                          className={`card-icon-btn${menuItemId === item.id ? ' card-icon-btn-active' : ''}`}
                          title="More actions"
                          onClick={() =>
                            setMenuItemId((current) =>
                              current === item.id ? null : item.id
                            )
                          }
                        >
                          <MoreIcon />
                        </button>

                        {menuItemId === item.id ? (
                          <div className="action-popover action-popover-card">
                            {item.url ? (
                              <button
                                type="button"
                                className="popover-action"
                                onClick={() => openItem(item)}
                              >
                                Open
                              </button>
                            ) : null}

                            {canKeep(item.status) ? (
                              <button
                                type="button"
                                className="popover-action"
                                onClick={() =>
                                  void performAction([item], 'keep')
                                }
                                disabled={actionBusy || showingCachedData}
                              >
                                Keep
                              </button>
                            ) : null}

                            {canSnooze(item.status) ? (
                              <div className="popover-group">
                                <span className="popover-label">Snooze</span>
                                {SNOOZE_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className="popover-action"
                                    onClick={() =>
                                      void performAction(
                                        [item],
                                        'snooze',
                                        option.value
                                      )
                                    }
                                    disabled={actionBusy || showingCachedData}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            {canDrop(item.status) ? (
                              <button
                                type="button"
                                className="popover-action popover-action-danger"
                                onClick={() =>
                                  void performAction([item], 'drop')
                                }
                                disabled={actionBusy || showingCachedData}
                              >
                                Drop
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="library-card-body">
                    {item.previewImageUrl ? (
                      item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="library-image-link"
                        >
                          <div className="library-card-image-wrap">
                            <img
                              src={item.previewImageUrl}
                              alt=""
                              className="library-card-image"
                              loading="lazy"
                            />
                          </div>
                        </a>
                      ) : (
                        <div className="library-card-image-wrap">
                          <img
                            src={item.previewImageUrl}
                            alt=""
                            className="library-card-image"
                            loading="lazy"
                          />
                        </div>
                      )
                    ) : null}

                    <h2 className="library-card-title">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="item-link"
                        >
                          {title}
                        </a>
                      ) : (
                        <span>{title}</span>
                      )}
                    </h2>

                    {excerpt ? (
                      <p className="library-card-excerpt">{excerpt}</p>
                    ) : null}

                    {item.archivedTo ? (
                      <p className="archived-to">Kept in {item.archivedTo}</p>
                    ) : null}
                  </div>

                  <div className="library-card-footer">
                    <span className="library-source">
                      {item.previewSiteName ?? sourceLabel(item.source)}
                    </span>
                    {item.snoozeCount > 0 ? (
                      <span className="library-snooze">
                        snoozed {item.snoozeCount}
                      </span>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <div className="items-footer">
          <span className="items-count">
            {total} item{total !== 1 ? 's' : ''}
            {totalPages > 1 && ` · page ${page}/${totalPages}`}
          </span>
          {totalPages > 1 ? (
            <div className="pagination">
              <button
                type="button"
                className="page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </button>
              <button
                type="button"
                className="page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
