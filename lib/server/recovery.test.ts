import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  archiveItem,
  discardItem,
  dropItem,
  restoreItem,
  snoozeItem,
  unarchiveItem,
} from './actions'
import { getStatusCounts, listItems } from './items'
import { getResurfaceDatabase, resetResurfaceDatabaseForTests } from './sqlite'
import { getNextItemToSurface } from './surface'

function setupTestDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-recovery-test-'))
  process.env.RESURFACE_SQLITE_PATH = path.join(tempDir, 'resurface.db')
  resetResurfaceDatabaseForTests()
}

function insertItem(
  id: string,
  options: {
    status?: 'active' | 'snoozed' | 'archived' | 'dropped'
    suppressUntil?: string | null
    archivedAt?: string | null
    archivedTo?: string | null
    droppedAt?: string | null
    preDiscardStateJson?: string | null
    pinnedAt?: string | null
    libraryPriority?: number
    libraryShelf?: string | null
  } = {}
) {
  const db = getResurfaceDatabase()
  db.prepare(
    `
    INSERT INTO resurface_items (
      id, title, original_text, category, tags_json, source, captured_at,
      ingested_at, status, suppress_until, archived_at, archived_to, dropped_at,
      pre_discard_state_json, pinned_at, library_priority, library_shelf,
      fingerprint, snooze_count
    ) VALUES (
      ?, ?, ?, 'reference', '[]', 'test', '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z', ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, 0
    )
  `
  ).run(
    id,
    `Title ${id}`,
    `Text ${id}`,
    options.status ?? 'active',
    options.suppressUntil ?? null,
    options.archivedAt ?? null,
    options.archivedTo ?? null,
    options.droppedAt ?? null,
    options.preDiscardStateJson ?? null,
    options.pinnedAt ?? null,
    options.libraryPriority ?? 0,
    options.libraryShelf ?? null,
    `fp-${id}`
  )
}

