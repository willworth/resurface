import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dbDir = path.join(process.cwd(), '.resurface')
fs.mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'preview.db')

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath)
}

const db = new DatabaseSync(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS resurface_items (
    id TEXT PRIMARY KEY,
    url TEXT,
    title TEXT NOT NULL,
    summary TEXT,
    preview_site_name TEXT,
    preview_description TEXT,
    preview_image_url TEXT,
    preview_fetched_at TEXT,
    original_text TEXT NOT NULL,
    category TEXT NOT NULL,
    suggested_archive TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL,
    source_item_id TEXT,
    captured_at TEXT NOT NULL,
    ingested_at TEXT NOT NULL,
    last_surfaced_at TEXT,
    surface_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    suppress_until TEXT,
    archived_at TEXT,
    archived_to TEXT,
    library_shelf TEXT,
    library_priority INTEGER NOT NULL DEFAULT 0,
    pinned_at TEXT,
    dropped_at TEXT,
    fingerprint TEXT NOT NULL,
    snooze_count INTEGER NOT NULL DEFAULT 0,
    pre_discard_state_json TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_resurface_items_fingerprint
    ON resurface_items(fingerprint);

  CREATE INDEX IF NOT EXISTS idx_resurface_items_status
    ON resurface_items(status);

  CREATE INDEX IF NOT EXISTS idx_resurface_items_source_item
    ON resurface_items(source_item_id);

  CREATE TABLE IF NOT EXISTS resurface_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );
`)

const items = [
  {
    id: 'preview-active-1',
    title: 'Modern CSS Layouts & Container Queries',
    original_text: 'A deep guide into CSS container queries and responsive component architecture.',
    url: 'https://example.com/modern-css',
    category: 'article',
    source: 'web-ui',
    status: 'active',
    suppress_until: null,
    archived_at: null,
    archived_to: null,
    dropped_at: null,
    pre_discard_state_json: null,
  },
  {
    id: 'preview-active-2',
    title: 'TypeScript 5.8 Release Overview',
    original_text: 'Checking out the latest type inference performance updates.',
    url: 'https://example.com/ts-58',
    category: 'tool',
    source: 'web-ui',
    status: 'active',
    suppress_until: null,
    archived_at: null,
    archived_to: null,
    dropped_at: null,
    pre_discard_state_json: null,
  },
  {
    id: 'preview-snoozed-1',
    title: 'Weekend Music Production Tips',
    original_text: 'Synthesizer patch programming and drum layering techniques.',
    url: 'https://example.com/synth-patch',
    category: 'music',
    source: 'web-ui',
    status: 'active',
    suppress_until: new Date(Date.now() + 86400000 * 3).toISOString(),
    archived_at: null,
    archived_to: null,
    dropped_at: null,
    pre_discard_state_json: null,
  },
  {
    id: 'preview-archived-1',
    title: 'Anthropic Agentic Coding Patterns',
    original_text: 'Research notes on multi-agent collaboration patterns.',
    url: 'https://example.com/agents',
    category: 'reference',
    source: 'web-ui',
    status: 'archived',
    suppress_until: null,
    archived_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    archived_to: 'AI Research',
    dropped_at: null,
    pre_discard_state_json: null,
  },
  {
    id: 'preview-dropped-1',
    title: 'A Random Discarded Link',
    original_text: 'Something that was discarded earlier and sits in the bin.',
    url: 'https://example.com/old-link',
    category: 'link',
    source: 'web-ui',
    status: 'dropped',
    suppress_until: null,
    archived_at: null,
    archived_to: null,
    dropped_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    pre_discard_state_json: JSON.stringify({ status: 'active' }),
  },
  {
    id: 'preview-legacy-dropped',
    title: 'Legacy Dropped Item (No Pre-State)',
    original_text: 'An item dropped months ago before recovery metadata was stored.',
    url: 'https://example.com/legacy-dropped',
    category: 'idea',
    source: 'web-ui',
    status: 'dropped',
    suppress_until: null,
    archived_at: null,
    archived_to: null,
    dropped_at: new Date(Date.now() - 86400000 * 60).toISOString(),
    pre_discard_state_json: null,
  },
]

const insertStmt = db.prepare(`
  INSERT INTO resurface_items (
    id, title, original_text, url, category, source, status,
    suppress_until, archived_at, archived_to, dropped_at,
    pre_discard_state_json, captured_at, ingested_at, fingerprint
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?
  )
`)

for (const item of items) {
  insertStmt.run(
    item.id,
    item.title,
    item.original_text,
    item.url,
    item.category,
    item.source,
    item.status,
    item.suppress_until,
    item.archived_at,
    item.archived_to,
    item.dropped_at,
    item.pre_discard_state_json,
    new Date().toISOString(),
    new Date().toISOString(),
    `fp-${item.id}`
  )
}

db.close()
console.log(`Successfully seeded ${items.length} preview items into ${dbPath}`)
