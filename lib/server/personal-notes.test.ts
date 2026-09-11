import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  archiveItem,
  dropItem,
  restoreItem,
  snoozeItem,
  unarchiveItem,
  updateItemNote,
  NOTE_MAX_LENGTH,
} from './actions'
import { ingestStructuredCaptures } from './ingest'
import { getItemById, listItems } from './items'
import {
  getResurfaceDatabase,
  resetResurfaceDatabaseForTests,
} from './sqlite'

let tmpDir: string
let dbPath: string

function setupTestDb() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-notes-test-'))
  dbPath = path.join(tmpDir, 'resurface.db')
  process.env.RESURFACE_SQLITE_PATH = dbPath
  resetResurfaceDatabaseForTests()
}

function cleanupTestDb() {
  resetResurfaceDatabaseForTests()
  delete process.env.RESURFACE_SQLITE_PATH
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
}

function insertRawOldSchemaItem(db: DatabaseSync, id: string, title: string, text: string) {
  db.prepare(
    `
    INSERT INTO resurface_items (
      id, url, title, summary, original_text, category, suggested_archive,
      tags_json, source, captured_at, ingested_at, status, fingerprint, snooze_count
    ) VALUES (?, ?, ?, ?, ?, 'article', 'Reading', '[]', 'test', ?, ?, 'active', ?, 0)
  `
  ).run(
    id,
    `https://example.com/${id}`,
    title,
    `Summary for ${id}`,
    text,
    '2026-09-01T10:00:00.000Z',
    '2026-09-01T10:00:00.000Z',
    `fp-${id}`
  )
}

