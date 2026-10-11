#!/usr/bin/env node
// apps/resurface/cli.mjs

// packages/apps/resurface/cli.mjs

//
// Standalone CLI for adding items to the Resurface database.
// No build step required — uses node:sqlite (Node 24+) directly.
//
// Usage:
//   node cli.mjs add "https://example.com/article"
//   node cli.mjs add "Check out Sanderson lectures" --category reference
//   node cli.mjs add "https://youtu.be/xyz" --category music --title "Cool song"
//   node cli.mjs stats
//   node cli.mjs list [--status active|snoozed|archived|dropped] [--limit 20]

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS resurface_items (
    id TEXT PRIMARY KEY,
    url TEXT,
    title TEXT NOT NULL,
    summary TEXT,
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
    dropped_at TEXT,
    fingerprint TEXT NOT NULL,
    snooze_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_resurface_items_fingerprint
    ON resurface_items(fingerprint);
  CREATE INDEX IF NOT EXISTS idx_resurface_items_status
    ON resurface_items(status);
  CREATE INDEX IF NOT EXISTS idx_resurface_items_source_item
    ON resurface_items(source_item_id);
`

function resolveDbPath() {
  const fromEnv = process.env.RESURFACE_SQLITE_PATH
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim()

  // When run from the resurface package directory
  const local = path.join(process.cwd(), '.resurface', 'resurface.db')
  if (fs.existsSync(path.dirname(local))) return local

  // Fallback: resolve relative to this script
  const scriptDir = path.dirname(new URL(import.meta.url).pathname)
  return path.join(scriptDir, '.resurface', 'resurface.db')
}

function openDb(readOnly = false) {
  const dbPath = resolveDbPath()
  if (!readOnly) fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath, { readOnly })
  if (!readOnly) db.exec(SCHEMA)
  return { db, dbPath }
}

// ---------------------------------------------------------------------------
// Classification (mirrors lib/server/classify.ts)
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s)\]]+/i
const VALID_CATEGORIES = [
  'link',
  'quote',
  'music',
  'tool',
  'article',
  'idea',
  'reference',
]

function extractUrl(text) {
  const m = text.match(URL_RE)
  return m ? m[0] : null
}

function normalizeUrl(raw) {
  try {
    const u = new URL(raw.trim())
    u.hash = ''
    for (const p of [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
    ])
      u.searchParams.delete(p)
    u.pathname = u.pathname.replace(/\/$/, '')
    return u.toString()
  } catch {
    return raw.trim().toLowerCase()
  }
}

function buildFingerprint(url, text) {
  const material = url ? normalizeUrl(url) : text.replace(URL_RE, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return crypto.createHash('sha256').update(material).digest('hex')
}

function deriveCategory(text, url) {
  const n = text.toLowerCase()

  if (n.includes('\u201c') || n.includes('\u201d') || n.includes('"')) {
    return 'quote'
  }
  if (url) {
    const u = url.toLowerCase()
    if (
      u.includes('youtube.com') ||
      u.includes('youtu.be') ||
      u.includes('spotify.com') ||
      u.includes('bandcamp.com')
    )
      return 'music'
    if (
      u.includes('github.com') ||
      u.includes('npmjs.com') ||
      u.includes('producthunt.com')
    )
      return 'tool'
    if (
      u.includes('medium.com') ||
      u.includes('substack.com') ||
      u.includes('/article') ||
      u.includes('/blog')
    )
      return 'article'
    return 'link'
  }
  if (n.includes('idea')) return 'idea'
  return 'reference'
}

function deriveTitle(text, url) {
  const stripped = text.replace(URL_RE, '').trim()
  if (stripped.length > 0) return stripped.slice(0, 160)
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  }
  return 'Untitled capture'
}

function deriveTags(text, url) {
  const tags = new Set()
  const n = text.toLowerCase()
  if (n.includes('ai')) tags.add('ai')
  if (n.includes('agent')) tags.add('agents')
  if (n.includes('music')) tags.add('music')
  if (n.includes('design')) tags.add('design')
  if (n.includes('product')) tags.add('product')
  if (url) {
    try {
      tags.add(new URL(url).hostname.replace(/^www\./, ''))
    } catch {
      /* skip */
    }
  }
  return [...tags]
}

const ARCHIVE_MAP = {
  music: 'Music / References',
  tool: 'Dev Tools / AI Agents',
  quote: 'Quotes / Personal',
  idea: 'Ideas / Seeds',
  article: 'Reading / Articles',
  reference: 'Reference / General',
  link: 'Links / General',
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdAdd(positionals, values) {
  const text = positionals.join(' ').trim()
  if (!text) {
    console.error('Usage: resurface add <text or URL> [--category <cat>] [--title <title>]')
    process.exit(1)
  }

  const url = extractUrl(text)
  const categoryArg = values.category?.toLowerCase()
  const category =
    categoryArg && VALID_CATEGORIES.includes(categoryArg)
      ? categoryArg
      : deriveCategory(text, url)
  const title = values.title || deriveTitle(text, url)
  const fingerprint = buildFingerprint(url, text)
  const nowIso = new Date().toISOString()
  const tags = deriveTags(text, url)

  const { db, dbPath } = openDb()

  // Check for duplicates
  const existing = db
    .prepare('SELECT id FROM resurface_items WHERE fingerprint = ? LIMIT 1')
    .get(fingerprint)
  if (existing) {
    console.log(`⚠ Duplicate — already exists (fingerprint match)`)
    console.log(`  DB: ${dbPath}`)
    process.exit(0)
  }

  const id = crypto.randomUUID()
  db.prepare(
    `INSERT INTO resurface_items (
      id, url, title, summary, original_text, category, suggested_archive,
      tags_json, source, source_item_id, captured_at, ingested_at, status,
      fingerprint, snooze_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    url,
    title,
    null,
    text,
    category,
    ARCHIVE_MAP[category] ?? 'Links / General',
    JSON.stringify(tags),
    'cli',
    null,
    nowIso,
    nowIso,
    'active',
    fingerprint,
    0
  )

  console.log(`✓ Added [${category}] ${title}`)
  if (url) console.log(`  URL: ${url}`)
  console.log(`  DB: ${dbPath}`)
}

