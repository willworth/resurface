// apps/resurface/app/api/ingest/json/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  ingestStructuredCaptures,
  type NormalizedCaptureInput,
} from '@/lib/server/ingest'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      items?: NormalizedCaptureInput[]
      source?: string
    }

    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { error: 'Payload must include an items array' },
        { status: 400 }
      )
    }

    const result = ingestStructuredCaptures(
      body.items,
      body.source ?? 'structured-json'
    )

    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to ingest JSON captures'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
