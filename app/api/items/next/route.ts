// apps/resurface/app/api/items/next/route.ts


import { NextRequest, NextResponse } from 'next/server'
import { enrichItem } from '@/lib/server/enrich'
import { getNextItemToSurface } from '@/lib/server/surface'

export const runtime = 'nodejs'

function parseExcludeIds(req: NextRequest): string[] {
  return req.nextUrl.searchParams
    .getAll('exclude')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

export async function GET(req: NextRequest) {
  try {
    const result = getNextItemToSurface(parseExcludeIds(req))
    if (result.item) {
      const item = await enrichItem(result.item.id)
      return NextResponse.json({ ...result, item: item ?? result.item })
    }
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch next item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
