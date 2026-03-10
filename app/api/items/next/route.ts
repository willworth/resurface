// apps/resurface/app/api/items/next/route.ts

// packages/apps/resurface/app/api/items/next/route.ts

import { NextResponse } from 'next/server'
import { getNextItemToSurface } from '@/lib/server/surface'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const result = getNextItemToSurface()
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch next item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