describe('Recovery, Discard, and Snooze semantics', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
  })

  it('discards an active item and restores it to active review', () => {
    insertItem('item-active')
    const dropped = discardItem('item-active')

    expect(dropped?.status).toBe('dropped')
    expect(dropped?.droppedAt).toBeTruthy()
    expect(dropped?.preDiscardState?.status).toBe('active')

    const restored = restoreItem('item-active')
    expect(restored?.status).toBe('active')
    expect(restored?.droppedAt).toBeNull()
    expect(restored?.preDiscardState).toBeNull()
  })

  it('discards an archived item and restores to archived with metadata preserved', () => {
    insertItem('item-archived')
    archiveItem('item-archived', 'Reading List', {
      shelf: 'Reading List',
      priority: 4,
      pinned: true,
    })

    const dropped = dropItem('item-archived')
    expect(dropped?.status).toBe('dropped')
    expect(dropped?.preDiscardState?.status).toBe('archived')
    expect(dropped?.preDiscardState?.archivedTo).toBe('Reading List')

    const restored = restoreItem('item-archived')
    expect(restored?.status).toBe('archived')
    expect(restored?.archivedTo).toBe('Reading List')
    expect(restored?.libraryShelf).toBe('reading-list')
    expect(restored?.libraryPriority).toBe(4)
    expect(restored?.pinnedAt).toBeTruthy()
  })

  it('discards a snoozed item and restores pre-discard snooze suppression', () => {
    insertItem('item-snoozed')
    const snoozeRes = snoozeItem('item-snoozed', 'next-week')
    expect(snoozeRes.ok).toBe(true)

    const dropped = discardItem('item-snoozed')
    expect(dropped?.status).toBe('dropped')
    expect(dropped?.preDiscardState?.suppressUntil).toBeTruthy()

    const restored = restoreItem('item-snoozed')
    expect(restored?.status).toBe('active')
    expect(restored?.suppressUntil).toBeTruthy()
  })

  it('restores legacy dropped rows without pre-discard state to review', () => {
    insertItem('legacy-dropped', {
      status: 'dropped',
      droppedAt: '2026-02-15T10:00:00.000Z',
      preDiscardStateJson: null,
    })

    const restored = restoreItem('legacy-dropped')
    expect(restored?.status).toBe('active')
    expect(restored?.droppedAt).toBeNull()
  })

  it('restores rows dropped more than 24 hours ago (indefinite retention)', () => {
    insertItem('old-dropped', {
      status: 'dropped',
      droppedAt: '2026-07-01T00:00:00.000Z',
      preDiscardStateJson: JSON.stringify({
        status: 'archived',
        archivedTo: 'Old Folder',
      }),
    })

    const restored = restoreItem('old-dropped')
    expect(restored?.status).toBe('archived')
    expect(restored?.archivedTo).toBe('Old Folder')
    expect(restored?.droppedAt).toBeNull()
  })

  it('repeated discard and restore calls do not corrupt state', () => {
    insertItem('repeated-item')
    archiveItem('repeated-item', 'Work')

    const drop1 = discardItem('repeated-item')
    expect(drop1?.status).toBe('dropped')
    const drop2 = discardItem('repeated-item')
    expect(drop2?.preDiscardState?.status).toBe('archived')

    const restore1 = restoreItem('repeated-item')
    expect(restore1?.status).toBe('archived')

    const restore2 = restoreItem('repeated-item')
    expect(restore2?.status).toBe('archived')
  })

  it('unarchives an item back to review', () => {
    insertItem('to-unarchive')
    archiveItem('to-unarchive', 'Ideas', { shelf: 'Ideas', priority: 3 })

    const unarchived = unarchiveItem('to-unarchive')
    expect(unarchived?.status).toBe('active')
    expect(unarchived?.archivedAt).toBeNull()
    expect(unarchived?.libraryShelf).toBe('ideas')
    expect(unarchived?.libraryPriority).toBe(3)
  })

  it('accurately counts and filters future-snoozed vs expired vs active items', () => {
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString()
    const pastDate = new Date(Date.now() - 86400000 * 2).toISOString()

    insertItem('item-clean-active', { status: 'active', suppressUntil: null })
    insertItem('item-expired-snooze', { status: 'active', suppressUntil: pastDate })
    insertItem('item-future-snooze', { status: 'active', suppressUntil: futureDate })
    insertItem('item-legacy-snoozed-null', { status: 'snoozed', suppressUntil: null })
    insertItem('item-legacy-snoozed-expired', { status: 'snoozed', suppressUntil: pastDate })
    insertItem('item-legacy-snoozed-future', { status: 'snoozed', suppressUntil: futureDate })
    insertItem('item-archived-row', { status: 'archived' })
    insertItem('item-dropped-row', { status: 'dropped' })

    const counts = getStatusCounts()
    // Active includes expired and timestamp-less legacy snoozed rows.
    expect(counts.active).toBe(4)
    // Snoozed includes only rows with a future suppression timestamp.
    expect(counts.snoozed).toBe(2)
    expect(counts.archived).toBe(1)
    expect(counts.dropped).toBe(1)

    // listItems active
    const activeList = listItems({ status: 'active' })
    const activeIds = activeList.items.map((i) => i.id)
    expect(activeIds).toContain('item-clean-active')
    expect(activeIds).toContain('item-expired-snooze')
    expect(activeIds).toContain('item-legacy-snoozed-null')
    expect(activeIds).toContain('item-legacy-snoozed-expired')
    expect(activeIds).not.toContain('item-future-snooze')
    expect(activeIds).not.toContain('item-legacy-snoozed-future')

    // listItems snoozed
    const snoozedList = listItems({ status: 'snoozed' })
    const snoozedIds = snoozedList.items.map((i) => i.id)
    expect(snoozedIds).toContain('item-future-snooze')
    expect(snoozedIds).toContain('item-legacy-snoozed-future')
    expect(snoozedIds).not.toContain('item-legacy-snoozed-null')
    expect(snoozedIds).not.toContain('item-legacy-snoozed-expired')
    expect(snoozedIds).not.toContain('item-clean-active')
    expect(snoozedIds).not.toContain('item-expired-snooze')

    // Home review candidate selection excludes future-snoozed
    const surfaced = getNextItemToSurface()
    expect([
      'item-clean-active',
      'item-expired-snooze',
      'item-legacy-snoozed-null',
      'item-legacy-snoozed-expired',
    ]).toContain(surfaced.item?.id)
  })

  it('does not unarchive dropped or active items', () => {
    insertItem('dropped-target', {
      status: 'dropped',
      droppedAt: '2026-09-01T00:00:00.000Z',
      preDiscardStateJson: JSON.stringify({ status: 'active' }),
    })
    insertItem('active-target')

    const dropped = unarchiveItem('dropped-target')
    expect(dropped?.status).toBe('dropped')
    expect(dropped?.droppedAt).toBeTruthy()
    expect(dropped?.preDiscardState?.status).toBe('active')

    const active = unarchiveItem('active-target')
    expect(active?.status).toBe('active')
  })

  it('performs additive migration safely on old-schema databases without pre_discard_state_json', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-old-schema-'))
    const oldDbPath = path.join(tempDir, 'old-resurface.db')

    // Create db with older schema
    const rawDb = new DatabaseSync(oldDbPath)
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
        dropped_at TEXT,
        fingerprint TEXT NOT NULL,
        snooze_count INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO resurface_items (
        id, title, original_text, category, source, captured_at,
        ingested_at, fingerprint
      ) VALUES ('old-1', 'Old Item', 'Old Text', 'link', 'import', '2026-01-01', '2026-01-01', 'fp-old');
    `)
    rawDb.close()

    process.env.RESURFACE_SQLITE_PATH = oldDbPath
    resetResurfaceDatabaseForTests()

    // Loading through getResurfaceDatabase should trigger additive schema upgrade
    const db = getResurfaceDatabase()
    const columns = db.prepare('PRAGMA table_info(resurface_items)').all() as Array<{ name: string }>
    const colNames = columns.map((c) => c.name)

    expect(colNames).toContain('pre_discard_state_json')

    // Existing data is untouched and can be discarded/restored
    const dropped = discardItem('old-1')
    expect(dropped?.status).toBe('dropped')
    const restored = restoreItem('old-1')
    expect(restored?.status).toBe('active')
    expect(restored?.title).toBe('Old Item')
  })
})
