// apps/resurface/components/items-client.tsx

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type ListItem = {
  id: string
  url: string | null
  title: string
  category: string
  source: string
  status: string
  capturedAt: string
  lastSurfacedAt: string | null
  snoozeCount: number
  suppressUntil: string | null
  suggestedArchive: string | null
  archivedTo: string | null
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

type SortCol = 'captured_at' | 'title' | 'category' | 'snooze_count' | 'source'

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

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      status,
      sort,
      dir,
      page: String(page),
      ...(search ? { q: search } : {}),
    })
    try {
      const res = await fetch(`/api/items/list?${params}`)
      const data = (await res.json()) as ListResponse
      setItems(data.items)
      setCounts(data.counts)
      setTotalPages(data.totalPages)
      setTotal(data.total)
    } catch {
      // swallow
    } finally {
      setLoading(false)
    }
  }, [status, sort, dir, search, page])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [status, search])

  useEffect(() => {
    void load()
  }, [load])

  // Debounced search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const toggleSort = (col: SortCol) => {
    if (sort === col) {
      setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSort(col)
      setDir('desc')
    }
  }

  const sortIndicator = (col: SortCol) =>
    sort === col ? (dir === 'desc' ? ' ↓' : ' ↑') : ''

  return (
    <main className="page-shell">
      <section className="items-container">
        <header className="items-header">
          <div className="items-title-row">
            <Link href="/" className="items-back">
              ←
            </Link>
            <h1>All Items</h1>
          </div>

          <div className="items-controls">
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

            <input
              className="items-search"
              placeholder="Search…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </header>

        {loading ? (
          <p className="status">Loading…</p>
        ) : items.length === 0 ? (
          <p className="status">No items</p>
        ) : (
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('title')}>
                    Title{sortIndicator('title')}
                  </th>
                  <th
                    className="sortable col-cat"
                    onClick={() => toggleSort('category')}
                  >
                    Cat{sortIndicator('category')}
                  </th>
                  <th
                    className="sortable col-age"
                    onClick={() => toggleSort('captured_at')}
                  >
                    Age{sortIndicator('captured_at')}
                  </th>
                  <th
                    className="sortable col-snooze"
                    onClick={() => toggleSort('snooze_count')}
                  >
                    Snz{sortIndicator('snooze_count')}
                  </th>
                  <th
                    className="sortable col-source"
                    onClick={() => toggleSort('source')}
                  >
                    Src{sortIndicator('source')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="col-title">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="item-link"
                        >
                          {cleanTitle(item.title, item.url)}
                        </a>
                      ) : (
                        <span>{cleanTitle(item.title, null)}</span>
                      )}
                      {item.archivedTo && (
                        <span className="archived-to">→ {item.archivedTo}</span>
                      )}
                    </td>
                    <td className="col-cat">
                      <span className={`cat-badge cat-${item.category}`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="col-age">{daysAgo(item.capturedAt)}</td>
                    <td className="col-snooze">
                      {item.snoozeCount > 0 ? item.snoozeCount : '—'}
                    </td>
                    <td className="col-source">{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="items-footer">
          <span className="items-count">
            {total} item{total !== 1 ? 's' : ''}
            {totalPages > 1 && ` · page ${page}/${totalPages}`}
          </span>
          {totalPages > 1 && (
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
          )}
        </div>
      </section>
    </main>
  )
}
