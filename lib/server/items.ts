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
  source: 'source',
  random: 'RANDOM()',
}

export type ItemListOptions = {
  status?: string | null
  sort?: string | null
  dir?: string | null
  search?: string | null
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
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM resurface_items GROUP BY status`
    )
    .all() as Array<{ status: string; count: number }>

  return Object.fromEntries(rows.map((row) => [row.status, row.count]))
}

export function getItemById(id: string): ResurfaceItem | null {
  const db = getResurfaceDatabase()
  const row = db
    .prepare('SELECT * FROM resurface_items WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined

  return row ? mapRowToItem(row) : null
}

export function listItems(options: ItemListOptions = {}): ItemListResult {
  const status = VALID_STATUSES.includes(options.status as ResurfaceStatus)
    ? (options.status as ResurfaceStatus)
    : 'active'
  const sort = options.sort ?? 'captured_at'
  const dir = options.dir === 'asc' ? 'ASC' : 'DESC'
  const search = options.search?.trim() || null
  const safeLimit = Math.max(1, Math.min(Number(options.limit ?? 50), 200))
  const safePage = Math.max(1, Number(options.page ?? 1))
  const offset = (safePage - 1) * safeLimit
  const orderCol = SORT_COLUMNS[sort] ?? 'captured_at'
  const orderClause = sort === 'random' ? 'RANDOM()' : `${orderCol} ${dir}`

  const db = getResurfaceDatabase()
  let rows: Record<string, unknown>[]
  let total: number

  if (search) {
    const like = `%${search}%`
    rows = db
      .prepare(
        `SELECT * FROM resurface_items WHERE status = ?
         AND (title LIKE ? OR url LIKE ? OR original_text LIKE ?)
         ORDER BY ${orderClause} LIMIT ? OFFSET ?`
      )
      .all(status, like, like, like, safeLimit, offset) as Record<
      string,
      unknown
    >[]
    total = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM resurface_items WHERE status = ?
           AND (title LIKE ? OR url LIKE ? OR original_text LIKE ?)`
        )
        .get(status, like, like, like) as { c: number }
    ).c
  } else {
    rows = db
      .prepare(
        `SELECT * FROM resurface_items WHERE status = ?
         ORDER BY ${orderClause} LIMIT ? OFFSET ?`
      )
      .all(status, safeLimit, offset) as Record<string, unknown>[]
    total = (
      db
        .prepare(`SELECT COUNT(*) as c FROM resurface_items WHERE status = ?`)
        .get(status) as { c: number }
    ).c
  }

  return {
    items: rows.map((row) => mapRowToItem(row)),
    total,
    page: safePage,
    totalPages: Math.ceil(total / safeLimit),
    pageSize: safeLimit,
    counts: getStatusCounts(),
  }
}
