import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetResurfaceDatabaseForTests } from '@/lib/server/sqlite'
import { GET, POST } from './route'

let tmpDir: string

describe('/api/v1/items', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-v1-items-'))
    process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'resurface.db')
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('captures and lists items through the v1 envelope', async () => {
    const postResponse = await POST(
      new NextRequest('http://localhost:7790/api/v1/items', {
        method: 'POST',
        body: JSON.stringify({
          source: 'ios-test',
          items: [
            {
              text: 'Read this from iOS',
              url: 'https://example.com/ios',
              title: 'iOS capture',
            },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const postBody = await postResponse.json()
    expect(postResponse.status).toBe(200)
    expect(postBody.data.persisted).toBe(1)

    const getResponse = await GET(
      new NextRequest('http://localhost:7790/api/v1/items?status=active&limit=10')
    )
    const getBody = await getResponse.json()

    expect(getResponse.status).toBe(200)
    expect(getBody.data.total).toBe(1)
    expect(getBody.data.items[0]).toMatchObject({
      title: 'iOS capture',
      source: 'ios-test',
      url: 'https://example.com/ios',
      libraryPriority: 0,
      libraryShelf: null,
      pinnedAt: null,
    })
  })

  it('rejects malformed capture payloads', async () => {
    const response = await POST(
      new NextRequest('http://localhost:7790/api/v1/items', {
        method: 'POST',
        body: JSON.stringify({ item: { text: 'missing array' } }),
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Payload must include an items array')
  })
})
