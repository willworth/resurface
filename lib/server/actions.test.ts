// apps/resurface/lib/server/actions.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getResurfaceDatabase, resetResurfaceDatabaseForTests } from './sqlite'
import { passItem, snoozeItem } from './actions'

function setupTestDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-actions-'))
  process.env.RESURFACE_SQLITE_PATH = path.join(tempDir, 'resurface.db')
  resetResurfaceDatabaseForTests()
}

function insertItem(id: string, snoozeCount: number) {
  const db = getResurfaceDatabase()
  db.prepare(
    `
    INSERT INTO resurface_items (
      id, title, original_text, category, tags_json, source, captured_at,
      ingested_at, status, fingerprint, snooze_count
    ) VALUES (?, ?, ?, 'reference', '[]', 'test', ?, ?, 'active', ?, ?)
  `
  ).run(
    id,
    `item ${id}`,
    `item ${id}`,
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    `fp-${id}`,
    snoozeCount
  )
}

describe('snooze action force-decision rule', () => {
  beforeEach(() => {
    setupTestDb()
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
  })

  it('blocks snooze when threshold reached', () => {
    insertItem('blocked', 5)
    const result = snoozeItem('blocked', 'tomorrow')
    expect(result).toEqual({ ok: false, reason: 'force-decision-required' })
  })

  it('snoozes normally below threshold', () => {
    insertItem('ok', 1)
    const result = snoozeItem('ok', 'tomorrow')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.item.snoozeCount).toBe(2)
      expect(result.item.suppressUntil).toBeTruthy()
    }
  })

  it('logs a pass without mutating snooze or status state', () => {
    insertItem('passable', 2)

    const item = passItem('passable')
    expect(item?.status).toBe('active')
    expect(item?.snoozeCount).toBe(2)

    const db = getResurfaceDatabase()
    const event = db
      .prepare(
        `SELECT event_type, item_id FROM resurface_events WHERE item_id = ? LIMIT 1`
      )
      .get('passable') as { event_type: string; item_id: string } | undefined

    expect(event).toEqual({ event_type: 'passed', item_id: 'passable' })
  })
})