function cmdStats() {
  const { db, dbPath } = openDb()

  const total = db.prepare('SELECT COUNT(*) as n FROM resurface_items').get()
  const byStatus = db
    .prepare(
      'SELECT status, COUNT(*) as n FROM resurface_items GROUP BY status ORDER BY n DESC'
    )
    .all()
  const byCategory = db
    .prepare(
      'SELECT category, COUNT(*) as n FROM resurface_items GROUP BY category ORDER BY n DESC'
    )
    .all()
  const bySource = db
    .prepare(
      'SELECT source, COUNT(*) as n FROM resurface_items GROUP BY source ORDER BY n DESC'
    )
    .all()

  console.log(`Resurface — ${total.n} items`)
  console.log(`DB: ${dbPath}\n`)

  console.log('By status:')
  for (const r of byStatus) console.log(`  ${r.status}: ${r.n}`)

  console.log('\nBy category:')
  for (const r of byCategory) console.log(`  ${r.category}: ${r.n}`)

  console.log('\nBy source:')
  for (const r of bySource) console.log(`  ${r.source}: ${r.n}`)
}

function cmdList(values) {
  const { db } = openDb()
  const status = values.status || 'active'
  const limit = parseInt(values.limit || '20', 10)

  const rows = db
    .prepare(
      `SELECT title, category, url, captured_at, surface_count
       FROM resurface_items
       WHERE status = ?
       ORDER BY ingested_at DESC
       LIMIT ?`
    )
    .all(status, limit)

  if (rows.length === 0) {
    console.log(`No ${status} items.`)
    return
  }

  console.log(`${rows.length} ${status} items (most recent first):\n`)
  for (const r of rows) {
    const surfaced = r.surface_count > 0 ? ` (surfaced ${r.surface_count}×)` : ''
    console.log(`  [${r.category}] ${r.title}${surfaced}`)
    if (r.url) console.log(`         ${r.url}`)
  }
}

