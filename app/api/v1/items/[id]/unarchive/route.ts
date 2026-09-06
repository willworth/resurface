import { apiData, apiError, errorMessage } from '@/lib/server/api'
import { unarchiveItem } from '@/lib/server/actions'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const item = unarchiveItem(params.id)

    if (!item) {
      return apiError('Item not found', 404)
    }

    return apiData({ item })
  } catch (error) {
    return apiError(errorMessage(error, 'Failed to unarchive item'), 500)
  }
}
