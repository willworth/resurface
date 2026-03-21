// apps/resurface/app/api/ingest/twitter-bookmarks/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  ingestTwitterBookmarks,
  type TwitterBookmarkInput,
} from '@/lib/server/ingest'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      bookmarks?: TwitterBookmarkInput[]
    }

    if (!Array.isArray(body.bookmarks)) {
      return NextResponse.json(
        { error: 'Payload must include a bookmarks array' },
        { status: 400 }
      )
    }

    const result = ingestTwitterBookmarks(body.bookmarks)
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to ingest Twitter bookmarks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
