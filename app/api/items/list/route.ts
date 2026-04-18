// apps/resurface/app/api/items/list/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getResurfaceDatabase } from '@/lib/server/sqlite'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const status = params.get('status') ?? 'active'
    const sort = params.get('sort') ?? 'captured_at'
    const dir = params.get('dir') === 'asc' ? 'ASC' : 'DESC'
    const search = params.get('q')?.trim() ?? null
    const limit = Math.min(Number(params.get('limit') ?? '50'), 200)
    const page = Math.max(1, Number(params.get('page') ?? '1'))
    const offset = (page - 1) * limit

    const db = getResurfaceDatabase()

    const validSorts: Record<string, string> = {
      captured_at: 'captured_at',
      title: 'title',
      category: 'category',
      snooze_count: 'snooze_count',
      last_surfaced_at: 'last_surfaced_at',
      source: 'source',
      random: 'RANDOM()',
    }
    const orderCol = validSorts[sort] ?? 'captured_at'
    const orderClause =
      sort === 'random' ? 'RANDOM()' : `${orderCol} ${dir}`

    let rows: Record<string, unknown>[]
    let totalForStatus: number

    if (search) {
      const like = `%${search}%`
      rows = db
        .prepare(
          `SELECT * FROM resurface_items WHERE status = ?
           AND (title LIKE ? OR url LIKE ? OR original_text LIKE ?)
           ORDER BY ${orderClause} LIMIT ? OFFSET ?`
        )
        .all(status, like, like, like, limit, offset) as Record<
        string,
        unknown
      >[]
      totalForStatus = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM resurface_items WHERE status = ?
             AND (title LIKE ? OR url LIKE ? OR original_text LIKE ?)`
          )
          .get(status, like, like, like) as { c: number }
      ).c
    } else {
      rows = db
        .prepare(
          `SELECT * FROM resurface_items WHERE status = ?
           ORDER BY ${orderClause} LIMIT ? OFFSET ?`
        )
        .all(status, limit, offset) as Record<string, unknown>[]
      totalForStatus = (
        db
          .prepare(`SELECT COUNT(*) as c FROM resurface_items WHERE status = ?`)
          .get(status) as { c: number }
      ).c
    }

    // Get counts by status
    const counts = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM resurface_items GROUP BY status`
      )
      .all() as Array<{ status: string; count: number }>

    const items = rows.map((row) => ({
      id: row.id,
      url: row.url,
      title: row.title,
      summary: row.summary,
      previewSiteName: row.preview_site_name,
      previewDescription: row.preview_description,
      previewImageUrl: row.preview_image_url,
      previewFetchedAt: row.preview_fetched_at,
      originalText: row.original_text,
      category: row.category,
      source: row.source,
      status: row.status,
      capturedAt: row.captured_at,
      lastSurfacedAt: row.last_surfaced_at,
      snoozeCount: row.snooze_count,
      suppressUntil: row.suppress_until,
      suggestedArchive: row.suggested_archive,
      archivedTo: row.archived_to,
      tags: row.tags ? JSON.parse(row.tags as string) : [],
    }))

    const totalPages = Math.ceil(totalForStatus / limit)

    return NextResponse.json({
      items,
      total: totalForStatus,
      page,
      totalPages,
      pageSize: limit,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.count])),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to list items'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