describe('Personal Notes — backend actions, storage, and migration', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterEach(() => {
    cleanupTestDb()
  })

  it('migrates an older database without personal_note, preserves all existing data, and reruns cleanly', () => {
    // Manually create an older schema WITHOUT personal_note
    const rawDb = new DatabaseSync(dbPath)
    rawDb.exec(`
      CREATE TABLE resurface_items (
        id TEXT PRIMARY KEY,
        url TEXT,
        title TEXT NOT NULL,
        summary TEXT,
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
        fingerprint TEXT NOT NULL,
        snooze_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE resurface_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `)

    insertRawOldSchemaItem(
      rawDb,
      'old-item-1',
      'Synthetic Old Article',
      'Original source text from before personal notes feature'
    )
    rawDb.close()

    // Now boot the app's getResurfaceDatabase(), which triggers ensureSchema()
    const db = getResurfaceDatabase()

    // Verify column was added
    const columns = db
      .prepare(`PRAGMA table_info(resurface_items)`)
      .all() as Array<{ name?: string }>
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain('personal_note')

    // Verify existing data was completely preserved
    const item = getItemById('old-item-1')
    expect(item).not.toBeNull()
    expect(item?.title).toBe('Synthetic Old Article')
    expect(item?.originalText).toBe(
      'Original source text from before personal notes feature'
    )
    expect(item?.url).toBe('https://example.com/old-item-1')
    expect(item?.summary).toBe('Summary for old-item-1')
    expect(item?.personalNote).toBeNull()

    // Verify rerunning ensureSchema is idempotent and reruns cleanly
    resetResurfaceDatabaseForTests()
    expect(getResurfaceDatabase()).toBeDefined()
    const itemAgain = getItemById('old-item-1')
    expect(itemAgain?.title).toBe('Synthetic Old Article')
    expect(itemAgain?.personalNote).toBeNull()
  })

  it('supports adding, editing, multiline content, and clearing notes', () => {
    ingestStructuredCaptures(
      [
        {
          text: 'Invented capture for personal annotation test',
          url: 'https://example.org/item-annotation-1',
          title: 'Paper on synthetic testing',
        },
      ],
      'test-source'
    )
    const list = listItems({ status: 'active' })
    expect(list.total).toBe(1)
    const itemId = list.items[0].id
    expect(list.items[0].personalNote).toBeNull()

    // 1. Add multiline note
    const multilineNote = 'Line 1: Key observation.\nLine 2: Another synthetic thought.\nLine 3: Relevant follow-up.'
    const addResult = updateItemNote(itemId, multilineNote)
    expect(addResult.ok).toBe(true)
    if (addResult.ok) {
      expect(addResult.item.personalNote).toBe(multilineNote)
    }

    const fetchedAfterAdd = getItemById(itemId)
    expect(fetchedAfterAdd?.personalNote).toBe(multilineNote)

    // 2. Edit note
    const editedNote = 'Line 1: Revised reflection.\nLine 2: Kept thought.'
    const editResult = updateItemNote(itemId, editedNote, multilineNote)
    expect(editResult.ok).toBe(true)
    if (editResult.ok) {
      expect(editResult.item.personalNote).toBe(editedNote)
    }

    // 3. Clear note with empty string
    const clearResult = updateItemNote(itemId, '')
    expect(clearResult.ok).toBe(true)
    if (clearResult.ok) {
      expect(clearResult.item.personalNote).toBeNull()
    }
    expect(getItemById(itemId)?.personalNote).toBeNull()

    // 4. Clear note with whitespace-only string
    updateItemNote(itemId, 'Some note')
    expect(getItemById(itemId)?.personalNote).toBe('Some note')
    const whitespaceClearResult = updateItemNote(itemId, '   \n\t   \n  ')
    expect(whitespaceClearResult.ok).toBe(true)
    if (whitespaceClearResult.ok) {
      expect(whitespaceClearResult.item.personalNote).toBeNull()
    }
    expect(getItemById(itemId)?.personalNote).toBeNull()
  })

  it('validates maximum note length and payload types without silent truncation', () => {
    ingestStructuredCaptures(
      [
        {
          text: 'Payload validation sample text',
          url: 'https://example.org/val-1',
        },
      ],
      'test'
    )
    const item = listItems({ status: 'active' }).items[0]

    // Max length exact boundary (10,000 characters)
    const exactMaxNote = 'x'.repeat(NOTE_MAX_LENGTH)
    const maxResult = updateItemNote(item.id, exactMaxNote)
    expect(maxResult.ok).toBe(true)
    if (maxResult.ok) {
      expect(maxResult.item.personalNote?.length).toBe(NOTE_MAX_LENGTH)
    }

    // Exceeding max length (10,001 characters)
    const overMaxNote = 'x'.repeat(NOTE_MAX_LENGTH + 1)
    const overResult = updateItemNote(item.id, overMaxNote)
    expect(overResult.ok).toBe(false)
    if (!overResult.ok) {
      expect(overResult.reason).toBe('validation-error')
      expect(overResult.message).toContain('10,000 characters')
    }

    // DB remains at previous valid value, not truncated
    expect(getItemById(item.id)?.personalNote?.length).toBe(NOTE_MAX_LENGTH)

    // Invalid payload types
    const invalidTypeResult = updateItemNote(item.id, 12345 as unknown as string)
    expect(invalidTypeResult.ok).toBe(false)
    if (!invalidTypeResult.ok) {
      expect(invalidTypeResult.reason).toBe('validation-error')
    }

    // Non-existent item ID
    const notFoundResult = updateItemNote('non-existent-id-999', 'A note')
    expect(notFoundResult.ok).toBe(false)
    if (!notFoundResult.ok) {
      expect(notFoundResult.reason).toBe('item-not-found')
    }
  })

  it('preserves original content, deduplication fingerprint, and review metadata when saving notes', () => {
    ingestStructuredCaptures(
      [
        {
          text: 'Exact source content that must never be altered',
          url: 'https://example.org/immutable-source',
          title: 'Immutable Title',
          summary: 'Original preview summary',
          previewSiteName: 'Example Org',
          previewDescription: 'Original description',
        },
      ],
      'test-source'
    )
    const initial = listItems({ status: 'active' }).items[0]
    const initialFingerprint = initial.fingerprint
    const initialOriginalText = initial.originalText
    const initialUrl = initial.url
    const initialTitle = initial.title
    const initialSummary = initial.summary
    const initialPreviewDesc = initial.previewDescription

    // Update personal note
    const result = updateItemNote(initial.id, 'My subjective annotation about this item')
    expect(result.ok).toBe(true)

    const updated = getItemById(initial.id)!
    expect(updated.personalNote).toBe('My subjective annotation about this item')
    expect(updated.originalText).toBe(initialOriginalText)
    expect(updated.url).toBe(initialUrl)
    expect(updated.title).toBe(initialTitle)
    expect(updated.summary).toBe(initialSummary)
    expect(updated.previewDescription).toBe(initialPreviewDesc)
    expect(updated.fingerprint).toBe(initialFingerprint)
    expect(updated.status).toBe('active')
    expect(updated.snoozeCount).toBe(0)

    // Re-ingesting the identical source item does not overwrite personal note
    const ingestDuplicate = ingestStructuredCaptures(
      [
        {
          text: 'Exact source content that must never be altered',
          url: 'https://example.org/immutable-source',
        },
      ],
      'another-source'
    )
    expect(ingestDuplicate.duplicates).toBe(1)
    expect(getItemById(initial.id)?.personalNote).toBe('My subjective annotation about this item')
  })

  it('retains personal notes across reload, archive, unarchive, snooze, discard, and restore', () => {
    ingestStructuredCaptures(
      [
        {
          text: 'Lifecycle test item',
          url: 'https://example.org/lifecycle-test',
        },
      ],
      'lifecycle'
    )
    const item = listItems({ status: 'active' }).items[0]
    const noteText = 'Durable note that must survive state transitions'
    updateItemNote(item.id, noteText)

    // 1. Snooze
    const snoozeRes = snoozeItem(item.id, 'tomorrow')
    expect(snoozeRes.ok).toBe(true)
    expect(getItemById(item.id)?.personalNote).toBe(noteText)

    // 2. Archive
    const archiveRes = archiveItem(item.id, 'Saved / Reading')
    expect(archiveRes?.status).toBe('archived')
    expect(getItemById(item.id)?.personalNote).toBe(noteText)

    // 3. Unarchive
    const unarchiveRes = unarchiveItem(item.id)
    expect(unarchiveRes?.status).toBe('active')
    expect(getItemById(item.id)?.personalNote).toBe(noteText)

    // 4. Discard
    const dropRes = dropItem(item.id)
    expect(dropRes?.status).toBe('dropped')
    expect(getItemById(item.id)?.personalNote).toBe(noteText)

    // 5. Restore
    const restoreRes = restoreItem(item.id)
    expect(restoreRes?.status).toBe('active')
    expect(getItemById(item.id)?.personalNote).toBe(noteText)

    // 6. Reload DB connection
    resetResurfaceDatabaseForTests()
    expect(getItemById(item.id)?.personalNote).toBe(noteText)
  })

  it('detects concurrent conflicts with expectedCurrentNote and allows idempotent retry', () => {
    ingestStructuredCaptures(
      [
        {
          text: 'Concurrency test capture',
          url: 'https://example.org/concurrency-test',
        },
      ],
      'test'
    )
    const item = listItems({ status: 'active' }).items[0]

    // Initial note set
    updateItemNote(item.id, 'Original Note V1')

    // Session A and Session B both loaded V1
    // Session A saves V2 successfully
    const sessionAResult = updateItemNote(
      item.id,
      'Session A: updated to V2',
      'Original Note V1'
    )
    expect(sessionAResult.ok).toBe(true)

    // Session B tries to save V3 expecting V1 -> conflict detected!
    const sessionBResult = updateItemNote(
      item.id,
      'Session B: conflicting edit',
      'Original Note V1'
    )
    expect(sessionBResult.ok).toBe(false)
    if (!sessionBResult.ok) {
      expect(sessionBResult.reason).toBe('conflict')
      expect(sessionBResult.currentNote).toBe('Session A: updated to V2')
    }

    // Idempotent retry: Session A retries saving V2 with old expected V1 -> succeeds idempotently
    const retryResult = updateItemNote(
      item.id,
      'Session A: updated to V2',
      'Original Note V1'
    )
    expect(retryResult.ok).toBe(true)
  })

  it('filters by "hasNote", composing with search, status, and pagination with exact total counts', () => {
    // Seed 15 items: 5 with notes, 10 without notes
    const captures = []
    for (let i = 1; i <= 15; i++) {
      captures.push({
        text: `Synthetic Item number ${i} for filter testing`,
        url: `https://example.org/filter-test-${i}`,
        title: i % 2 === 0 ? `Even Paper ${i}` : `Odd Paper ${i}`,
      })
    }
    ingestStructuredCaptures(captures, 'filter-test')
    const allItems = listItems({ status: 'active', limit: 50 }).items
    const itemEven1 = allItems.find((i) => i.title === 'Even Paper 2')!
    const itemEven2 = allItems.find((i) => i.title === 'Even Paper 4')!
    const itemOdd1 = allItems.find((i) => i.title === 'Odd Paper 1')!
    const itemOdd2 = allItems.find((i) => i.title === 'Odd Paper 3')!
    const itemWhitespace = allItems.find((i) => i.title === 'Even Paper 6')!
    const itemArchived = allItems.find((i) => i.title === 'Odd Paper 5')!

    // Add notes
    updateItemNote(itemEven1.id, 'Note on even 1')
    updateItemNote(itemEven2.id, 'Line 1\nLine 2 note on even 2')
    updateItemNote(itemOdd1.id, 'Note on odd 1')
    updateItemNote(itemOdd2.id, 'Note on odd 2')
    updateItemNote(itemWhitespace.id, '   \t  ') // whitespace-only -> should NOT count
    updateItemNote(itemArchived.id, 'Note on archived odd 5')

    // Archive item to test status composition
    archiveItem(itemArchived.id, 'Research')

    // 1. All active items with notes
    const activeWithNotes = listItems({
      status: 'active',
      hasNote: true,
      limit: 10,
    })
    // 4 active items have notes: itemEven1, itemEven2, itemOdd1, itemOdd2
    expect(activeWithNotes.total).toBe(4)
    expect(activeWithNotes.items.length).toBe(4)
    expect(activeWithNotes.items.every((i) => i.personalNote !== null)).toBe(true)

    // 2. Archived items with notes
    const archivedWithNotes = listItems({
      status: 'archived',
      hasNote: true,
    })
    expect(archivedWithNotes.total).toBe(1)
    expect(archivedWithNotes.items[0].id).toBe(itemArchived.id)

    // 3. Compose with search
    const searchWithNotes = listItems({
      status: 'active',
      hasNote: true,
      search: 'Even',
    })
    expect(searchWithNotes.total).toBe(2)
    expect(searchWithNotes.items.every((i) => i.title.includes('Even'))).toBe(true)

    // 4. Pagination across multiple pages with small limit
    const page1 = listItems({
      status: 'active',
      hasNote: true,
      limit: 2,
      page: 1,
    })
    expect(page1.total).toBe(4)
    expect(page1.totalPages).toBe(2)
    expect(page1.items.length).toBe(2)

    const page2 = listItems({
      status: 'active',
      hasNote: true,
      limit: 2,
      page: 2,
    })
    expect(page2.total).toBe(4)
    expect(page2.items.length).toBe(2)
    expect(page1.items[0].id).not.toBe(page2.items[0].id)

    // 5. Clearing a note immediately removes it from the hasNote query
    updateItemNote(itemEven1.id, '')
    const activeAfterClear = listItems({
      status: 'active',
      hasNote: true,
    })
    expect(activeAfterClear.total).toBe(3)
    expect(activeAfterClear.items.some((i) => i.id === itemEven1.id)).toBe(false)
  })
})
