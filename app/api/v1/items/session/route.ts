import { NextRequest } from 'next/server'
import { apiData, apiError, errorMessage } from '@/lib/server/api'
import { getItemsForSession } from '@/lib/server/surface'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const count = Number(req.nextUrl.searchParams.get('count') ?? '10')
    const items = getItemsForSession(Number.isFinite(count) ? count : 10)
    return apiData({ items, count: items.length })
  } catch (error) {
    return apiError(errorMessage(error, 'Failed to fetch session items'), 500)
  }
}
