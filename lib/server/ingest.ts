// apps/resurface/lib/server/ingest.ts


import { randomUUID } from 'node:crypto'
import {
  buildFingerprint,
  deriveCategory,
  deriveSuggestedArchive,
  deriveTags,
  deriveTitle,
  extractUrl,
  isCapture,
} from './classify'
import { logResurfaceEvent } from './events'
import { getResurfaceDatabase } from './sqlite'
import { closeTodoistTask, listInboxTasks } from './todoist'
import type { ResurfaceCategory } from './types'

export type IngestResult = {
  requestedLimit: number
  scanned: number
  capturesDetected: number
  persisted: number
  duplicates: number
  completed: number
  skippedAsTasks: number
  errors: Array<{ taskId: string; reason: string }>
}

export type ExtensionCapturePayload = {
  url: string
  title?: string | null
  selectedText?: string | null
  content?: string | null
  metaDescription?: string | null
  ogImage?: string | null
}

export type ExtensionIngestResult = {
  status: 'created' | 'duplicate'
  id: string
  category: ResurfaceCategory
  fingerprint: string
}

export type NormalizedCaptureInput = {
  source?: string | null
  sourceItemId?: string | null
  text: string
  url?: string | null
  capturedAt?: string
  summary?: string | null
  category?: ResurfaceCategory | null
  suggestedArchive?: string | null
  tags?: string[]
  title?: string | null
}

export type GenericIngestResult = {
  source: string
  scanned: number
  persisted: number
  duplicates: number
  invalid: number
  invalidReasons: string[]
}

export type TwitterBookmarkInput = {
  tweetId: string
  text: string
  url?: string | null
  authorHandle?: string
  capturedAt?: string
}

type TodoistTask = {
  id: string
  content: string
  description: string
  created_at?: string
}

function captureText(task: TodoistTask): string {
  const description = task.description?.trim() ?? ''
  return description.length > 0
    ? `${task.content.trim()}\n\n${description}`
    : task.content.trim()
}

function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildExtensionOriginalText(params: {
  title: string | null
  selectedText: string | null
  content: string | null
  metaDescription: string | null
  ogImage: string | null
  url: string
}): string {
  const parts: string[] = []
  if (params.title) {
    parts.push(params.title)
  }
  if (params.selectedText) {
    parts.push(params.selectedText)
  }
  if (params.metaDescription) {
    parts.push(params.metaDescription)
  }
  if (params.content) {
    parts.push(params.content)
  }
  if (params.ogImage) {
    parts.push(`OG image: ${params.ogImage}`)
  }

  const joined = parts.join('\n\n').trim()
  return joined.length > 0 ? joined : params.url
}

function isAlreadyPersisted(fingerprint: string): boolean {
  const db = getResurfaceDatabase()
  const row = db
    .prepare('SELECT id FROM resurface_items WHERE fingerprint = ? LIMIT 1')
    .get(fingerprint) as { id?: string } | undefined
  return Boolean(row?.id)
}

function findExistingCapture(params: {
  fingerprint: string
}): { id: string; category: ResurfaceCategory } | null {
  const db = getResurfaceDatabase()
  const row = db
    .prepare(
      'SELECT id, category FROM resurface_items WHERE fingerprint = ? LIMIT 1'
    )
    .get(params.fingerprint) as { id?: string; category?: string } | undefined

  if (!row?.id || !row?.category) {
    return null
  }

  return {
    id: row.id,
    category: row.category as ResurfaceCategory,
  }
}

function insertCapture(params: {
  source: string
  sourceItemId: string | null
  text: string
  url: string | null
  fingerprint: string
  capturedAt?: string
  summary?: string | null
  category?: ResurfaceCategory | null
  suggestedArchive?: string | null
  tags?: string[]
  title?: string | null
}): { persisted: boolean; itemId: string; category: ResurfaceCategory } {
  const db = getResurfaceDatabase()
  const category = params.category ?? deriveCategory(params.text, params.url)
  const nowIso = new Date().toISOString()
  const itemId = randomUUID()

  const result = db
    .prepare(
      `
      INSERT OR IGNORE INTO resurface_items (
        id,
        url,
        title,
        summary,
        original_text,
        category,
        suggested_archive,
        tags_json,
        source,
        source_item_id,
        captured_at,
        ingested_at,
        status,
        fingerprint,
        snooze_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      itemId,
      params.url,
      params.title ?? deriveTitle(params.text, params.url),
      params.summary ?? null,
      params.text,
      category,
      params.suggestedArchive ?? deriveSuggestedArchive(category),
      JSON.stringify(params.tags ?? deriveTags(params.text, params.url)),
      params.source,
      params.sourceItemId,
      params.capturedAt ?? nowIso,
      nowIso,
      'active',
      params.fingerprint,
      0
    )

  if (result.changes > 0) {
    logResurfaceEvent('ingested', itemId, {
      source: params.source,
      sourceItemId: params.sourceItemId,
      category,
    })
  }

  return { persisted: result.changes > 0, itemId, category }
}

function normalizeCaptureInput(
  item: NormalizedCaptureInput
):
  | {
      valid: true
      normalized: Required<Pick<NormalizedCaptureInput, 'source' | 'text'>> &
        NormalizedCaptureInput
    }
  | { valid: false; reason: string } {
  const source = item.source?.trim()
  if (!source) {
    return { valid: false, reason: 'Missing source' }
  }

  const text = item.text?.trim()
  if (!text) {
    return { valid: false, reason: 'Missing text' }
  }

  return {
    valid: true,
    normalized: {
      ...item,
      source,
      text,
    },
  }
}

export function ingestStructuredCaptures(
  items: NormalizedCaptureInput[],
  source = 'structured-json'
): GenericIngestResult {
  const result: GenericIngestResult = {
    source,
    scanned: items.length,
    persisted: 0,
    duplicates: 0,
    invalid: 0,
    invalidReasons: [],
  }

  for (const item of items) {
    const itemWithDefaults: NormalizedCaptureInput = {
      ...item,
      source: item.source ?? source,
    }
    const validation = normalizeCaptureInput(itemWithDefaults)
    if (!validation.valid) {
      result.invalid += 1
      result.invalidReasons.push(validation.reason)
      continue
    }

    const normalized = validation.normalized
    const url = normalized.url ?? extractUrl(normalized.text)
    const fingerprint = buildFingerprint(url, normalized.text)

    if (isAlreadyPersisted(fingerprint)) {
      result.duplicates += 1
      continue
    }

    const inserted = insertCapture({
      source: normalized.source ?? source,
      sourceItemId: normalized.sourceItemId ?? null,
      text: normalized.text,
      url,
      fingerprint,
      capturedAt: normalized.capturedAt,
      summary: normalized.summary,
      category: normalized.category,
      suggestedArchive: normalized.suggestedArchive,
      tags: normalized.tags,
      title: normalized.title,
    })

    if (inserted.persisted) {
      result.persisted += 1
    }
  }

  return result
}

export function ingestTwitterBookmarks(
  bookmarks: TwitterBookmarkInput[]
): GenericIngestResult {
  const normalized = bookmarks.map((bookmark) => ({
    source: 'twitter-bookmarks',
    sourceItemId: bookmark.tweetId,
    text: bookmark.text,
    url:
      bookmark.url ??
      (bookmark.tweetId
        ? `https://x.com/i/web/status/${bookmark.tweetId}`
        : undefined),
    capturedAt: bookmark.capturedAt,
    tags: bookmark.authorHandle
      ? [bookmark.authorHandle.replace(/^@/, '')]
      : [],
    title: bookmark.authorHandle
      ? `Tweet from ${bookmark.authorHandle.replace(/^@/, '@')}`
      : 'Twitter bookmark',
  }))

  return ingestStructuredCaptures(normalized, 'twitter-bookmarks')
}

