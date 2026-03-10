// apps/resurface/app/api/items/[id]/snooze/route.ts

// packages/apps/resurface/app/api/items/[id]/snooze/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { snoozeItem } from '@/lib/server/actions'
import { SnoozePreset } from '@/lib/server/snooze'

export const runtime = 'nodejs'

const ALLOWED_PRESETS: SnoozePreset[] = [
  'tomorrow',
  'this-weekend',
  'next-week',
  'in-a-month',
  'surprise',
]

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      preset?: SnoozePreset
    }
    const preset = body.preset

    if (!preset || !ALLOWED_PRESETS.includes(preset)) {
      return NextResponse.json(
        { error: 'Invalid snooze preset' },
        { status: 400 }
      )
    }

    const params = await context.params
    const item = snoozeItem(params.id, preset)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to snooze item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
