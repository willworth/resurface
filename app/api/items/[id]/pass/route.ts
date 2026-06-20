// apps/resurface/app/api/items/[id]/pass/route.ts

import { NextResponse } from 'next/server'
import { passItem } from '@/lib/server/actions'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const item = passItem(params.id)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to pass item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
