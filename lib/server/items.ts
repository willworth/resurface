import { getResurfaceDatabase, mapRowToItem } from './sqlite'
import type { ResurfaceItem, ResurfaceStatus } from './types'

const VALID_STATUSES: ResurfaceStatus[] = [
  'active',
  'snoozed',
  'archived',
  'dropped',
]

const SORT_COLUMNS: Record<string, string> = {
  captured_at: 'captured_at',
  title: 'title',
  category: 'category',
  snooze_count: 'snooze_count',
  last_surfaced_at: 'last_surfaced_at',
  library_shelf: 'library_shelf',
  library_priority: 'library_priority',
  pinned_at: 'pinned_at',
  source: 'source',
  random: 'RANDOM()',
}

export type ItemListOptions = {
  status?: string | null
  sort?: string | null
  dir?: string | null
  search?: string | null
  shelf?: string | null
  pinned?: boolean | null
  limit?: number | null
  page?: number | null
}

export type ItemListResult = {
  items: ResurfaceItem[]
  total: number
  page: number
  totalPages: number
  pageSize: number
  counts: Record<string, number>
}

export function getStatusCounts(): Record<string, number> {
  const db = getResurfaceDatabase()
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'active' AND (suppress_until IS NULL OR datetime(suppress_until) <= datetime('now')) THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status = 'snoozed' OR (status = 'active' AND suppress_until IS NOT NULL AND datetime(suppress_until) > datetime('now')) THEN 1 ELSE 0 END), 0) as snoozed,
        COALESCE(SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END), 0) as archived,
        COALESCE(SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END), 0) as dropped
      FROM resurface_items`
    )
    .get() as {
      active: number
      snoozed: number
      archived: number
      dropped: number
    }

  return {
    active: Number(row.active ?? 0),
    snoozed: Number(row.snoozed ?? 0),
    archived: Number(row.archived ?? 0),
    dropped: Number(row.dropped ?? 0),
  }
}

export function getItemById(id: string): ResurfaceItem | null {
  const db = getResurfaceDatabase()
  const row = db
    .prepare('SELECT * FROM resurface_items WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined

  return row ? mapRowToItem(row) : null
}

export function listItems(options: ItemListOptions = {}): ItemListResult {
  const allOpenStatuses = options.status === 'all'
  const status = VALID_STATUSES.includes(options.status as ResurfaceStatus)
    ? (options.status as ResurfaceStatus)
    : 'active'
  const sort = options.sort ?? 'captured_at'
  const dir = options.dir === 'asc' ? 'ASC' : 'DESC'
  const search = options.search?.trim() || null
  const shelf = options.shelf?.trim() || null
  const safeLimit = Math.max(1, Math.min(Number(options.limit ?? 50), 200))
  const safePage = Math.max(1, Number(options.page ?? 1))
  const offset = (safePage - 1) * safeLimit
  const orderCol = SORT_COLUMNS[sort] ?? 'captured_at'
  const orderClause = sort === 'random' ? 'RANDOM()' : `${orderCol} ${dir}`

  const db = getResurfaceDatabase()
  const where: string[] = []
  const values: Array<string | number> = []

  if (allOpenStatuses) {
    where.push("status != 'dropped'")
  } else if (status === 'active') {
    where.push(
      "status = 'active' AND (suppress_until IS NULL OR datetime(suppress_until) <= datetime('now'))"
    )
  } else if (status === 'snoozed') {
    where.push(
      "(status = 'snoozed' OR (status = 'active' AND suppress_until IS NOT NULL AND datetime(suppress_until) > datetime('now')))"
    )
  } else {
    where.push('status = ?')
    values.push(status)
  }

  if (options.pinned) {
    where.push('pinned_at IS NOT NULL')
  }

  if (shelf) {
    where.push('library_shelf = ?')
    values.push(shelf)
  }

  if (search) {
    where.push('(title LIKE ? OR url LIKE ? OR original_text LIKE ?)')
    const like = `%${search}%`
    values.push(like, like, like)
  }

  const whereClause = where.join(' AND ')

  const rows = db
    .prepare(
      `SELECT * FROM resurface_items WHERE ${whereClause}
       ORDER BY ${orderClause} LIMIT ? OFFSET ?`
    )
    .all(...values, safeLimit, offset) as Record<string, unknown>[]
  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM resurface_items WHERE ${whereClause}`)
      .get(...values) as { c: number }
  ).c

  return {
    items: rows.map((row) => mapRowToItem(row)),
    total,
    page: safePage,
    totalPages: Math.ceil(total / safeLimit),
    pageSize: safeLimit,
    counts: getStatusCounts(),
  }
}
