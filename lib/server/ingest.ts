// apps/resurface/lib/server/ingest.ts

// packages/apps/resurface/lib/server/ingest.ts

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
  task: TodoistTask
  text: string
  url: string | null
  fingerprint: string
}): boolean {
  const db = getResurfaceDatabase()
  const category = deriveCategory(params.text, params.url)
  const nowIso = new Date().toISOString()

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
      randomUUID(),
      params.url,
      deriveTitle(params.text, params.url),
      null,
      params.text,
      category,
      deriveSuggestedArchive(category),
      JSON.stringify(deriveTags(params.text, params.url)),
      'todoist-inbox',
      params.task.id,
      params.task.created_at ?? nowIso,
      nowIso,
      'active',
      params.fingerprint,
      0
    )

  return result.changes > 0
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
          task,
          text,
          url,
          fingerprint,
        })

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

  const category = deriveCategory(originalText, normalizedUrl)
  const nowIso = new Date().toISOString()
  const id = randomUUID()

  const db = getResurfaceDatabase()
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
      id,
      normalizedUrl,
      normalizedTitle ?? deriveTitle(originalText, normalizedUrl),
      normalizedMetaDescription,
      originalText,
      category,
      deriveSuggestedArchive(category),
      JSON.stringify(deriveTags(originalText, normalizedUrl)),
      'browser-extension',
      normalizedUrl,
      nowIso,
      nowIso,
      'active',
      fingerprint,
      0
    )

  if (result.changes > 0) {
    return {
      status: 'created',
      id,
      category,
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
