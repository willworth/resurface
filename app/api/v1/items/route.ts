import { NextRequest } from 'next/server'
import { apiData, apiError, errorMessage } from '@/lib/server/api'
import {
  ingestStructuredCaptures,
  type NormalizedCaptureInput,
} from '@/lib/server/ingest'
import { listItems } from '@/lib/server/items'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    return apiData(
      listItems({
        status: params.get('status'),
        sort: params.get('sort'),
        dir: params.get('dir'),
        search: params.get('q'),
        limit: Number(params.get('limit') ?? '50'),
        page: Number(params.get('page') ?? '1'),
      })
    )
  } catch (error) {
    return apiError(errorMessage(error, 'Failed to list items'), 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      items?: NormalizedCaptureInput[]
      source?: string
    }

    if (!Array.isArray(body.items)) {
      return apiError('Payload must include an items array', 400)
    }

    return apiData(
      ingestStructuredCaptures(body.items, body.source ?? 'api-v1')
    )
  } catch (error) {
    return apiError(errorMessage(error, 'Failed to ingest items'), 500)
  }
}
