// apps/resurface/lib/server/actions.ts


import { logResurfaceEvent } from './events'
import {
  ArchiveLibraryOptions,
  clampLibraryPriority,
  normalizeLibraryShelf,
} from './library'
import { getResurfaceDatabase, mapRowToItem } from './sqlite'
import { computeSnoozeUntil, SnoozePreset } from './snooze'
import { ResurfaceItem } from './types'

const FORCE_DECISION_SNOOZE_THRESHOLD = Number(
  process.env.RESURFACE_FORCE_DECISION_SNOOZE_THRESHOLD ?? '5'
)

function fetchItem(id: string): ResurfaceItem | null {
  const db = getResurfaceDatabase()
  const row = db
    .prepare('SELECT * FROM resurface_items WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined

  return row ? mapRowToItem(row) : null
}

export function archiveItem(
  id: string,
  archivedTo: string | null,
  options: ArchiveLibraryOptions = {}
): ResurfaceItem | null {
  const now = new Date().toISOString()
  const libraryShelf = normalizeLibraryShelf(options.shelf ?? archivedTo)
  const libraryPriority = clampLibraryPriority(options.priority)
  const pinnedAt = options.pinned ? now : null
  const db = getResurfaceDatabase()

  db.prepare(
    `
    UPDATE resurface_items
    SET status = 'archived',
        archived_at = ?,
        archived_to = ?,
        library_shelf = ?,
        library_priority = ?,
        pinned_at = ?,
        suppress_until = NULL
    WHERE id = ?
  `
  ).run(now, archivedTo, libraryShelf, libraryPriority, pinnedAt, id)

  const item = fetchItem(id)
  if (item) {
    logResurfaceEvent('archived', item.id, {
      archivedTo,
      libraryShelf,
      libraryPriority,
      pinned: Boolean(pinnedAt),
      source: item.source,
      category: item.category,
    })
  }

  return item
}

export function pinItem(id: string, pinned: boolean): ResurfaceItem | null {
  const now = new Date().toISOString()
  const db = getResurfaceDatabase()

  db.prepare(
    `
    UPDATE resurface_items
    SET pinned_at = ?,
        library_priority = CASE
          WHEN ? = 1 AND library_priority < 5 THEN 5
          ELSE library_priority
        END
    WHERE id = ?
  `
  ).run(pinned ? now : null, pinned ? 1 : 0, id)

  const item = fetchItem(id)
  if (item) {
    logResurfaceEvent(pinned ? 'pinned' : 'unpinned', item.id, {
      source: item.source,
      category: item.category,
      status: item.status,
    })
  }

  return item
}

export type SnoozeActionResult =
  | { ok: true; item: ResurfaceItem }
  | { ok: false; reason: 'item-not-found' | 'force-decision-required' }

export function snoozeItem(
  id: string,
  preset: SnoozePreset
): SnoozeActionResult {
  const existing = fetchItem(id)
  if (!existing) {
    return { ok: false, reason: 'item-not-found' }
  }

  if (existing.snoozeCount >= FORCE_DECISION_SNOOZE_THRESHOLD) {
    return { ok: false, reason: 'force-decision-required' }
  }

  const suppressUntil = computeSnoozeUntil(preset)
  const db = getResurfaceDatabase()

  db.prepare(
    `
    UPDATE resurface_items
    SET suppress_until = ?,
        snooze_count = snooze_count + 1,
        status = 'active'
    WHERE id = ?
  `
  ).run(suppressUntil, id)

  const item = fetchItem(id)
  if (!item) {
    return { ok: false, reason: 'item-not-found' }
  }

  logResurfaceEvent('snoozed', item.id, {
    preset,
    suppressUntil,
    source: item.source,
    category: item.category,
  })

  return { ok: true, item }
}

export function passItem(id: string): ResurfaceItem | null {
  const item = fetchItem(id)
  if (item) {
    logResurfaceEvent('passed', item.id, {
      source: item.source,
      category: item.category,
      snoozeCount: item.snoozeCount,
      surfaceCount: item.surfaceCount,
    })
  }

  return item
}

export function dropItem(id: string): ResurfaceItem | null {
  const now = new Date().toISOString()
  const db = getResurfaceDatabase()

  db.prepare(
    `
    UPDATE resurface_items
    SET status = 'dropped',
        dropped_at = ?,
        suppress_until = NULL
    WHERE id = ?
  `
  ).run(now, id)

  const item = fetchItem(id)
  if (item) {
    logResurfaceEvent('dropped', item.id, {
      source: item.source,
      category: item.category,
    })
  }

  return item
}
