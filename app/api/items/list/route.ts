// apps/resurface/app/api/items/list/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { listItems } from '@/lib/server/items'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    return NextResponse.json(
      listItems({
        status: params.get('status'),
        sort: params.get('sort'),
        dir: params.get('dir'),
        search: params.get('q'),
        limit: Number(params.get('limit') ?? '50'),
        page: Number(params.get('page') ?? '1'),
      })
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to list items'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