// Agent reads use a read-only connection: no schema setup, enrichment or surface updates.
function readLimit(raw = '20') {
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 1 || n > 1000) {
    throw new Error('Count must be an integer between 1 and 1000.')
  }
  return n
}

function printReadResults(rows, values) {
  if (values.json) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  if (!rows.length) console.log('No matching items.')
  for (const row of rows) {
    console.log(`[${row.source} / ${row.status}] ${row.title} (${row.id})`)
    if (row.url) console.log(`  ${row.url}`)
    if (row.personal_note) console.log(`  Note: ${row.personal_note}`)
  }
}

const STOP_WORDS = new Set('the and for with this that from have into your are was has not but you https http www com'.split(' '))
function relatedTokens(text) {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token)))]
}

function cmdRead(command, args, values) {
  const query = args.join(' ').trim()
  const limit = readLimit(command === 'recent' ? (args[0] ?? values.limit) : values.limit)
  if (command !== 'recent' && !query) throw new Error(`Usage: resurface ${command} <${command === 'related' ? 'id or text' : 'query'}> [--json]`)
  if (command === 'recent' && args.length > 1) throw new Error('Usage: resurface recent [n] [--json]')
  const { db } = openDb(true)
  try {
    // Default includes active, snoozed and archived saves; dropped items are excluded.
    const statusClause = values.status ? 'status = ?' : "status != 'dropped'"
    const statusArgs = values.status ? [values.status] : []
    let rows
    if (command === 'recent') {
      rows = db.prepare(`SELECT * FROM resurface_items WHERE ${statusClause}
        ORDER BY captured_at DESC, id ASC LIMIT ?`).all(...statusArgs, limit)
    } else if (command === 'search') {
      rows = db.prepare(`SELECT * FROM resurface_items WHERE ${statusClause} AND (
        instr(lower(title), lower(?)) > 0 OR instr(lower(coalesce(summary, '')), lower(?)) > 0
        OR instr(lower(original_text), lower(?)) > 0 OR instr(lower(coalesce(personal_note, '')), lower(?)) > 0)
        ORDER BY captured_at DESC, id ASC LIMIT ?`).all(...statusArgs, query, query, query, query, limit)
    } else {
      const seed = db.prepare('SELECT * FROM resurface_items WHERE id = ?').get(query)
      const tokens = relatedTokens(seed
        ? [seed.title, seed.summary, seed.original_text, seed.personal_note, seed.tags_json].filter(Boolean).join(' ')
        : query)
      rows = db.prepare(`SELECT * FROM resurface_items WHERE ${statusClause}`).all(...statusArgs)
        .filter(row => row.id !== seed?.id)
        .map(row => {
          const fields = [row.title, row.summary, row.original_text, row.personal_note, row.tags_json]
            .map(field => new Set(relatedTokens(field ?? '')))
          const score = tokens.reduce((sum, token) => sum + fields.reduce((n, field, i) =>
            n + (field.has(token) ? [3, 2, 1, 3, 2][i] : 0), 0), 0)
          return { ...row, score }
        })
        .filter(row => row.score > 0)
        .sort((a, b) => b.score - a.score || b.captured_at.localeCompare(a.captured_at) || a.id.localeCompare(b.id))
        .slice(0, limit)
    }
    printReadResults(rows, values)
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    category: { type: 'string', short: 'c' },
    title: { type: 'string', short: 't' },
    status: { type: 'string', short: 's' },
    limit: { type: 'string', short: 'n' },
    help: { type: 'boolean', short: 'h' },
    json: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    vault: { type: 'string' },
    source: { type: 'string', multiple: true },
  },
})

const command = positionals[0]

