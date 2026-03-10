// apps/resurface/app/api/items/[id]/archive/route.ts

// packages/apps/resurface/app/api/items/[id]/archive/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { archiveItem } from '@/lib/server/actions'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = (await req.json().catch(() => ({}))) as { archivedTo?: string }
    const params = await context.params
    const item = archiveItem(params.id, body.archivedTo ?? null)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to archive item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
