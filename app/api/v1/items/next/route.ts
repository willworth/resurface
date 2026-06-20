import { NextRequest } from 'next/server'
import { apiData, apiError, errorMessage } from '@/lib/server/api'
import { enrichItem } from '@/lib/server/enrich'
import { getNextItemToSurface } from '@/lib/server/surface'

export const runtime = 'nodejs'

function parseExcludeIds(req: NextRequest): string[] {
  return req.nextUrl.searchParams
    .getAll('exclude')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

export async function GET(req: NextRequest) {
  try {
    const result = getNextItemToSurface(parseExcludeIds(req))
    if (result.item) {
      const item = await enrichItem(result.item.id)
      return apiData({ ...result, item: item ?? result.item })
    }
    return apiData(result)
  } catch (error) {
    return apiError(errorMessage(error, 'Failed to fetch next item'), 500)
  }
}
