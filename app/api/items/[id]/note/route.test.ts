import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ingestStructuredCaptures } from '@/lib/server/ingest'
import { listItems } from '@/lib/server/items'
import { resetResurfaceDatabaseForTests } from '@/lib/server/sqlite'
import { POST as webNotePost } from './route'
import { POST as v1NotePost } from '@/app/api/v1/items/[id]/note/route'
import { GET as webListGet } from '@/app/api/items/list/route'
import { GET as v1ListGet } from '@/app/api/v1/items/route'

let tmpDir: string

function contextFor(id: string) {
  return { params: Promise.resolve({ id }) }
}

function seedItem(title = 'Action note item') {
  ingestStructuredCaptures(
    [
      {
        text: `Content for ${title}`,
        url: `https://example.org/item-${Math.random().toString(36).slice(2)}`,
        title,
      },
    ],
    'test'
  )
  return listItems({ status: 'active', limit: 1 }).items[0]
}

describe('Personal Notes API routes — Web and v1', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-api-note-test-'))
    process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'resurface.db')
    resetResurfaceDatabaseForTests()
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it('updates personal note via web route /api/items/:id/note', async () => {
    const item = seedItem('Web API Note Test')

    // 1. Save valid note
    const saveReq = new NextRequest(
      `http://localhost:7824/api/items/${item.id}/note`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: 'Synthesised reaction to saved paper.\nLine 2 details.',
        }),
      }
    )
    const saveRes = await webNotePost(saveReq, contextFor(item.id))
    expect(saveRes.status).toBe(200)
    const saveBody = await saveRes.json()
    expect(saveBody.item.personalNote).toBe(
      'Synthesised reaction to saved paper.\nLine 2 details.'
    )
    expect(saveBody.item.title).toBe('Web API Note Test')

    // 2. Conflict handling with expectedCurrentNote
    const conflictReq = new NextRequest(
      `http://localhost:7824/api/items/${item.id}/note`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: 'Conflicting edit from another tab',
          expectedCurrentNote: 'Old non-matching text',
        }),
      }
    )
    const conflictRes = await webNotePost(conflictReq, contextFor(item.id))
    expect(conflictRes.status).toBe(409)
    const conflictBody = await conflictRes.json()
    expect(conflictBody.error).toContain('modified in another session')
    expect(conflictBody.currentNote).toBe(
      'Synthesised reaction to saved paper.\nLine 2 details.'
    )

    // 3. Validation failure (> 10k chars)
    const tooLongReq = new NextRequest(
      `http://localhost:7824/api/items/${item.id}/note`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: 'a'.repeat(10001),
        }),
      }
    )
    const tooLongRes = await webNotePost(tooLongReq, contextFor(item.id))
    expect(tooLongRes.status).toBe(400)
    const tooLongBody = await tooLongRes.json()
    expect(tooLongBody.error).toContain('10,000 characters')

    // 4. 404 for unknown ID
    const notFoundReq = new NextRequest(
      `http://localhost:7824/api/items/unknown-uuid-404/note`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Hello' }),
      }
    )
    const notFoundRes = await webNotePost(
      notFoundReq,
      contextFor('unknown-uuid-404')
    )
    expect(notFoundRes.status).toBe(404)
  })

  it('rejects malformed or missing note payloads without changing an existing note', async () => {
    const item = seedItem('Preserved note')
    const makeRequest = (body: string) => new NextRequest('http://localhost/api/items/test/note', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })
    await webNotePost(makeRequest(JSON.stringify({ note: 'Keep this' })), contextFor(item.id))
    for (const handler of [webNotePost, v1NotePost]) {
      for (const body of ['{', '{}', 'null', '[]', '{"note":"new","expectedCurrentNote":42}']) {
        const response = await handler(makeRequest(body), contextFor(item.id))
        expect(response.status).toBe(400)
        expect(listItems({ status: 'active' }).items.find(row => row.id === item.id)?.personalNote).toBe('Keep this')
      }
    }
  })

  it('updates personal note via v1 route /api/v1/items/:id/note with data envelope', async () => {
    const item = seedItem('v1 API Note Test')

    // Save note via v1 endpoint
    const saveReq = new NextRequest(
      `http://localhost:7824/api/v1/items/${item.id}/note`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: 'v1 note content',
        }),
      }
    )
    const saveRes = await v1NotePost(saveReq, contextFor(item.id))
    expect(saveRes.status).toBe(200)
    const saveBody = await saveRes.json()
    expect(saveBody.data.item.personalNote).toBe('v1 note content')

    // Conflict detection via v1
    const conflictReq = new NextRequest(
      `http://localhost:7824/api/v1/items/${item.id}/note`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: 'Conflicting edit',
          expectedCurrentNote: 'Different note',
        }),
      }
    )
    const conflictRes = await v1NotePost(conflictReq, contextFor(item.id))
    expect(conflictRes.status).toBe(409)
  })

  it('filters items by has_note on both web and v1 list endpoints', async () => {
    const itemWithNote = seedItem('Annotated Item')
    const _itemWithoutNote = seedItem('Unannotated Item')

    // Add note to itemWithNote
    await webNotePost(
      new NextRequest(
        `http://localhost:7824/api/items/${itemWithNote.id}/note`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Present note text' }),
        }
      ),
      contextFor(itemWithNote.id)
    )

    // Web endpoint GET /api/items/list?has_note=1
    const webListReq = new NextRequest(
      'http://localhost:7824/api/items/list?has_note=1'
    )
    const webListRes = await webListGet(webListReq)
    expect(webListRes.status).toBe(200)
    const webListBody = await webListRes.json()
    expect(webListBody.total).toBe(1)
    expect(webListBody.items.length).toBe(1)
    expect(webListBody.items[0].id).toBe(itemWithNote.id)
    expect(webListBody.items[0].personalNote).toBe('Present note text')

    // V1 endpoint GET /api/v1/items?has_note=1
    const v1ListReq = new NextRequest(
      'http://localhost:7824/api/v1/items?has_note=1'
    )
    const v1ListRes = await v1ListGet(v1ListReq)
    expect(v1ListRes.status).toBe(200)
    const v1ListBody = await v1ListRes.json()
    expect(v1ListBody.data.total).toBe(1)
    expect(v1ListBody.data.items[0].id).toBe(itemWithNote.id)
  })
})
