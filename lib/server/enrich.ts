// apps/resurface/lib/server/enrich.ts


import {
  deriveCategory,
  deriveSuggestedArchive,
  deriveTags,
  deriveTitle,
  extractUrl,
} from './classify'
import { fetchPreviewMetadata } from './preview'
import { getResurfaceDatabase, mapRowToItem } from './sqlite'
import { ResurfaceItem } from './types'

function hostLabel(url: string | null): string | null {
  if (!url) return null

  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function isGenericTitle(title: string | null, url: string | null): boolean {
  const normalized = title?.trim().toLowerCase()
  if (!normalized) return true

  const host = hostLabel(url)
  const genericTitles = new Set([
    'youtube',
    'youtube.com',
    'm.youtube.com',
    'youtu.be',
    'github',
    'github.com',
    'untitled capture',
  ])

  return (
    normalized === url?.trim().toLowerCase() ||
    normalized === host ||
    genericTitles.has(normalized)
  )
}

export async function enrichItem(
  id: string,
  options?: { forcePreviewRefresh?: boolean }
): Promise<ResurfaceItem | null> {
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
  const shouldRefreshPreview =
    Boolean(url) &&
    (options?.forcePreviewRefresh ||
      isGenericTitle(current.title, url) ||
      !current.previewSiteName ||
      !current.previewDescription ||
      !current.previewImageUrl)
  const preview = shouldRefreshPreview && url ? await fetchPreviewMetadata(url) : null
  const title =
    isGenericTitle(current.title, url)
      ? preview?.previewTitle ??
        deriveTitle(current.originalText, url)
      : current.title

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
      preview_site_name = ?,
      preview_description = ?,
      preview_image_url = ?,
      preview_fetched_at = ?,
      category = ?,
      suggested_archive = ?,
      tags_json = ?
    WHERE id = ?
  `
  ).run(
    url,
    title,
    summary,
    options?.forcePreviewRefresh
      ? preview?.previewSiteName ?? current.previewSiteName ?? null
      : current.previewSiteName ?? preview?.previewSiteName ?? null,
    options?.forcePreviewRefresh
      ? preview?.previewDescription ?? current.previewDescription ?? null
      : current.previewDescription ?? preview?.previewDescription ?? null,
    options?.forcePreviewRefresh
      ? preview?.previewImageUrl ?? current.previewImageUrl ?? null
      : current.previewImageUrl ?? preview?.previewImageUrl ?? null,
    preview?.previewFetchedAt ?? current.previewFetchedAt ?? null,
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
