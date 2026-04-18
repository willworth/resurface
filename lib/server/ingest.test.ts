// apps/resurface/lib/server/ingest.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getResurfaceDatabase, resetResurfaceDatabaseForTests } from './sqlite'
import {
  ingestExtensionCapture,
  ingestStructuredCaptures,
  ingestTwitterBookmarks,
} from './ingest'

describe('ingestExtensionCapture', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-ingest-'))
    resetResurfaceDatabaseForTests()
    process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'resurface-test.db')
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('classifies extension captures and stores browser-extension source', () => {
    const result = ingestExtensionCapture({
      url: 'https://youtu.be/abc123',
      title: 'Great live set',
      selectedText: 'This drop is wild',
      content: 'Full transcript of the page',
      metaDescription: 'Live mix recording',
      ogImage: 'https://cdn.example.com/cover.jpg',
    })

    expect(result.status).toBe('created')
    expect(result.category).toBe('music')

    const db = getResurfaceDatabase()
    const row = db
      .prepare(
        'SELECT source, category, title, summary, original_text, preview_site_name, preview_description, preview_image_url, preview_fetched_at FROM resurface_items WHERE id = ? LIMIT 1'
      )
      .get(result.id) as
      | {
          source?: string
          category?: string
          title?: string
          summary?: string | null
          original_text?: string
          preview_site_name?: string | null
          preview_description?: string | null
          preview_image_url?: string | null
          preview_fetched_at?: string | null
        }
      | undefined

    expect(row?.source).toBe('browser-extension')
    expect(row?.category).toBe('music')
    expect(row?.title).toBe('Great live set')
    expect(row?.summary).toBe('Live mix recording')
    expect(row?.preview_site_name).toBe('youtu.be')
    expect(row?.preview_description).toBe('Live mix recording')
    expect(row?.preview_image_url).toBe('https://cdn.example.com/cover.jpg')
    expect(row?.preview_fetched_at).toBeTruthy()
    expect(row?.original_text).toContain(
      'OG image: https://cdn.example.com/cover.jpg'
    )
  })

  it('returns duplicate for repeated URL captures', () => {
    const first = ingestExtensionCapture({
      url: 'https://example.com/articles/fingerprint',
      title: 'First copy',
      content: 'First body',
    })

    const second = ingestExtensionCapture({
      url: 'https://example.com/articles/fingerprint?utm_source=test',
      title: 'Second copy',
      content: 'Second body',
    })

    expect(first.status).toBe('created')
    expect(second.status).toBe('duplicate')

    const db = getResurfaceDatabase()
    const row = db
      .prepare('SELECT COUNT(*) AS count FROM resurface_items')
      .get() as { count?: number } | undefined

    expect(row?.count).toBe(1)
  })

  it('throws when url is missing', () => {
    expect(() =>
      ingestExtensionCapture({
        url: '',
        title: 'Missing URL',
      })
    ).toThrow('url is required')
  })

  it('ingests structured captures with batch-level source defaulting', () => {
    const result = ingestStructuredCaptures(
      [
        {
          sourceItemId: 'note-1',
          text: 'Interesting post https://example.com/hello',
          tags: ['research'],
        },
      ],
      'obsidian-json'
    )

    expect(result.persisted).toBe(1)
    expect(result.invalid).toBe(0)

    const db = getResurfaceDatabase()
    const row = db
      .prepare('SELECT source, source_item_id FROM resurface_items LIMIT 1')
      .get() as { source: string; source_item_id: string }

    expect(row.source).toBe('obsidian-json')
    expect(row.source_item_id).toBe('note-1')
  })

  it('deduplicates structured captures by fingerprint', () => {
    const first = ingestStructuredCaptures([
      {
        source: 'obsidian-json',
        sourceItemId: 'note-1',
        text: 'Interesting post https://example.com/hello',
      },
    ])

    const second = ingestStructuredCaptures([
      {
        source: 'obsidian-json',
        sourceItemId: 'note-2',
        text: 'Interesting post https://example.com/hello?utm_source=test',
      },
    ])

    expect(first.persisted).toBe(1)
    expect(second.duplicates).toBe(1)
  })

  it('accepts twitter bookmark payload shape', () => {
    const result = ingestTwitterBookmarks([
      {
        tweetId: '1234567890',
        text: 'Great thread on AI agents',
        authorHandle: '@willworth',
      },
    ])

    expect(result.persisted).toBe(1)

    const db = getResurfaceDatabase()
    const row = db
      .prepare('SELECT source, url FROM resurface_items LIMIT 1')
      .get() as { source: string; url: string }

    expect(row.source).toBe('twitter-bookmarks')
    expect(row.url).toContain('1234567890')
  })
})
