// apps/resurface/lib/server/sqlite.ts


import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ResurfaceItem } from './types'

let sharedDb: DatabaseSync | null = null
let sharedDbPath: string | null = null

function resolveSqlitePath() {
  const fromEnv = process.env.RESURFACE_SQLITE_PATH
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim()
  }

  return path.join(process.cwd(), '.resurface', 'resurface.db')
}

function ensureSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS resurface_items (
      id TEXT PRIMARY KEY,
      url TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      preview_site_name TEXT,
      preview_description TEXT,
      preview_image_url TEXT,
      preview_fetched_at TEXT,
      original_text TEXT NOT NULL,
      category TEXT NOT NULL,
      suggested_archive TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      source_item_id TEXT,
      captured_at TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      last_surfaced_at TEXT,
      surface_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      suppress_until TEXT,
      archived_at TEXT,
      archived_to TEXT,
      library_shelf TEXT,
      library_priority INTEGER NOT NULL DEFAULT 0,
      pinned_at TEXT,
      dropped_at TEXT,
      fingerprint TEXT NOT NULL,
      snooze_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_resurface_items_fingerprint
      ON resurface_items(fingerprint);

    CREATE INDEX IF NOT EXISTS idx_resurface_items_status
      ON resurface_items(status);

    CREATE INDEX IF NOT EXISTS idx_resurface_items_source_item
      ON resurface_items(source_item_id);

    CREATE TABLE IF NOT EXISTS resurface_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_resurface_events_item
      ON resurface_events(item_id);

    CREATE INDEX IF NOT EXISTS idx_resurface_events_type_created
      ON resurface_events(event_type, created_at);
  `)

  const columns = db
    .prepare(`PRAGMA table_info(resurface_items)`)
    .all() as Array<{ name?: string }>

  const columnNames = new Set(
    columns
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string')
  )

  const previewColumns = [
    ['preview_site_name', 'TEXT'],
    ['preview_description', 'TEXT'],
    ['preview_image_url', 'TEXT'],
    ['preview_fetched_at', 'TEXT'],
    ['library_shelf', 'TEXT'],
    ['library_priority', 'INTEGER NOT NULL DEFAULT 0'],
    ['pinned_at', 'TEXT'],
  ] as const

  for (const [name, type] of previewColumns) {
    if (!columnNames.has(name)) {
      db.exec(`ALTER TABLE resurface_items ADD COLUMN ${name} ${type};`)
    }
  }
}

export function getResurfaceDatabase() {
  const dbPath = resolveSqlitePath()
  if (sharedDb && sharedDbPath === dbPath) {
    return sharedDb
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  sharedDb = new DatabaseSync(dbPath)
  sharedDbPath = dbPath
  ensureSchema(sharedDb)

  return sharedDb
}

export function resetResurfaceDatabaseForTests() {
  if (!sharedDb) {
    return
  }

  sharedDb.close()
  sharedDb = null
  sharedDbPath = null
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

export function mapRowToItem(row: Record<string, unknown>): ResurfaceItem {
  return {
    id: String(row.id ?? ''),
    url: (row.url as string | null) ?? null,
    title: String(row.title ?? ''),
    summary: (row.summary as string | null) ?? null,
    previewSiteName: (row.preview_site_name as string | null) ?? null,
    previewDescription: (row.preview_description as string | null) ?? null,
    previewImageUrl: (row.preview_image_url as string | null) ?? null,
    previewFetchedAt: (row.preview_fetched_at as string | null) ?? null,
    originalText: String(row.original_text ?? ''),
    category: String(row.category ?? 'reference') as ResurfaceItem['category'],
    suggestedArchive: (row.suggested_archive as string | null) ?? null,
    tags: parseTags(row.tags_json),
    source: String(row.source ?? ''),
    sourceItemId: (row.source_item_id as string | null) ?? null,
    capturedAt: String(row.captured_at ?? ''),
    ingestedAt: String(row.ingested_at ?? ''),
    lastSurfacedAt: (row.last_surfaced_at as string | null) ?? null,
    surfaceCount: Number(row.surface_count ?? 0),
    status: String(row.status ?? 'active') as ResurfaceItem['status'],
    suppressUntil: (row.suppress_until as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    archivedTo: (row.archived_to as string | null) ?? null,
    libraryShelf: (row.library_shelf as string | null) ?? null,
    libraryPriority: Number(row.library_priority ?? 0),
    pinnedAt: (row.pinned_at as string | null) ?? null,
    droppedAt: (row.dropped_at as string | null) ?? null,
    fingerprint: String(row.fingerprint ?? ''),
    snoozeCount: Number(row.snooze_count ?? 0),
  }
}
