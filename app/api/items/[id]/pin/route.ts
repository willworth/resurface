import { NextRequest, NextResponse } from 'next/server'
import { pinItem } from '@/lib/server/actions'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      pinned?: boolean
    }
    const params = await context.params
    const item = pinItem(params.id, Boolean(body.pinned))

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update star'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
