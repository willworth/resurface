// apps/resurface/lib/server/surface.ts


import { logResurfaceEvent } from './events'
import { getResurfaceDatabase, mapRowToItem } from './sqlite'
import { ResurfaceItem } from './types'

const DEFAULT_WEIGHTS = {
  freshness: Number(process.env.RESURFACE_WEIGHT_FRESHNESS ?? '1'),
  resurfacingGap: Number(process.env.RESURFACE_WEIGHT_RESURFACING_GAP ?? '1.2'),
  diversityBoost: Number(process.env.RESURFACE_WEIGHT_DIVERSITY_BOOST ?? '8'),
  snoozePenalty: Number(process.env.RESURFACE_WEIGHT_SNOOZE_PENALTY ?? '2.5'),
  intentBoost: Number(process.env.RESURFACE_WEIGHT_INTENT_BOOST ?? '6'),
}

const MAX_SCORE_DAYS = 365
const FRESHNESS_MAX_DAYS = 180
const NEVER_SURFACED_GAP_DAYS = 45
const RESURFACING_GAP_MAX_DAYS = 90
const FORCE_DECISION_SNOOZE_THRESHOLD = Number(
  process.env.RESURFACE_FORCE_DECISION_SNOOZE_THRESHOLD ?? '5'
)

const INTENT_TAG_BOOSTS: Record<string, number> = {
  now: 1,
  urgent: 1,
  research: 0.5,
  buy: 0.5,
}

export type NextSurfaceResult = {
  item: ResurfaceItem | null
  forceDecision: boolean
  remaining: number
}

type ScoredCandidate = {
  item: ResurfaceItem
  total: number
  components: {
    freshness: number
    resurfacingGap: number
    diversityBoost: number
    snoozePenalty: number
    intentBoost: number
  }
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

function getCandidateRows(limit = 120): Record<string, unknown>[] {
  const db = getResurfaceDatabase()
  return db
    .prepare(
      `
      SELECT *
      FROM resurface_items
      WHERE status = 'active'
        AND (suppress_until IS NULL OR suppress_until <= ?)
      LIMIT ?
    `
    )
    .all(new Date().toISOString(), limit) as Record<string, unknown>[]
}

function daysSince(iso: string | null): number {
  if (!iso) {
    return MAX_SCORE_DAYS
  }

  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function computeIntentBoost(tags: string[]): number {
  return tags.reduce((sum, tag) => sum + (INTENT_TAG_BOOSTS[tag] ?? 0), 0)
}

function scoreCandidate(
  item: ResurfaceItem,
  recentCategories: string[]
): ScoredCandidate {
  const freshnessRaw = Math.min(daysSince(item.capturedAt), FRESHNESS_MAX_DAYS)
  const resurfacingGapRaw =
    item.lastSurfacedAt === null
      ? NEVER_SURFACED_GAP_DAYS
      : Math.min(daysSince(item.lastSurfacedAt), RESURFACING_GAP_MAX_DAYS)
  const diversityRaw = recentCategories.includes(item.category) ? 0 : 1
  const snoozePenaltyRaw = item.snoozeCount
  const intentRaw = computeIntentBoost(item.tags)

  const components = {
    freshness: freshnessRaw * DEFAULT_WEIGHTS.freshness,
    resurfacingGap: resurfacingGapRaw * DEFAULT_WEIGHTS.resurfacingGap,
    diversityBoost: diversityRaw * DEFAULT_WEIGHTS.diversityBoost,
    snoozePenalty: snoozePenaltyRaw * DEFAULT_WEIGHTS.snoozePenalty,
    intentBoost: intentRaw * DEFAULT_WEIGHTS.intentBoost,
  }

  return {
    item,
    components,
    total:
      components.freshness +
      components.resurfacingGap +
      components.diversityBoost -
      components.snoozePenalty +
      components.intentBoost,
  }
}

function rankCandidates(
  items: ResurfaceItem[],
  recentCategories: string[]
): ScoredCandidate[] {
  return items
    .map((item) => scoreCandidate(item, recentCategories))
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total
      }

      const aCaptured = new Date(a.item.capturedAt).getTime()
      const bCaptured = new Date(b.item.capturedAt).getTime()
      if (aCaptured !== bCaptured) {
        return aCaptured - bCaptured
      }

      return a.item.id.localeCompare(b.item.id)
    })
}

function markSurfaced(candidate: ScoredCandidate): void {
  const db = getResurfaceDatabase()
  db.prepare(
    `
    UPDATE resurface_items
    SET last_surfaced_at = ?,
        surface_count = surface_count + 1
    WHERE id = ?
  `
  ).run(new Date().toISOString(), candidate.item.id)

  logResurfaceEvent('surfaced', candidate.item.id, {
    source: candidate.item.source,
    category: candidate.item.category,
    score: candidate.total,
    components: candidate.components,
  })
}

export function getItemsForSession(count = 10): ResurfaceItem[] {
  const safeCount = Math.max(1, Math.min(50, count))
  const recentCategories = listRecentCategories(3)
  const candidates = getCandidateRows()
    .map((row) => mapRowToItem(row))
    .filter((item) => item.status === 'active')

  return rankCandidates(candidates, recentCategories)
    .slice(0, safeCount)
    .map((entry) => entry.item)
}

function countActiveItems(): number {
  const db = getResurfaceDatabase()
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM resurface_items
       WHERE status = 'active'
       AND (suppress_until IS NULL OR suppress_until <= datetime('now'))`
    )
    .get() as { c: number }
  return row.c
}

export function getNextItemToSurface(): NextSurfaceResult {
  const chosen =
    rankCandidates(
      getCandidateRows().map((row) => mapRowToItem(row)),
      listRecentCategories(3)
    )[0] ?? null

  if (!chosen) {
    return {
      item: null,
      forceDecision: false,
      remaining: 0,
    }
  }

  markSurfaced(chosen)

  const db = getResurfaceDatabase()
  const fresh = db
    .prepare('SELECT * FROM resurface_items WHERE id = ? LIMIT 1')
    .get(chosen.item.id) as Record<string, unknown> | undefined

  if (!fresh) {
    return {
      item: null,
      forceDecision: false,
      remaining: 0,
    }
  }

  const item = mapRowToItem(fresh)
  return {
    item,
    forceDecision: item.snoozeCount >= FORCE_DECISION_SNOOZE_THRESHOLD,
    remaining: countActiveItems(),
  }
}
