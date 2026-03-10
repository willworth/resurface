// apps/resurface/lib/server/actions.ts

// packages/apps/resurface/lib/server/actions.ts

import { getResurfaceDatabase, mapRowToItem } from './sqlite'
import { computeSnoozeUntil, SnoozePreset } from './snooze'
import { ResurfaceItem } from './types'

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

  return fetchItem(id)
}

export function snoozeItem(
  id: string,
  preset: SnoozePreset
): ResurfaceItem | null {
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

  return fetchItem(id)
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

  return fetchItem(id)
}