export async function ingestTodoistInbox(
  maxItems = 50,
  options?: { dryRun?: boolean }
): Promise<IngestResult> {
  const dryRun = options?.dryRun ?? false
  const safeLimit = Math.max(1, Math.min(250, maxItems))
  const tasks = await listInboxTasks(safeLimit)

  const result: IngestResult = {
    requestedLimit: safeLimit,
    scanned: tasks.length,
    capturesDetected: 0,
    persisted: 0,
    duplicates: 0,
    completed: 0,
    skippedAsTasks: 0,
    errors: [],
  }

  for (const task of tasks) {
    try {
      const text = captureText(task)

      if (!isCapture(text)) {
        result.skippedAsTasks += 1
        continue
      }

      result.capturesDetected += 1
      const url = extractUrl(text)
      const fingerprint = buildFingerprint(url, text)

      let persisted = false
      if (isAlreadyPersisted(fingerprint)) {
        result.duplicates += 1
        persisted = true
      } else {
        persisted = insertCapture({
          source: 'todoist-inbox',
          sourceItemId: task.id,
          text,
          url,
          fingerprint,
          capturedAt: task.created_at,
        }).persisted

        if (persisted) {
          result.persisted += 1
        }
      }

      // Phase B: only complete once persistence is confirmed (or duplicate exists).
      // In dry-run mode, skip closing Todoist tasks — import only.
      if (persisted && !dryRun) {
        await closeTodoistTask(task.id)
        result.completed += 1
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown ingestion error'
      result.errors.push({ taskId: task.id, reason })
    }
  }

  return result
}

export function ingestExtensionCapture(
  payload: ExtensionCapturePayload
): ExtensionIngestResult {
  const normalizedUrl = normalizeOptionalString(payload.url)
  if (!normalizedUrl) {
    throw new Error('url is required')
  }

  const normalizedTitle = normalizeOptionalString(payload.title)
  const normalizedSelection = normalizeOptionalString(payload.selectedText)
  const normalizedContent = normalizeOptionalString(payload.content)
  const normalizedMetaDescription = normalizeOptionalString(
    payload.metaDescription
  )
  const normalizedOgImage = normalizeOptionalString(payload.ogImage)

  const originalText = buildExtensionOriginalText({
    title: normalizedTitle,
    selectedText: normalizedSelection,
    content: normalizedContent,
    metaDescription: normalizedMetaDescription,
    ogImage: normalizedOgImage,
    url: normalizedUrl,
  })
  const fingerprint = buildFingerprint(normalizedUrl, originalText)

  const existing = findExistingCapture({ fingerprint })
  if (existing) {
    return {
      status: 'duplicate',
      id: existing.id,
      category: existing.category,
      fingerprint,
    }
  }

  const nowIso = new Date().toISOString()
  const result = insertCapture({
    source: 'browser-extension',
    sourceItemId: normalizedUrl,
    text: originalText,
    url: normalizedUrl,
    fingerprint,
    capturedAt: nowIso,
    summary: normalizedMetaDescription,
    category: deriveCategory(originalText, normalizedUrl),
    title: normalizedTitle ?? deriveTitle(originalText, normalizedUrl),
  })

  if (result.persisted) {
    return {
      status: 'created',
      id: result.itemId,
      category: result.category,
      fingerprint,
    }
  }

  const insertedByAnotherWriter = findExistingCapture({ fingerprint })
  if (insertedByAnotherWriter) {
    return {
      status: 'duplicate',
      id: insertedByAnotherWriter.id,
      category: insertedByAnotherWriter.category,
      fingerprint,
    }
  }

  throw new Error('Failed to ingest extension capture')
}
