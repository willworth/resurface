import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ingestStructuredCaptures } from '@/lib/server/ingest'
import { listItems } from '@/lib/server/items'
import { resetResurfaceDatabaseForTests } from '@/lib/server/sqlite'
import { POST as archivePost } from './archive/route'
import { POST as dropPost } from './drop/route'
import { POST as passPost } from './pass/route'
import { POST as pinPost } from './pin/route'
import { POST as snoozePost } from './snooze/route'

let tmpDir: string

function contextFor(id: string) {
  return { params: Promise.resolve({ id }) }
}

let seedIndex = 0

function seedItem() {
  seedIndex += 1
  ingestStructuredCaptures(
    [
      {
        text: `Action test ${seedIndex}`,
        url: `https://example.com/action-${seedIndex}`,
      },
    ],
    'test'
  )
  return listItems({ status: 'active' }).items.find((item) =>
    item.url?.endsWith(`action-${seedIndex}`)
  )!
}

describe('/api/v1/items/:id actions', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-v1-actions-'))
    process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'resurface.db')
  })

  afterEach(() => {
    resetResurfaceDatabaseForTests()
    delete process.env.RESURFACE_SQLITE_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('snoozes, passes, archives, and drops through stable envelopes', async () => {
    const snoozeItem = seedItem()
    const snoozeResponse = await snoozePost(
      new NextRequest(`http://localhost:7790/api/v1/items/${snoozeItem.id}/snooze`, {
        method: 'POST',
        body: JSON.stringify({ preset: 'tomorrow' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      contextFor(snoozeItem.id)
    )
    expect(snoozeResponse.status).toBe(200)
    expect((await snoozeResponse.json()).data.item.snoozeCount).toBe(1)

    const passableItem = seedItem()
    const passResponse = await passPost(
      new Request(`http://localhost:7790/api/v1/items/${passableItem.id}/pass`, {
        method: 'POST',
      }),
      contextFor(passableItem.id)
    )
    expect(passResponse.status).toBe(200)
    expect((await passResponse.json()).data.item.id).toBe(passableItem.id)

    const archiveItem = seedItem()
    const archiveResponse = await archivePost(
      new NextRequest(`http://localhost:7790/api/v1/items/${archiveItem.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({
          archivedTo: 'Reading / Longform',
          priority: 3,
          pinned: true,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      contextFor(archiveItem.id)
    )
    expect(archiveResponse.status).toBe(200)
    const archiveBody = await archiveResponse.json()
    expect(archiveBody.data.item).toMatchObject({
      archivedTo: 'Reading / Longform',
      libraryShelf: 'reading-longform',
      libraryPriority: 3,
      status: 'archived',
    })
    expect(archiveBody.data.item.pinnedAt).toBeTruthy()

    const archivedList = listItems({
      status: 'archived',
      shelf: 'reading-longform',
      sort: 'library_priority',
    })
    expect(archivedList.total).toBe(1)
    expect(archivedList.items[0].id).toBe(archiveItem.id)

    const starItem = seedItem()
    const starResponse = await pinPost(
      new NextRequest(`http://localhost:7790/api/v1/items/${starItem.id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pinned: true }),
        headers: { 'Content-Type': 'application/json' },
      }),
      contextFor(starItem.id)
    )
    expect(starResponse.status).toBe(200)
    const starBody = await starResponse.json()
    expect(starBody.data.item.pinnedAt).toBeTruthy()
    expect(starBody.data.item.libraryPriority).toBe(5)

    const starredList = listItems({
      status: 'all',
      pinned: true,
      sort: 'pinned_at',
    })
    expect(starredList.items.some((item) => item.id === starItem.id)).toBe(true)

    const dropItem = seedItem()
    const dropResponse = await dropPost(
      new Request(`http://localhost:7790/api/v1/items/${dropItem.id}/drop`, {
        method: 'POST',
      }),
      contextFor(dropItem.id)
    )
    expect(dropResponse.status).toBe(200)
    expect((await dropResponse.json()).data.item.status).toBe('dropped')
  })
})
