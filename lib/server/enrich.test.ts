// apps/resurface/lib/server/enrich.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enrichItem } from './enrich'
import { getResurfaceDatabase, resetResurfaceDatabaseForTests } from './sqlite'

let tmpDir: string

function setupTestDb() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-enrich-'))
  process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'resurface.db')
  resetResurfaceDatabaseForTests()
}

function insertGenericYouTubeItem() {
  const db = getResurfaceDatabase()
  db.prepare(
    `
    INSERT INTO resurface_items (
      id, url, title, original_text, category, tags_json, source, captured_at,
      ingested_at, status, fingerprint, snooze_count
    ) VALUES (?, ?, ?, ?, 'music', '["youtube.com"]', 'ios-test', ?, ?, 'active', ?, 0)
  `
  ).run(
    'yt-1',
    'https://www.youtube.com/watch?v=abc123',
    'youtube.com',
    'https://www.youtube.com/watch?v=abc123',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    'fp-yt-1'
  )
}

describe('enrichItem metadata repair', () => {
  beforeEach(() => {
    setupTestDb()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('replaces generic YouTube titles with fetched video titles', async () => {
    insertGenericYouTubeItem()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          `
          <!doctype html>
          <html>
            <head>
              <meta property="og:title" content="Golang tutorial for patient people - YouTube" />
              <meta property="og:site_name" content="YouTube" />
              <meta property="og:description" content="A practical Go walkthrough." />
              <meta property="og:image" content="https://i.ytimg.com/vi/abc123/hqdefault.jpg" />
            </head>
          </html>
          `,
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        )
      })
    )

    const item = await enrichItem('yt-1')

    expect(item?.title).toBe('Golang tutorial for patient people')
    expect(item?.previewSiteName).toBe('YouTube')
    expect(item?.previewDescription).toBe('A practical Go walkthrough.')
    expect(item?.previewImageUrl).toBe(
      'https://i.ytimg.com/vi/abc123/hqdefault.jpg'
    )
  })
})