if (values.help || !command) {
  console.log(`resurface — CLI for the Resurface capture database

Commands:
  add <text or URL>   Add an item to Resurface
    --category, -c    Override category (link|quote|music|tool|article|idea|reference)
    --title, -t       Override title

  search <q>          Search title, summary, original text and personal note
  recent [n]          Most recently captured saves (default: 20)
  related <id|text>   Rank saves by shared words (exclude the seed item)
    --json            JSON array of database rows; related includes score
    --limit, -n       Max results, 1–1000 (default: 20)
    --status, -s      Optional exact status; default excludes dropped
    These three commands open SQLite read-only and require an existing database.

  stats               Show item counts by status, category, and source

  list                List items
    --status, -s      Filter by status (default: active)
    --limit, -n       Max items to show (default: 20)

  ingest-obsidian     Ingest items from Obsidian/Slate vault
    --vault           Vault root path (default: /Users/willworth/slate)
    --source          Source file or directory (repeatable, relative to vault)
    --dry-run         Preview without persisting

Examples:
  node cli.mjs add "https://example.com/great-article"
  node cli.mjs add "Check out Sanderson writing lectures" --category reference
  node cli.mjs add "https://youtu.be/xyz" -c music -t "Cool song"
  node cli.mjs stats
  node cli.mjs list --status snoozed
  node cli.mjs ingest-obsidian --dry-run
  node cli.mjs ingest-obsidian --source "MediaInputGeneral"

Environment:
  RESURFACE_SQLITE_PATH   Override database path (default: .resurface/resurface.db)`)
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Obsidian ingestion (inline, mirrors lib/server/obsidian.ts logic)
// ---------------------------------------------------------------------------

const OBSIDIAN_URL_REGEX = /https?:\/\/[^\s)\]>]+/gi
const OBSIDIAN_MD_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g

function obsidianExtractItems(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const items = []
  const seenUrls = new Set()
  let inFrontmatter = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNumber = i + 1

    if (i === 0 && line === '---') { inFrontmatter = true; continue }
    if (inFrontmatter) { if (line === '---') inFrontmatter = false; continue }
    if (!line || line.startsWith('#') || line === '---' || line === '***') continue
    if (/^\|[\s-:|]+\|$/.test(line)) continue

    const mdLinks = [...line.matchAll(OBSIDIAN_MD_LINK_REGEX)]
    if (mdLinks.length > 0) {
      for (const match of mdLinks) {
        const title = match[1].trim()
        const url = match[2].trim()
        if (seenUrls.has(url)) continue
        seenUrls.add(url)
        items.push({ text: title ? `${title}\n${url}` : url, url, sourceFile: filePath, lineNumber })
      }
      continue
    }

    const bareUrls = [...line.matchAll(OBSIDIAN_URL_REGEX)]
    if (bareUrls.length > 0) {
      for (const match of bareUrls) {
        const url = match[0].replace(/[.,;:!?)]+$/, '')
        if (seenUrls.has(url)) continue
        seenUrls.add(url)
        const textWithoutUrl = line.replace(url, '').trim()
        items.push({ text: textWithoutUrl ? `${textWithoutUrl}\n${url}` : url, url, sourceFile: filePath, lineNumber })
      }
      continue
    }

    // Non-URL substantive lines
    if (line.length >= 10 && !/^\[\[[^\]]+\]\]$/.test(line) &&
        !/^\*\*(Purpose|When to use|Related files)\*\*/.test(line) &&
        !line.startsWith('- For ') && !/^\*\*Added \d{4}/.test(line) &&
        !(line.startsWith('|') && line.endsWith('|') && (line.includes('Title') || line.includes('Notes') || line.includes('Status')))) {
      items.push({ text: line, url: null, sourceFile: filePath, lineNumber })
    }
  }

  return items
}

function obsidianWalkDir(dir, exclude) {
  const results = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (exclude.some(p => entry.name === p || entry.name.startsWith('.'))) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) results.push(...obsidianWalkDir(full, exclude))
      else if (entry.isFile() && entry.name.endsWith('.md')) results.push(full)
    }
  } catch { /* skip */ }
  return results
}

