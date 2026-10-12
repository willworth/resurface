import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeCapturedAt } from './ingest'
import { listItems } from './items'
import {
  getResurfaceDatabase,
  resetResurfaceDatabaseForTests,
} from './sqlite'

let tmpDir: string

function insert(id: string, source: string, capturedAt: string) {
  getResurfaceDatabase()
    .prepare(
      `INSERT INTO resurface_items (
        id, url, title, summary, original_text, category, suggested_archive,
        tags_json, source, captured_at, ingested_at, status, fingerprint, snooze_count
      ) VALUES (?, ?, ?, NULL, ?, 'link', NULL, '[]', ?, ?, ?, 'active', ?, 0)`
    )
    .run(
      id,
      `https://example.com/${id}`,
      id,
      id,
      source,
      capturedAt,
      '2026-10-12T00:00:00.000Z',
      `fp-${id}`
    )
}

describe('Library ordering', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-order-test-'))
    process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'resurface.db')
    resetResurfaceDatabaseForTests()
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('sorts Twitter-format capture dates by their real date in Newest', () => {
    insert('old-tweet', 'twitter-bookmarks', 'Wed May 20 23:48:50 +0000 2026')
    insert('new-link', 'web-ui', '2026-08-11T15:16:53.187Z')
    insert('older-link', 'web-ui', '2026-03-01T10:00:00.000Z')

    const ids = listItems({ sort: 'captured_at', dir: 'desc' }).items.map((i) => i.id)
    expect(ids).toEqual(['new-link', 'old-tweet', 'older-link'])
  })

  it('mixes sources round-robin, newest first within each source', () => {
    for (let i = 0; i < 6; i += 1) {
      insert(`tweet-${i}`, 'twitter-bookmarks', `2026-10-1${i}T10:00:00.000Z`)
    }
    insert('link-a', 'web-ui', '2026-08-02T10:00:00.000Z')
    insert('link-b', 'web-ui', '2026-08-01T10:00:00.000Z')
    insert('tick-a', 'ticktick:Inbox', '2026-06-02T10:00:00.000Z')
    insert('tick-b', 'ticktick:Media', '2026-06-01T10:00:00.000Z')

    const ids = listItems({ sort: 'mixed' }).items.map((i) => i.id)
    expect(ids.slice(0, 3)).toEqual(['tweet-5', 'link-a', 'tick-a'])
    expect(ids.slice(3, 6)).toEqual(['tweet-4', 'link-b', 'tick-b'])
    expect(ids.slice(6)).toEqual(['tweet-3', 'tweet-2', 'tweet-1', 'tweet-0'])
  })

  it('keeps mixed order stable across pages', () => {
    for (let i = 0; i < 5; i += 1) {
      insert(`a-${i}`, 'a', `2026-10-0${i + 1}T10:00:00.000Z`)
      insert(`b-${i}`, 'b', `2026-09-0${i + 1}T10:00:00.000Z`)
    }
    const all = listItems({ sort: 'mixed', limit: 10 }).items.map((i) => i.id)
    const paged = [1, 2, 3, 4, 5].flatMap((page) =>
      listItems({ sort: 'mixed', limit: 2, page }).items.map((i) => i.id)
    )
    expect(paged).toEqual(all)
    expect(new Set(paged).size).toBe(10)
  })
})

describe('normalizeCapturedAt', () => {
  it('converts Twitter dates to ISO and leaves ISO and unknown values alone', () => {
    expect(normalizeCapturedAt('Wed May 20 23:48:50 +0000 2026')).toBe(
      '2026-05-20T23:48:50.000Z'
    )
    expect(normalizeCapturedAt('2026-10-12T10:01:06Z')).toBe('2026-10-12T10:01:06Z')
    expect(normalizeCapturedAt('not a date')).toBe('not a date')
    expect(normalizeCapturedAt(undefined)).toBeUndefined()
  })
})
