import { NextRequest } from 'next/server'
import { apiData, apiError, errorMessage } from '@/lib/server/api'
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
      return apiError('Invalid snooze preset', 400)
    }

    const params = await context.params
    const result = snoozeItem(params.id, preset)

    if (!result.ok) {
      if (result.reason === 'force-decision-required') {
        return apiError('Force decision required', 409)
      }
      return apiError('Item not found', 404)
    }

    return apiData({ item: result.item })
  } catch (error) {
    return apiError(errorMessage(error, 'Failed to snooze item'), 500)
  }
}
