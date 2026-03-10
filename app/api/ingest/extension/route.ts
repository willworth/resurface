// apps/resurface/app/api/ingest/extension/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { ingestExtensionCapture } from '@/lib/server/ingest'
import type { ExtensionCapturePayload } from '@/lib/server/ingest'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = body as ExtensionCapturePayload
    if (typeof payload.url !== 'string' || payload.url.trim().length === 0) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    const result = ingestExtensionCapture(payload)
    return NextResponse.json(result, {
      status: result.status === 'created' ? 201 : 200,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to ingest extension item'

    const status = message === 'url is required' ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
