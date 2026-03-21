// apps/resurface/lib/server/actions.ts


import { logResurfaceEvent } from './events'
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
  archivedTo: string | null
): ResurfaceItem | null {
  const now = new Date().toISOString()
  const db = getResurfaceDatabase()

  db.prepare(
    `
    UPDATE resurface_items
    SET status = 'archived',
        archived_at = ?,
        archived_to = ?,
        suppress_until = NULL
    WHERE id = ?
  `
  ).run(now, archivedTo, id)

  const item = fetchItem(id)
  if (item) {
    logResurfaceEvent('archived', item.id, {
      archivedTo,
      source: item.source,
      category: item.category,
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
