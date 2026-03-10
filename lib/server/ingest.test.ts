// apps/resurface/lib/server/ingest.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getResurfaceDatabase, resetResurfaceDatabaseForTests } from './sqlite'
import { ingestExtensionCapture } from './ingest'

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
        'SELECT source, category, title, summary, original_text FROM resurface_items WHERE id = ? LIMIT 1'
      )
      .get(result.id) as
      | {
          source?: string
          category?: string
          title?: string
          summary?: string | null
          original_text?: string
        }
      | undefined

    expect(row?.source).toBe('browser-extension')
    expect(row?.category).toBe('music')
    expect(row?.title).toBe('Great live set')
    expect(row?.summary).toBe('Live mix recording')
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
})
