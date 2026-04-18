// apps/resurface/lib/server/types.ts


export type ResurfaceStatus = 'active' | 'snoozed' | 'archived' | 'dropped'

export type ResurfaceCategory =
  | 'link'
  | 'quote'
  | 'music'
  | 'tool'
  | 'article'
  | 'idea'
  | 'reference'

export type ResurfaceItem = {
  id: string
  url: string | null
  title: string
  summary: string | null
  previewSiteName: string | null
  previewDescription: string | null
  previewImageUrl: string | null
  previewFetchedAt: string | null
  originalText: string
  category: ResurfaceCategory
  suggestedArchive: string | null
  tags: string[]
  source: string
  sourceItemId: string | null
  capturedAt: string
  ingestedAt: string
  lastSurfacedAt: string | null
  surfaceCount: number
  status: ResurfaceStatus
  suppressUntil: string | null
  archivedAt: string | null
  archivedTo: string | null
  droppedAt: string | null
  fingerprint: string
  snoozeCount: number
}
