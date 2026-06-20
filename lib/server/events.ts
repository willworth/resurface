// apps/resurface/lib/server/events.ts

import { randomUUID } from 'node:crypto'
import { getResurfaceDatabase } from './sqlite'

export type ResurfaceEventType =
  | 'ingested'
  | 'surfaced'
  | 'passed'
  | 'archived'
  | 'snoozed'
  | 'dropped'

export function logResurfaceEvent(
  eventType: ResurfaceEventType,
  itemId: string,
  metadata: Record<string, unknown> = {}
): void {
  const db = getResurfaceDatabase()
  db.prepare(
    `
    INSERT INTO resurface_events (
      id,
      event_type,
      item_id,
      created_at,
      metadata_json
    )
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(
    randomUUID(),
    eventType,
    itemId,
    new Date().toISOString(),
    JSON.stringify(metadata)
  )
}
