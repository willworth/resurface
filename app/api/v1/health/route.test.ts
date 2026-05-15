import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ingestStructuredCaptures } from '@/lib/server/ingest'
import { resetResurfaceDatabaseForTests } from '@/lib/server/sqlite'
import { GET } from './route'

let tmpDir: string

describe('/api/v1/health', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-v1-health-'))
    process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'resurface.db')
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns a stable v1 health envelope with database counts', async () => {
    ingestStructuredCaptures(
      [{ text: 'https://example.com/health-check', url: 'https://example.com/health-check' }],
      'test'
    )

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.status).toBe('ok')
    expect(body.data.app).toBe('resurface')
    expect(body.data.apiVersion).toBe('v1')
    expect(body.data.database.totalItems).toBe(1)
    expect(body.data.database.counts.active).toBe(1)
  })
})
