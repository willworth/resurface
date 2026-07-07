import { NextRequest } from 'next/server'
import { apiData, apiError, errorMessage } from '@/lib/server/api'
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
      return apiError('Item not found', 404)
    }

    return apiData({ item })
  } catch (error) {
    return apiError(errorMessage(error, 'Failed to update star'), 500)
  }
}
