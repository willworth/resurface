// apps/resurface/app/api/enrich/route.ts


import { NextRequest, NextResponse } from 'next/server'
import { enrichItem } from '@/lib/server/enrich'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string }

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const item = enrichItem(body.id)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to enrich item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
