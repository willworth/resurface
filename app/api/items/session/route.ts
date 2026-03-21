// apps/resurface/app/api/items/session/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getItemsForSession } from '@/lib/server/surface'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const count = Number(req.nextUrl.searchParams.get('count') ?? '10')
    const items = getItemsForSession(Number.isFinite(count) ? count : 10)
    return NextResponse.json({ items, count: items.length })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch session items'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
