// apps/resurface/lib/server/surface.ts

// packages/apps/resurface/lib/server/surface.ts

import { getResurfaceDatabase, mapRowToItem } from './sqlite'
import { ResurfaceItem } from './types'

export type NextSurfaceResult = {
  item: ResurfaceItem | null
  forceDecision: boolean
}

function listRecentCategories(limit = 3): string[] {
  const db = getResurfaceDatabase()
  const rows = db
    .prepare(
      `
      SELECT category
      FROM resurface_items
      WHERE last_surfaced_at IS NOT NULL
      ORDER BY last_surfaced_at DESC
      LIMIT ?
    `
    )
    .all(limit) as Array<{ category?: string }>

  return rows
    .map((row) => row.category)
    .filter((value): value is string => typeof value === 'string')
}

function getCandidateRows(limit = 60): Record<string, unknown>[] {
  const db = getResurfaceDatabase()
  return db
    .prepare(
      `
      SELECT *
      FROM resurface_items
      WHERE status = 'active'
        AND (suppress_until IS NULL OR suppress_until <= ?)
      ORDER BY
        CASE WHEN last_surfaced_at IS NULL THEN 0 ELSE 1 END ASC,
        last_surfaced_at ASC,
        captured_at ASC
      LIMIT ?
    `
    )
    .all(new Date().toISOString(), limit) as Record<string, unknown>[]
}

function chooseCandidate(
  candidates: ResurfaceItem[],
  recentCategories: string[]
): ResurfaceItem | null {
  if (candidates.length === 0) {
    return null
  }

  const unseen = candidates.filter((item) => item.lastSurfacedAt === null)
  const pool = unseen.length > 0 ? unseen : candidates

  const diverse = pool.find((item) => !recentCategories.includes(item.category))
  return diverse ?? pool[0] ?? null
}

function markSurfaced(itemId: string): void {
  const db = getResurfaceDatabase()
  db.prepare(
    `
    UPDATE resurface_items
    SET last_surfaced_at = ?,
        surface_count = surface_count + 1
    WHERE id = ?
  `
  ).run(new Date().toISOString(), itemId)
}

export function getNextItemToSurface(): NextSurfaceResult {
  const recentCategories = listRecentCategories(3)
  const candidates = getCandidateRows().map((row) => mapRowToItem(row))
  const chosen = chooseCandidate(candidates, recentCategories)

  if (!chosen) {
    return {
      item: null,
      forceDecision: false,
    }
  }

  markSurfaced(chosen.id)

  const db = getResurfaceDatabase()
  const fresh = db
    .prepare('SELECT * FROM resurface_items WHERE id = ? LIMIT 1')
    .get(chosen.id) as Record<string, unknown> | undefined

  if (!fresh) {
    return {
      item: null,
      forceDecision: false,
    }
  }

  const item = mapRowToItem(fresh)
  return {
    item,
    forceDecision: item.snoozeCount >= 5,
  }
}
