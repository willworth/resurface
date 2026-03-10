// apps/resurface/app/api/ingest/todoist/route.ts

// packages/apps/resurface/app/api/ingest/todoist/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { ingestTodoistInbox } from '@/lib/server/ingest'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      maxItems?: number
      dryRun?: boolean
    }
    const maxItems = typeof body.maxItems === 'number' ? body.maxItems : 50
    const dryRun = body.dryRun === true

    const result = await ingestTodoistInbox(maxItems, { dryRun })
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to ingest Todoist inbox'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
