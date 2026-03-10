// apps/resurface/app/api/ingest/extension/route.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { NextRequest } from 'next/server'

import { resetResurfaceDatabaseForTests } from '@/lib/server/sqlite'
import { POST } from './route'

describe('POST /api/ingest/extension', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'resurface-extension-route-')
    )
    resetResurfaceDatabaseForTests()
    process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'resurface-test.db')
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 400 when url is missing', async () => {
    const req = new NextRequest('http://localhost:7790/api/ingest/extension', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'No URL' }),
    })

    const response = await POST(req)
    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe('url is required')
  })

  it('creates and deduplicates captures', async () => {
    const payload = {
      url: 'https://github.com/vercel/next.js',
      title: 'Next.js repo',
      selectedText: 'React framework',
      content: 'App Router reference',
      metaDescription: 'The React Framework for the Web',
      ogImage: 'https://nextjs.org/og.png',
    }

    const req1 = new NextRequest('http://localhost:7790/api/ingest/extension', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const response1 = await POST(req1)
    const body1 = (await response1.json()) as {
      status?: string
      category?: string
      id?: string
    }

    expect(response1.status).toBe(201)
    expect(body1.status).toBe('created')
    expect(body1.category).toBe('tool')
    expect(typeof body1.id).toBe('string')

    const req2 = new NextRequest('http://localhost:7790/api/ingest/extension', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const response2 = await POST(req2)
    const body2 = (await response2.json()) as {
      status?: string
      id?: string
    }

    expect(response2.status).toBe(200)
    expect(body2.status).toBe('duplicate')
    expect(body2.id).toBe(body1.id)
  })
})
