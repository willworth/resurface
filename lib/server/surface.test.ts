// apps/resurface/lib/server/surface.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getResurfaceDatabase, resetResurfaceDatabaseForTests } from './sqlite'
import { getItemsForSession, getNextItemToSurface } from './surface'

function setupTestDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-surface-'))
  process.env.RESURFACE_SQLITE_PATH = path.join(tempDir, 'resurface.db')
  resetResurfaceDatabaseForTests()
}

function insertItem(input: {
  id: string
  title: string
  category: string
  tags?: string[]
  capturedAt: string
  lastSurfacedAt?: string | null
  snoozeCount?: number
}) {
  const db = getResurfaceDatabase()
  db.prepare(
    `
    INSERT INTO resurface_items (
      id, title, original_text, category, tags_json, source, captured_at,
      ingested_at, status, fingerprint, snooze_count, last_surfaced_at
    ) VALUES (?, ?, ?, ?, ?, 'test', ?, ?, 'active', ?, ?, ?)
  `
  ).run(
    input.id,
    input.title,
    input.title,
    input.category,
    JSON.stringify(input.tags ?? []),
    input.capturedAt,
    input.capturedAt,
    `fp-${input.id}`,
    input.snoozeCount ?? 0,
    input.lastSurfacedAt ?? null
  )
}

describe('surface ranking', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
  })

  it('returns deterministic top item and session ordering', () => {
    insertItem({
      id: 'a',
      title: 'Old research',
      category: 'reference',
      tags: ['research'],
      capturedAt: '2025-01-01T00:00:00.000Z',
      snoozeCount: 0,
    })
    insertItem({
      id: 'b',
      title: 'Recent item',
      category: 'link',
      capturedAt: '2026-01-01T00:00:00.000Z',
      snoozeCount: 0,
    })

    const session = getItemsForSession(2)
    expect(session[0]?.id).toBe('a')
    expect(session[1]?.id).toBe('b')

    const next = getNextItemToSurface()
    expect(next.item?.id).toBe('a')
  })

  it('excludes items already passed in the current session', () => {
    insertItem({
      id: 'a',
      title: 'Old research',
      category: 'reference',
      tags: ['research'],
      capturedAt: '2025-01-01T00:00:00.000Z',
      snoozeCount: 0,
    })
    insertItem({
      id: 'b',
      title: 'Second item',
      category: 'link',
      capturedAt: '2026-01-01T00:00:00.000Z',
      snoozeCount: 0,
    })

    const next = getNextItemToSurface(['a'])
    expect(next.item?.id).toBe('b')
  })

  it('forces decisions when snooze count reaches threshold', () => {
    insertItem({
      id: 'force',
      title: 'Looping item',
      category: 'idea',
      capturedAt: '2025-01-01T00:00:00.000Z',
      snoozeCount: 5,
    })

    const next = getNextItemToSurface()
    expect(next.item?.id).toBe('force')
    expect(next.forceDecision).toBe(true)
  })
})
