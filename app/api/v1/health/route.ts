import { apiData, apiError, errorMessage } from '@/lib/server/api'
import { getStatusCounts } from '@/lib/server/items'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const counts = getStatusCounts()
    const totalItems = Object.values(counts).reduce((sum, count) => sum + count, 0)

    return apiData({
      app: 'resurface',
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        totalItems,
        counts,
      },
      apiVersion: 'v1',
    })
  } catch (error) {
    return apiError(errorMessage(error, 'Health check failed'), 500)
  }
}
