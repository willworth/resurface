import { NextRequest, NextResponse } from 'next/server'
import { updateItemNote } from '@/lib/server/actions'

export const runtime = 'nodejs'

async function handleUpdate(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const body = (await req.json().catch(() => null)) as {
      note?: unknown
      expectedCurrentNote?: unknown
    }

    if (
      !body || typeof body !== 'object' || Array.isArray(body) ||
      !Object.prototype.hasOwnProperty.call(body, 'note') ||
      (body.note !== null && typeof body.note !== 'string') ||
      (body.expectedCurrentNote !== undefined && body.expectedCurrentNote !== null &&
        typeof body.expectedCurrentNote !== 'string')
    ) {
      return NextResponse.json(
        { error: 'Provide note as a string or null, and expectedCurrentNote as a string or null if supplied' },
        { status: 400 }
      )
    }

    const expectedCurrentNote =
      typeof body.expectedCurrentNote === 'string' ||
      body.expectedCurrentNote === null
        ? body.expectedCurrentNote
        : undefined

    const result = updateItemNote(params.id, body.note, expectedCurrentNote)

    if (result.ok) {
      return NextResponse.json({ item: result.item })
    }

    if (result.reason === 'item-not-found') {
      return NextResponse.json({ error: result.message }, { status: 404 })
    }

    if (result.reason === 'conflict') {
      return NextResponse.json(
        { error: result.message, currentNote: result.currentNote },
        { status: 409 }
      )
    }

    return NextResponse.json({ error: result.message }, { status: 400 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update note'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, context)
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, context)
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, context)
}
