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
  source?: string
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `
  ).run(
    input.id,
    input.title,
    input.title,
    input.category,
    JSON.stringify(input.tags ?? []),
    input.source ?? 'test',
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

  it('scores rows beyond the former 120-row window for both selectors', () => {
    const capturedAt = new Date().toISOString()
    for (let i = 0; i < 120; i++) {
      insertItem({ id: `early-${i}`, title: 'Early', category: 'link', capturedAt })
    }
    insertItem({ id: 'starved', title: 'Old bookmark', category: 'link',
      source: 'twitter-bookmarks', capturedAt: '2020-01-01T00:00:00.000Z' })

    expect(getItemsForSession(1)[0]?.id).toBe('starved')
    expect(getNextItemToSurface().item?.id).toBe('starved')
    expect(getNextItemToSurface(['starved']).item?.id).not.toBe('starved')
  })

  it('penalises a source seen among the last three surfaces independently of category', () => {
    const capturedAt = new Date().toISOString()
    for (let i = 0; i < 3; i++) {
      insertItem({ id: `history-${i}`, title: 'History', category: 'music',
        source: i === 2 ? 'bulk' : 'other', capturedAt,
        lastSurfacedAt: new Date(Date.now() - i * 1000).toISOString() })
    }
    insertItem({ id: 'a-bulk', title: 'Bulk', category: 'link', source: 'bulk', capturedAt })
    insertItem({ id: 'b-save', title: 'Save', category: 'link', source: 'web-ui', capturedAt })

    expect(getItemsForSession(1)[0]?.id).toBe('b-save')
    expect(getNextItemToSurface().item?.id).toBe('b-save')
    // Once both sources are recent, the original deterministic tie break applies.
    expect(getItemsForSession(1)[0]?.id).toBe('a-bulk')
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
