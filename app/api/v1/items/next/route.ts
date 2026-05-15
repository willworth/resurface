import { apiData, apiError, errorMessage } from '@/lib/server/api'
import { getNextItemToSurface } from '@/lib/server/surface'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return apiData(getNextItemToSurface())
  } catch (error) {
    return apiError(errorMessage(error, 'Failed to fetch next item'), 500)
  }
}
