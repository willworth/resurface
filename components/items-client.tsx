// apps/resurface/components/items-client.tsx

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  clearCachedPayload,
  invalidateReadCache,
  readCachedPayload,
  writeCachedPayload,
} from '@/lib/client/read-cache'
import type { ResurfaceItem } from '@/lib/server/types'

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
  personalNote?: string | null
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
  | 'mixed'
  | 'captured_at'
  | 'title'
  | 'category'
  | 'snooze_count'
  | 'library_priority'
  | 'pinned_at'
  | 'source'
  | 'random'
type ActionKind =
  | 'archive'
  | 'unarchive'
  | 'discard'
  | 'restore'
  | 'snooze'
  | 'keep'
  | 'drop'

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

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <path
        d="M5 10.4 8.4 13.7 15 6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <path
        d="M6 6l8 8M14 6l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <path
        d="M4.8 8.2A5.6 5.6 0 1 1 4.6 12M4.6 4.6v3.8h3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function NotePlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <path
        d="M10.5 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h8a1.5 1.5 0 0 0 1.5-1.5V9.5M7.5 9h4M7.5 12h2.5M14.5 3.5v4M12.5 5.5h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="card-icon-svg">
      <path
        d="m10 3.3 1.9 3.9 4.3.6-3.1 3 .7 4.2-3.8-2-3.8 2 .7-4.2-3.1-3 4.3-.6L10 3.3Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
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

