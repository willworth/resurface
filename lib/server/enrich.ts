// apps/resurface/lib/server/enrich.ts


import {
  deriveCategory,
  deriveSuggestedArchive,
  deriveTags,
  deriveTitle,
  extractUrl,
} from './classify'
import { getResurfaceDatabase, mapRowToItem } from './sqlite'
import { ResurfaceItem } from './types'

export function enrichItem(id: string): ResurfaceItem | null {
  const db = getResurfaceDatabase()
  const row = db
    .prepare('SELECT * FROM resurface_items WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined

  if (!row) {
    return null
  }

  const current = mapRowToItem(row)
  const url = current.url ?? extractUrl(current.originalText)
  const category = deriveCategory(current.originalText, url)
  const suggestedArchive = deriveSuggestedArchive(category)
  const tags = deriveTags(current.originalText, url)
  const title =
    current.title?.trim().length > 0
      ? current.title
      : deriveTitle(current.originalText, url)

  const summary =
    current.summary ??
    `Saved capture: ${title}. Review and decide whether to archive permanently or drop.`

  db.prepare(
    `
    UPDATE resurface_items
    SET
      url = ?,
      title = ?,
      summary = ?,
      category = ?,
      suggested_archive = ?,
      tags_json = ?
    WHERE id = ?
  `
  ).run(
    url,
    title,
    summary,
    category,
    suggestedArchive,
    JSON.stringify(tags),
    id
  )

  const fresh = db
    .prepare('SELECT * FROM resurface_items WHERE id = ? LIMIT 1')
    .get(id) as Record<string, unknown> | undefined

  return fresh ? mapRowToItem(fresh) : null
}