function cmdIngestObsidian(values) {
  const vaultPath = values.vault || '/Users/willworth/slate'
  const sources = values.source || [
    'MediaInputGeneral/MediaInputGeneral.md',
    'MediaInputGeneral/codeMediaGeneral.md',
    'Music/music ideas.md',
    'Code/dev ideas.md',
  ]
  const exclude = ['Templates', '_Archive', '_templates', '.obsidian', '.trash', 'node_modules']
  const dryRun = values['dry-run'] || false

  const { db, dbPath } = openDb()

  console.log(`Obsidian ingestion${dryRun ? ' (DRY RUN)' : ''}`)
  console.log(`Vault: ${vaultPath}`)
  console.log(`DB: ${dbPath}\n`)

  let filesScanned = 0
  let itemsExtracted = 0
  let persisted = 0
  let duplicates = 0
  const errors = []

  // Resolve files
  const files = []
  for (const source of sources) {
    const full = path.join(vaultPath, source)
    try {
      const stat = fs.statSync(full)
      if (stat.isFile() && full.endsWith('.md')) files.push(full)
      else if (stat.isDirectory()) files.push(...obsidianWalkDir(full, exclude))
    } catch {
      console.log(`  ⚠ Source not found: ${source}`)
    }
  }

  filesScanned = files.length
  console.log(`Found ${filesScanned} files to scan\n`)

  for (const file of files) {
    try {
      const items = obsidianExtractItems(file)
      const relPath = file.replace(vaultPath + '/', '')
      console.log(`  ${relPath}: ${items.length} items`)
      itemsExtracted += items.length

      for (const item of items) {
        const fingerprint = buildFingerprint(item.url, item.text)
        const existing = db
          .prepare('SELECT id FROM resurface_items WHERE fingerprint = ? LIMIT 1')
          .get(fingerprint)

        if (existing) {
          duplicates++
          continue
        }

        if (dryRun) {
          persisted++
          continue
        }

        const category = deriveCategory(item.text, item.url)
        const nowIso = new Date().toISOString()
        const relFile = item.sourceFile.replace(vaultPath + '/', '')

        db.prepare(
          `INSERT OR IGNORE INTO resurface_items (
            id, url, title, summary, original_text, category, suggested_archive,
            tags_json, source, source_item_id, captured_at, ingested_at, status,
            fingerprint, snooze_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          item.url,
          deriveTitle(item.text, item.url),
          null,
          item.text,
          category,
          ARCHIVE_MAP[category] ?? 'Links / General',
          JSON.stringify(deriveTags(item.text, item.url)),
          `obsidian:${relFile}`,
          `${relFile}:L${item.lineNumber}`,
          nowIso,
          nowIso,
          'active',
          fingerprint,
          0
        )
        persisted++
      }
    } catch (err) {
      errors.push({ file, reason: err.message })
    }
  }

  console.log(`\n━━━ Results ━━━`)
  console.log(`  Files scanned:  ${filesScanned}`)
  console.log(`  Items found:    ${itemsExtracted}`)
  console.log(`  Persisted:      ${persisted}`)
  console.log(`  Duplicates:     ${duplicates}`)
  if (errors.length > 0) {
    console.log(`  Errors:         ${errors.length}`)
    for (const e of errors) console.log(`    ${e.file}: ${e.reason}`)
  }
}

switch (command) {
  case 'search':
  case 'recent':
  case 'related':
    try {
      cmdRead(command, positionals.slice(1), values)
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
    break
  case 'add':
    cmdAdd(positionals.slice(1), values)
    break
  case 'stats':
    cmdStats()
    break
  case 'list':
    cmdList(values)
    break
  case 'ingest-obsidian':
    cmdIngestObsidian(values)
    break
  default:
    console.error(`Unknown command: ${command}. Run with --help for usage.`)
    process.exit(1)
}