function isAvatarImage(url: string): boolean {
  return /\/profile_images\//.test(url)
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

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value
    .replace(/&#(x?[0-9a-f]+);/gi, (_match, code: string) => {
      const hex = code.toLowerCase().startsWith('x')
      const value = Number.parseInt(hex ? code.slice(1) : code, hex ? 16 : 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : _match
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match)
}

function cleanTitle(title: string, url: string | null): string {
  const stripped = decodeHtmlEntities(
    title.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  ).trim()
  if (stripped === url || isGenericTitle(stripped, url)) {
    try {
      const parsed = new URL(url ?? '')
      const host = parsed.hostname.replace(/^www\./, '')
      const pathParts = parsed.pathname
        .split('/')
        .filter((part) => part.length > 0)
        .map((part) => decodeURIComponent(part))

      if (host === 'github.com') {
        if (pathParts.length >= 2) {
          return `${pathParts[0]}/${pathParts[1].replace(/\.git$/i, '')}`
        }
        if (pathParts.length === 1) {
          return `github.com/${pathParts[0]}`
        }
      }

      if (host === 'gist.github.com' && pathParts.length >= 1) {
        return `gist.github.com/${pathParts.slice(0, 2).join('/')}`
      }

      return host
    } catch {
      return stripped || 'Untitled'
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
      [
        'youtube',
        'youtube.com',
        'm.youtube.com',
        'youtu.be',
        'github',
        'github.com',
        'gist.github.com',
      ].includes(stripped)
    )
  } catch {
    return [
      'youtube',
      'youtube.com',
      'm.youtube.com',
      'youtu.be',
      'github',
      'github.com',
      'gist.github.com',
    ].includes(stripped)
  }
}

function itemExcerpt(item: ListItem): string | null {
  const previewDescription = item.previewDescription?.trim()
  if (previewDescription) return decodeHtmlEntities(previewDescription)

  const summary = item.summary?.trim()
  if (summary) return decodeHtmlEntities(summary)

  const text = item.originalText.trim()
  if (!text || text === item.url) return null

  const cleaned = decodeHtmlEntities(text).replace(/\s+/g, ' ').trim()
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}…` : cleaned
}

function sourceLabel(source: string): string {
  return source.replace(/[-_]/g, ' ')
}

function sortLabel(col: SortCol): string {
  const labels: Record<SortCol, string> = {
    mixed: 'Mix',
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

function sortHint(col: SortCol): string | undefined {
  if (col === 'mixed') return 'Takes turns between sources, newest first within each'
  if (col === 'random') return 'A fresh shuffle each time'
  return undefined
}

function canArchive(status: string): boolean {
  return status === 'active' || status === 'snoozed'
}

function canUnarchive(status: string): boolean {
  return status === 'archived'
}

function canSnooze(status: string): boolean {
  return status === 'active' || status === 'snoozed'
}

function canDiscard(status: string): boolean {
  return status !== 'dropped'
}

function canRestore(status: string): boolean {
  return status === 'dropped'
}

export function ItemsClient() {
  const [items, setItems] = useState<ListItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState('active')
  // Mix is the default so one big import (e.g. X bookmarks) can't fill the
  // first screen; Newest is one click away.
  const [sort, setSort] = useState<SortCol>('mixed')
  const [dir, setDir] = useState<'desc' | 'asc'>('desc')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cacheNotice, setCacheNotice] = useState<string | null>(null)
  const [showingCachedData, setShowingCachedData] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [brokenImageIds, setBrokenImageIds] = useState<string[]>([])
  const markImageBroken = useCallback((id: string) => {
    setBrokenImageIds((current) =>
      current.includes(id) ? current : [...current, id]
    )
  }, [])
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [batchSnoozeOpen, setBatchSnoozeOpen] = useState(false)
  const [utilitiesOpen, setUtilitiesOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [hasNote, setHasNote] = useState(false)
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [noteSaveBusy, setNoteSaveBusy] = useState(false)
  const [editingNoteOriginal, setEditingNoteOriginal] = useState('')
  const noteSaveBusyRef = useRef(false)
  const noteNavigationBlocked = noteSaveBusy || (editingNoteItemId !== null && editingNoteText !== editingNoteOriginal)
  const noteNavigationBlockedRef = useRef(false)
  noteNavigationBlockedRef.current = noteNavigationBlocked
  const [noteCardError, setNoteCardError] = useState<{
    id: string
    message: string
  } | null>(null)
  const [noteConflict, setNoteConflict] = useState<{
    id: string
    message: string
    currentNote?: string | null
  } | null>(null)
  const [initialQueryLoaded, setInitialQueryLoaded] = useState(false)
  const [recentDiscards, setRecentDiscards] = useState<
    Array<{ id: string; title: string }>
  >([])
  const [undoNotice, setUndoNotice] = useState<string | null>(null)
  const enrichingIdsRef = useRef<Set<string>>(new Set())
  const directActionBusyRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setActionError(null)
    const apiStatus = status === 'starred' ? 'all' : status
    const params = new URLSearchParams({
      status: apiStatus,
      sort,
      dir,
      page: String(page),
      ...(search ? { q: search } : {}),
      ...(status === 'starred' ? { pinned: '1' } : {}),
      ...(hasNote ? { has_note: '1' } : {}),
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
      const lastPage = Math.max(1, data.totalPages)
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
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
  }, [status, sort, dir, search, page, hasNote])

  const startEditingNote = useCallback((item: ListItem) => {
    if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
    setEditingNoteOriginal(item.personalNote ?? '')
    setEditingNoteItemId(item.id)
    setEditingNoteText(item.personalNote ?? '')
    setNoteCardError(null)
    setNoteConflict(null)
  }, [])

  const cancelEditingNote = useCallback(() => {
    if (noteSaveBusyRef.current) return
    setEditingNoteItemId(null)
    setEditingNoteText('')
    setNoteCardError(null)
    setNoteConflict(null)
  }, [])

  const saveCardNote = useCallback(
    async (item: ListItem, forceOverwrite = false) => {
      if (noteSaveBusyRef.current || editingNoteItemId !== item.id) return
      if (showingCachedData) {
        setNoteCardError({
          id: item.id,
          message: 'Writes are disabled while showing cached data.',
        })
        return
      }

      const noteToSave = editingNoteText
      if (noteToSave.length > 10000) {
        setNoteCardError({
          id: item.id,
          message: 'Note exceeds maximum length of 10,000 characters.',
        })
        return
      }

      noteSaveBusyRef.current = true
      setNoteSaveBusy(true)
      setNoteCardError(null)
      setNoteConflict(null)

      try {
        const expectedNote = forceOverwrite
          ? undefined
          : (item.personalNote ?? null)

        const response = await fetch(`/api/items/${item.id}/note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note: noteToSave,
            ...(expectedNote !== undefined
              ? { expectedCurrentNote: expectedNote }
              : {}),
          }),
        })

        const payload = (await response.json().catch(() => ({}))) as {
          item?: ResurfaceItem
          error?: string
          currentNote?: string | null
        }

        if (response.status === 409) {
          setNoteConflict({
            id: item.id,
            message: payload.error ?? 'Note was modified in another session.',
            currentNote: payload.currentNote,
          })
          return
        }

        if (!response.ok || !payload.item) {
          throw new Error(payload.error ?? 'Failed to save note')
        }

        const updatedNote = payload.item.personalNote

        // Invalidate list caches and review cache
        invalidateReadCache('resurface:read-cache:list')
        clearCachedPayload('resurface:read-cache:next-item')

        // If currently filtering by hasNote and note was cleared, refresh list to update count/pagination
        if (hasNote && (!updatedNote || updatedNote.trim().length === 0)) {
          setEditingNoteItemId(null)
          setEditingNoteText('')
          await load()
        } else {
          setItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, personalNote: updatedNote }
                : entry
            )
          )
          setEditingNoteItemId(null)
          setEditingNoteText('')
        }
      } catch (err) {
        setNoteCardError({
          id: item.id,
          message: err instanceof Error ? err.message : 'Failed to save note',
        })
      } finally {
        noteSaveBusyRef.current = false
        setNoteSaveBusy(false)
      }
    },
    [editingNoteText, editingNoteItemId, hasNote, load, showingCachedData]
  )

  useEffect(() => {
    if (initialQueryLoaded) return
    const params = new URLSearchParams(window.location.search)
    const query = params.get('q') ?? ''
    const nextStatus = params.get('status')
    const hasNoteParam =
      params.get('has_note') === '1' ||
      params.get('has_note') === 'true' ||
      params.get('hasNote') === '1' ||
      params.get('hasNote') === 'true'

    if (query) {
      setSearchInput(query)
      setSearch(query)
    }

    if (hasNoteParam) {
      setHasNote(true)
    }

    if (
      nextStatus &&
      ['active', 'archived', 'starred', 'snoozed', 'dropped'].includes(
        nextStatus
      )
    ) {
      setStatus(nextStatus)
    }

    setInitialQueryLoaded(true)
  }, [initialQueryLoaded])

  useEffect(() => {
    setPage(1)
    setSelectedIds([])
    setMenuItemId(null)
    setBatchSnoozeOpen(false)
    setEditingNoteItemId(null)
  }, [status, search, hasNote])

  useEffect(() => {
    if (!initialQueryLoaded) return
    void load()
  }, [initialQueryLoaded, load])

  useEffect(() => {
    if (!initialQueryLoaded || noteNavigationBlocked) return
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [initialQueryLoaded, searchInput, noteNavigationBlocked])

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

  useEffect(() => {
    if (!noteNavigationBlocked) return
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [noteNavigationBlocked])

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

  const toggleStar = useCallback(
    async (item: ListItem) => {
      if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
      if (showingCachedData) {
        setActionError('Writes are disabled while showing cached data.')
        return
      }

      setActionBusy(true)
      setActionError(null)

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

        await load()
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Could not update star'
        )
      } finally {
        setActionBusy(false)
      }
    },
    [load, showingCachedData]
  )

  const onUndo = useCallback(async () => {
    if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
    if (recentDiscards.length === 0) return
    if (showingCachedData) {
      setActionError('Writes are disabled while showing cached data.')
      return
    }

    const [toRestore, ...rest] = recentDiscards
    setRecentDiscards(rest)
    setActionError(null)

    try {
      const response = await fetch(`/api/items/${toRestore.id}/restore`, {
        method: 'POST',
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error ?? 'Undo failed')
      }

      setUndoNotice(`Restored “${toRestore.title}” ✓`)
      setTimeout(() => setUndoNotice(null), 3500)
      await load()
    } catch (undoErr) {
      setActionError(
        undoErr instanceof Error ? undoErr.message : 'Failed to restore item'
      )
      setRecentDiscards((prev) => [toRestore, ...prev])
    }
  }, [load, recentDiscards, showingCachedData])

  const discardSingle = useCallback(
    async (item: ListItem) => {
      if (directActionBusyRef.current) return
      if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
      if (showingCachedData) {
        setActionError('Writes are disabled while showing cached data.')
        return
      }

      const itemTitle = cleanTitle(item.title, item.url)
      directActionBusyRef.current = true
      setActionBusy(true)
      setActionError(null)

      try {
        const response = await fetch(`/api/items/${item.id}/drop`, {
          method: 'POST',
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error ?? 'Discard failed')
        }

        setRecentDiscards((prev) =>
          [{ id: item.id, title: itemTitle }, ...prev].slice(0, 10)
        )
        setItems((prev) => prev.filter((i) => i.id !== item.id))
        setCounts((prev) => ({
          ...prev,
          [item.status]: Math.max(0, (prev[item.status] ?? 1) - 1),
          dropped: (prev.dropped ?? 0) + 1,
        }))
        setTotal((t) => Math.max(0, t - 1))
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Discard failed'
        )
      } finally {
        directActionBusyRef.current = false
        setActionBusy(false)
      }
    },
    [showingCachedData]
  )

  const restoreSingle = useCallback(
    async (item: ListItem) => {
      if (directActionBusyRef.current) return
      if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
      if (showingCachedData) {
        setActionError('Writes are disabled while showing cached data.')
        return
      }

      const itemTitle = cleanTitle(item.title, item.url)
      directActionBusyRef.current = true
      setActionBusy(true)
      setActionError(null)

      try {
        const response = await fetch(`/api/items/${item.id}/restore`, {
          method: 'POST',
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error ?? 'Restore failed')
        }

        const data = (await response.json()) as { item?: ListItem }
        const targetStatus = data.item?.status ?? 'active'

        setItems((prev) => prev.filter((i) => i.id !== item.id))
        setCounts((prev) => ({
          ...prev,
          dropped: Math.max(0, (prev.dropped ?? 1) - 1),
          [targetStatus]: (prev[targetStatus] ?? 0) + 1,
        }))
        setTotal((t) => Math.max(0, t - 1))
        setUndoNotice(`Restored “${itemTitle}” ✓`)
        setTimeout(() => setUndoNotice(null), 3500)
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Restore failed'
        )
      } finally {
        directActionBusyRef.current = false
        setActionBusy(false)
      }
    },
    [showingCachedData]
  )

  const archiveSingle = useCallback(
    async (item: ListItem) => {
      if (directActionBusyRef.current) return
      if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
      if (showingCachedData) {
        setActionError('Writes are disabled while showing cached data.')
        return
      }

      directActionBusyRef.current = true
      setActionBusy(true)
      setActionError(null)
      try {
        const response = await fetch(`/api/items/${item.id}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            archivedTo: item.archivedTo ?? item.suggestedArchive ?? null,
          }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error ?? 'Archive failed')
        }

        setItems((prev) => prev.filter((i) => i.id !== item.id))
        setCounts((prev) => ({
          ...prev,
          [item.status]: Math.max(0, (prev[item.status] ?? 1) - 1),
          archived: (prev.archived ?? 0) + 1,
        }))
        setTotal((t) => Math.max(0, t - 1))
        setUndoNotice(
          `Archived “${cleanTitle(item.title, item.url)}” ✓`
        )
        setTimeout(() => setUndoNotice(null), 3500)
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Archive failed'
        )
      } finally {
        directActionBusyRef.current = false
        setActionBusy(false)
      }
    },
    [showingCachedData]
  )

  const unarchiveSingle = useCallback(
    async (item: ListItem) => {
      if (directActionBusyRef.current) return
      if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
      if (showingCachedData) {
        setActionError('Writes are disabled while showing cached data.')
        return
      }

      directActionBusyRef.current = true
      setActionBusy(true)
      setActionError(null)
      try {
        const response = await fetch(`/api/items/${item.id}/unarchive`, {
          method: 'POST',
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error ?? 'Return to review failed')
        }

        setItems((prev) => prev.filter((i) => i.id !== item.id))
        setCounts((prev) => ({
          ...prev,
          archived: Math.max(0, (prev.archived ?? 1) - 1),
          active: (prev.active ?? 0) + 1,
        }))
        setTotal((t) => Math.max(0, t - 1))
        setUndoNotice(
          `Returned “${cleanTitle(item.title, item.url)}” to review ✓`
        )
        setTimeout(() => setUndoNotice(null), 3500)
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Return to review failed'
        )
      } finally {
        directActionBusyRef.current = false
        setActionBusy(false)
      }
    },
    [showingCachedData]
  )

  const performAction = useCallback(
    async (targetItems: ListItem[], action: ActionKind, preset?: SnoozePreset) => {
      if (targetItems.length === 0) return
      if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
      if (showingCachedData) {
        setActionError('Writes are disabled while showing cached data.')
        return
      }

      setActionBusy(true)
      setActionError(null)

      try {
        for (const item of targetItems) {
          if ((action === 'archive' || action === 'keep') && !canArchive(item.status)) continue
          if (action === 'unarchive' && !canUnarchive(item.status)) continue
          if (action === 'snooze' && !canSnooze(item.status)) continue
          if ((action === 'discard' || action === 'drop') && !canDiscard(item.status)) continue
          if (action === 'restore' && !canRestore(item.status)) continue

          const endpoint =
            action === 'archive' || action === 'keep'
              ? `/api/items/${item.id}/archive`
              : action === 'unarchive'
                ? `/api/items/${item.id}/unarchive`
                : action === 'discard' || action === 'drop'
                  ? `/api/items/${item.id}/drop`
                  : action === 'restore'
                    ? `/api/items/${item.id}/restore`
                    : `/api/items/${item.id}/snooze`

          const body =
            action === 'archive' || action === 'keep'
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
      if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) return
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
    'mixed',
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
    <main className="page-shell items-page-shell">
      <section className="items-container">
        <header className="items-header">
          <div className="items-title-row">
            <Link href="/" className="items-back" aria-disabled={noteNavigationBlocked} onClick={(event) => { if (noteNavigationBlockedRef.current || noteSaveBusyRef.current) event.preventDefault() }}>
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
                  <button
                    type="button"
                    className="batch-action-btn"
                    onClick={() => {
                      if (noteNavigationBlockedRef.current) return
                      setStatus('dropped')
                      setUtilitiesOpen(false)
                    }}
                  >
                    View dropped bin
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
                {selectedItems.some((item) => canArchive(item.status)) ? (
                  <button
                    type="button"
                    className="batch-action-btn"
                    onClick={() => void performAction(selectedItems, 'archive')}
                    disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                    title="Archive selected items (keep in library, stop resurfacing)"
                  >
                    Archive
                  </button>
                ) : null}

                {selectedItems.some((item) => canUnarchive(item.status)) ? (
                  <button
                    type="button"
                    className="batch-action-btn"
                    onClick={() => void performAction(selectedItems, 'unarchive')}
                    disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                    title="Return selected archived items to review"
                  >
                    Return to review
                  </button>
                ) : null}

                {selectedItems.some((item) => canSnooze(item.status)) ? (
                  <div className="batch-snooze-wrap">
                    <button
                      type="button"
                      className="batch-action-btn"
                      onClick={() => setBatchSnoozeOpen((current) => !current)}
                      disabled={actionBusy || showingCachedData || noteNavigationBlocked}
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
                            disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedItems.some((item) => canDiscard(item.status)) ? (
                  <button
                    type="button"
                    className="batch-action-btn batch-danger-btn"
                    onClick={() => void performAction(selectedItems, 'discard')}
                    disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                    title="Discard selected items to bin"
                  >
                    Discard
                  </button>
                ) : null}

                {selectedItems.some((item) => canRestore(item.status)) ? (
                  <button
                    type="button"
                    className="batch-action-btn batch-restore-btn"
                    onClick={() => void performAction(selectedItems, 'restore')}
                    disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                    title="Restore selected items from bin"
                  >
                    Restore
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
                {[
                  ['active', 'Active'],
                  ['archived', 'Archived'],
                  ['starred', 'Starred'],
                  ['snoozed', 'Snoozed'],
                  ['dropped', 'Bin'],
                ].map(([s, label]) => (
                  <button
                    key={s}
                    type="button"
                    className={`tab ${status === s ? 'tab-active' : ''}`}
                    disabled={noteNavigationBlocked}
                    onClick={() => setStatus(s)}
                  >
                    {label}{' '}
                    {s !== 'starred' && counts[s] != null
                      ? `(${counts[s]})`
                      : ''}
                  </button>
                ))}
              </div>
              {status === 'dropped' ? (
                <p className="dropped-bin-note">
                  Bin items are kept indefinitely for recovery. Click Restore on any card to return it to review, archive, or snooze.
                </p>
              ) : null}
            </div>

            <div className="items-control-group">
              <span className="control-label">Filter</span>
              <div className="status-tabs">
                <button
                  type="button"
                  className={`tab ${hasNote ? 'tab-active' : ''}`}
                  disabled={noteNavigationBlocked}
                  onClick={() => setHasNote((prev) => !prev)}
                  aria-pressed={hasNote}
                  title="Filter to items with a personal note"
                >
                  Has a note
                </button>
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
                    disabled={noteNavigationBlocked}
                    title={sortHint(option)}
                    aria-pressed={sort === option}
                    onClick={() => {
                      if (sort === option && option !== 'random' && option !== 'mixed') {
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
                    {sort === option && option !== 'random' && option !== 'mixed'
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
              aria-label="Search library"
              placeholder="Search library…"
              disabled={noteNavigationBlocked}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </header>

        {noteNavigationBlocked ? <p role="status" className="cache-warning">{noteSaveBusy ? 'Saving your note…' : 'Save or cancel your note before changing items or leaving Library.'}</p> : null}

        {cacheNotice ? <p className="cache-warning">{cacheNotice}</p> : null}

        {actionError ? <p className="error">{actionError}</p> : null}

        {recentDiscards.length > 0 ? (
          <div className="undo-banner" role="status" aria-live="polite">
            <span>
              Discarded “{recentDiscards[0].title}”
              {recentDiscards.length > 1 ? ` (+${recentDiscards.length - 1} more)` : ''}
            </span>
            <button
              type="button"
              className="undo-banner-btn"
              onClick={() => void onUndo()}
              disabled={showingCachedData || noteNavigationBlocked}
            >
              Undo
            </button>
          </div>
        ) : undoNotice ? (
          <div className="undo-banner undo-banner-success" role="status" aria-live="polite">
            <span>{undoNotice}</span>
          </div>
        ) : null}

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
                  <div className="library-card-head">
                    <label
                      className="card-select"
                      title={selected ? 'Deselect card' : 'Select card'}
                    >
                      <input
                        type="checkbox"
                        className="card-select-input"
                        checked={selected}
                        onChange={() => toggleSelection(item.id)}
                        aria-label={selected ? 'Deselect card' : 'Select card'}
                      />
                      <span className="card-select-box" aria-hidden="true">
                        <CheckIcon />
                      </span>
                    </label>

                    <div className="library-meta-left">
                      <span className={`cat-badge cat-${item.category}`}>
                        {item.category}
                      </span>
                      <span className="library-meta-sep" aria-hidden="true">·</span>
                      <span className="library-age">{daysAgo(item.capturedAt)}</span>
                      <span className="library-meta-sep" aria-hidden="true">·</span>
                      <span className="library-source">
                        {item.previewSiteName ?? sourceLabel(item.source)}
                      </span>
                      {item.snoozeCount > 0 ? (
                        <span className="library-snooze">
                          snoozed {item.snoozeCount}
                        </span>
                      ) : null}
                    </div>

                    <div className="library-card-corner">
                      <button
                        type="button"
                        className={`card-icon-btn star-card-btn${item.pinnedAt ? ' card-icon-btn-active star-card-btn-active' : ''}`}
                        title={item.pinnedAt ? 'Remove star' : 'Star this'}
                        aria-label={item.pinnedAt ? 'Remove star' : 'Star this'}
                        aria-pressed={Boolean(item.pinnedAt)}
                        onClick={() => void toggleStar(item)}
                        disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                      >
                        <StarIcon filled={Boolean(item.pinnedAt)} />
                      </button>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="card-open-link"
                          title="Open link in new tab"
                          aria-label="Open link in new tab"
                        >
                          <span className="card-open-text">Open</span>
                          <OpenInNewIcon />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="library-card-body">
                    {(() => {
                      const imageUrl =
                        item.previewImageUrl &&
                        !brokenImageIds.includes(`${item.id}|${item.previewImageUrl}`)
                          ? item.previewImageUrl
                          : null
                      const avatar = imageUrl ? isAvatarImage(imageUrl) : false
                      const heading = (
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
                      )

                      if (imageUrl && avatar) {
                        return (
                          <div className="library-card-title-row">
                            <img
                              src={imageUrl}
                              alt=""
                              className="library-card-avatar"
                              loading="lazy"
                              onError={() => markImageBroken(`${item.id}|${imageUrl}`)}
                            />
                            {heading}
                          </div>
                        )
                      }

                      return (
                        <>
                          {imageUrl ? (
                            <div className="library-card-image-wrap">
                              <img
                                src={imageUrl}
                                alt=""
                                className="library-card-image"
                                loading="lazy"
                                onError={() => markImageBroken(`${item.id}|${imageUrl}`)}
                              />
                            </div>
                          ) : null}
                          {heading}
                        </>
                      )
                    })()}

                    {excerpt ? (
                      <p className="library-card-excerpt">{excerpt}</p>
                    ) : null}

                    {item.archivedTo ? (
                      <p className="archived-to">Archived in {item.archivedTo}</p>
                    ) : null}

                    {editingNoteItemId === item.id ? (
                      <div
                        className="library-card-note-editor"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="library-card-note-editor-head">
                          <label
                            htmlFor={`card-note-${item.id}`}
                            className="library-card-note-label"
                          >
                            Your note
                          </label>
                          <span className="library-card-note-chars">
                            {editingNoteText.length}/10,000
                          </span>
                        </div>
                        <textarea
                          id={`card-note-${item.id}`}
                          className="library-card-note-textarea"
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault()
                              void saveCardNote(item)
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelEditingNote()
                            }
                          }}
                          rows={3}
                          maxLength={10000}
                          placeholder="Jot down a thought…"
                          disabled={noteSaveBusy || showingCachedData}
                          autoFocus
                        />
                        <div className="library-card-note-actions">
                          <span className="library-card-note-hint">
                            ⌘↵ to save · Esc to cancel
                          </span>
                          <div className="library-card-note-buttons">
                            <button
                              type="button"
                              className="library-card-note-cancel"
                              onClick={cancelEditingNote}
                              disabled={noteSaveBusy}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="library-card-note-save"
                              onClick={() => void saveCardNote(item)}
                              disabled={noteSaveBusy || showingCachedData}
                            >
                              {noteSaveBusy ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                        {noteConflict?.id === item.id ? (
                          <div
                            className="library-card-note-conflict"
                            role="alert"
                          >
                            <p className="conflict-msg">
                              {noteConflict.message}
                            </p>
                            {noteConflict.currentNote ? (
                              <p className="conflict-server-text">
                                Server version: “{noteConflict.currentNote}”
                              </p>
                            ) : (
                              <p className="conflict-server-text">
                                Note was cleared in another window.
                              </p>
                            )}
                            <button
                              type="button"
                              className="conflict-force-btn"
                              onClick={() => void saveCardNote(item, true)}
                              disabled={noteSaveBusy}
                            >
                              Overwrite with my draft
                            </button>
                          </div>
                        ) : null}
                        {noteCardError?.id === item.id ? (
                          <p className="library-card-note-error">
                            {noteCardError.message}
                          </p>
                        ) : null}
                      </div>
                    ) : item.personalNote ? (
                      <div className="library-card-note-block">
                        <div className="library-card-note-head">
                          <span className="library-card-note-badge">
                            Your note
                          </span>
                          <button
                            type="button"
                            className="library-card-note-edit-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEditingNote(item)
                            }}
                            disabled={showingCachedData || noteNavigationBlocked}
                            aria-label="Edit note"
                          >
                            Edit
                          </button>
                        </div>
                        <p className="library-card-note-text">
                          {item.personalNote}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="library-card-actions">
                    {editingNoteItemId !== item.id && !item.personalNote ? (
                      <button
                        type="button"
                        className="card-text-btn card-note-add-btn"
                        title="Add a personal note to this card"
                        aria-label="Add note"
                        onClick={() => startEditingNote(item)}
                        disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                      >
                        <NotePlusIcon />
                        <span>Add note</span>
                      </button>
                    ) : null}

                    <div className="library-card-decide">
                      {item.status === 'dropped' ? (
                        <button
                          type="button"
                          className="card-text-btn card-restore-btn"
                          title="Restore item to previous state"
                          onClick={() => void restoreSingle(item)}
                          disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                        >
                          <RestoreIcon />
                          <span>Restore</span>
                        </button>
                      ) : (
                        <>
                          {item.status === 'archived' ? (
                            <button
                              type="button"
                              className="card-text-btn card-unarchive-btn"
                              title="Return this item to review queue"
                              onClick={() => void unarchiveSingle(item)}
                              disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                            >
                              <RestoreIcon />
                              <span>Review</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="card-text-btn card-archive-btn"
                              title="Archive (keep in library, stop resurfacing)"
                              onClick={() => void archiveSingle(item)}
                              disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                            >
                              <CheckIcon />
                              <span>Archive</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="card-text-btn card-discard-btn"
                            title="Discard (move to bin, recoverable)"
                            onClick={() => void discardSingle(item)}
                            disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                          >
                            <CrossIcon />
                            <span>Discard</span>
                          </button>
                        </>
                      )}

                      <div className="card-menu-wrap">
                        <button
                          type="button"
                          className={`card-icon-btn card-more-btn${menuItemId === item.id ? ' card-icon-btn-active' : ''}`}
                          title="More actions: snooze, open, notes"
                          aria-label="More actions"
                          aria-expanded={menuItemId === item.id}
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
                            <button
                              type="button"
                              className="popover-action"
                              onClick={() => {
                                setMenuItemId(null)
                                startEditingNote(item)
                              }}
                              disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                            >
                              {item.personalNote ? 'Edit note' : 'Add note'}
                            </button>

                            {item.url ? (
                              <button
                                type="button"
                                className="popover-action"
                                onClick={() => openItem(item)}
                              >
                                Open
                              </button>
                            ) : null}

                            {item.status === 'dropped' ? (
                              <button
                                type="button"
                                className="popover-action"
                                onClick={() => void restoreSingle(item)}
                                disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                              >
                                Restore
                              </button>
                            ) : null}

                            {canArchive(item.status) ? (
                              <button
                                type="button"
                                className="popover-action"
                                onClick={() => void archiveSingle(item)}
                                disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                              >
                                Archive
                              </button>
                            ) : null}

                            {canUnarchive(item.status) ? (
                              <button
                                type="button"
                                className="popover-action"
                                onClick={() => void unarchiveSingle(item)}
                                disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                              >
                                Return to review
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
                                    disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            {canDiscard(item.status) ? (
                              <button
                                type="button"
                                className="popover-action popover-action-danger"
                                onClick={() => void discardSingle(item)}
                                disabled={actionBusy || showingCachedData || noteNavigationBlocked}
                              >
                                Discard
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
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
                disabled={page <= 1 || noteNavigationBlocked}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </button>
              <button
                type="button"
                className="page-btn"
                disabled={page >= totalPages || noteNavigationBlocked}
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
