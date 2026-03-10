// apps/resurface/lib/server/obsidian.ts

/**
 * Obsidian vault ingestion for Resurface.
 *
 * Scans configured paths in a Slate/Obsidian vault and extracts
 * individual items (URLs, ideas, references, quotes) into Resurface.
 *
 * Design: each "item" is a discrete URL or text block. A long markdown
 * file with 30 URLs yields 30 items, not one.
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import {
  buildFingerprint,
  deriveCategory,
  deriveSuggestedArchive,
  deriveTags,
  deriveTitle,
} from './classify'
import { getResurfaceDatabase } from './sqlite'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ObsidianIngestConfig = {
  /** Root of the Obsidian vault */
  vaultPath: string
  /** Specific files or directories to scan (relative to vaultPath) */
  sources: string[]
  /** Directory/file patterns to exclude */
  exclude?: string[]
}

export type ObsidianIngestResult = {
  filesScanned: number
  itemsExtracted: number
  persisted: number
  duplicates: number
  errors: Array<{ file: string; reason: string }>
}

type ExtractedItem = {
  text: string
  url: string | null
  sourceFile: string
  /** Line number (1-indexed) where this item was found */
  lineNumber: number
}

// ─── Default config ─────────────────────────────────────────────────────────

const DEFAULT_VAULT_PATH = '/Users/willworth/slate'

const DEFAULT_SOURCES = [
  'MediaInputGeneral/MediaInputGeneral.md',
  'MediaInputGeneral/codeMediaGeneral.md',
  'Music/music ideas.md',
  'Code/dev ideas.md',
]

const DEFAULT_EXCLUDE = [
  'Templates',
  '_Archive',
  '_templates',
  '.obsidian',
  '.trash',
  'node_modules',
]

export function getDefaultConfig(): ObsidianIngestConfig {
  return {
    vaultPath: DEFAULT_VAULT_PATH,
    sources: DEFAULT_SOURCES,
    exclude: DEFAULT_EXCLUDE,
  }
}

// ─── File discovery ─────────────────────────────────────────────────────────

function resolveFiles(config: ObsidianIngestConfig): string[] {
  const files: string[] = []

  for (const source of config.sources) {
    const fullPath = path.join(config.vaultPath, source)

    try {
      const stat = fs.statSync(fullPath)

      if (stat.isFile() && fullPath.endsWith('.md')) {
        files.push(fullPath)
      } else if (stat.isDirectory()) {
        const dirFiles = walkDirectory(fullPath, config.exclude ?? [])
        files.push(...dirFiles)
      }
    } catch {
      // Source doesn't exist — skip silently, report in results
    }
  }

  return [...new Set(files)]
}

function walkDirectory(dir: string, exclude: string[]): string[] {
  const results: string[] = []

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (
        exclude.some(
          (pattern) => entry.name === pattern || entry.name.startsWith('.')
        )
      ) {
        continue
      }

      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        results.push(...walkDirectory(fullPath, exclude))
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath)
      }
    }
  } catch {
    // Permission error or similar — skip
  }

  return results
}

// ─── Item extraction ────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s)\]>]+/gi
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
const TABLE_ROW_REGEX = /^\|.*\|$/

/**
 * Extract discrete items from a markdown file.
 *
 * Strategy:
 * 1. Parse markdown links [title](url)
 * 2. Parse bare URLs
 * 3. Parse table rows containing links
 * 4. Parse quoted text blocks
 * 5. Skip frontmatter, headings, and structural lines
 */
export function extractItemsFromFile(filePath: string): ExtractedItem[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const items: ExtractedItem[] = []
  const seenUrls = new Set<string>()
  const sourceFile = filePath

  let inFrontmatter = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNumber = i + 1

    // Handle YAML frontmatter
    if (i === 0 && line === '---') {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      if (line === '---') {
        inFrontmatter = false
      }
      continue
    }

    // Skip empty lines, headings (structural), horizontal rules, and pure formatting
    if (!line || line.startsWith('#') || line === '---' || line === '***') {
      continue
    }

    // Skip table headers and separator rows
    if (
      TABLE_ROW_REGEX.test(line) &&
      (line.includes(':--') || line.includes('--:'))
    ) {
      continue
    }

    // Try extracting markdown links from this line
    const mdLinks = [...line.matchAll(MARKDOWN_LINK_REGEX)]

    if (mdLinks.length > 0) {
      for (const match of mdLinks) {
        const title = match[1].trim()
        const url = match[2].trim()

        if (seenUrls.has(url)) continue
        seenUrls.add(url)

        const text = title ? `${title}\n${url}` : url
        items.push({ text, url, sourceFile, lineNumber })
      }
      continue
    }

    // Try extracting bare URLs
    const bareUrls = [...line.matchAll(URL_REGEX)]

    if (bareUrls.length > 0) {
      for (const match of bareUrls) {
        const url = match[0].replace(/[.,;:!?)]+$/, '') // Strip trailing punctuation
        if (seenUrls.has(url)) continue
        seenUrls.add(url)

        // Use surrounding text as context
        const textWithoutUrl = line.replace(url, '').trim()
        const text = textWithoutUrl ? `${textWithoutUrl}\n${url}` : url

        items.push({ text, url, sourceFile, lineNumber })
      }
      continue
    }

    // Non-URL lines: could be ideas, quotes, references
    // Only capture if they look substantive (not table headers, not metadata)
    if (isSubstantiveLine(line)) {
      items.push({ text: line, url: null, sourceFile, lineNumber })
    }
  }

  return items
}

/**
 * Determine if a non-URL line is worth capturing as an item.
 * Filters out structural markdown, table headers, metadata, etc.
 */
function isSubstantiveLine(line: string): boolean {
  // Too short to be meaningful
  if (line.length < 10) return false

  // Table separator
  if (/^\|[\s-:|]+\|$/.test(line)) return false

  // Table header row (usually column names)
  if (line.startsWith('|') && line.endsWith('|') && line.includes('Title'))
    return false
  if (line.startsWith('|') && line.endsWith('|') && line.includes('Notes'))
    return false
  if (line.startsWith('|') && line.endsWith('|') && line.includes('Status'))
    return false

  // Obsidian wiki-links to other files (structural, not content)
  if (/^\[\[[^\]]+\]\]$/.test(line)) return false

  // "Purpose:", "When to use:", "Related files:" — file metadata
  if (/^\*\*(Purpose|When to use|Related files)\*\*/.test(line)) return false
  if (line.startsWith('- For ') && line.includes('→ See')) return false

  // Bold section headers
  if (/^\*\*Added \d{4}/.test(line)) return false

  // Looks like a real idea, quote, or reference
  return true
}

// ─── Persistence ────────────────────────────────────────────────────────────

function isAlreadyPersisted(fingerprint: string): boolean {
  const db = getResurfaceDatabase()
  const row = db
    .prepare('SELECT id FROM resurface_items WHERE fingerprint = ? LIMIT 1')
    .get(fingerprint) as { id?: string } | undefined
  return Boolean(row?.id)
}

function insertItem(item: ExtractedItem): boolean {
  const db = getResurfaceDatabase()
  const category = deriveCategory(item.text, item.url)
  const nowIso = new Date().toISOString()
  const fingerprint = buildFingerprint(item.url, item.text)

  // Construct source identifier from file path
  const relativePath = item.sourceFile.replace(DEFAULT_VAULT_PATH + '/', '')
  const source = `obsidian:${relativePath}`

  const result = db
    .prepare(
      `
      INSERT OR IGNORE INTO resurface_items (
        id, url, title, summary, original_text, category,
        suggested_archive, tags_json, source, source_item_id,
        captured_at, ingested_at, status, fingerprint, snooze_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      randomUUID(),
      item.url,
      deriveTitle(item.text, item.url),
      null,
      item.text,
      category,
      deriveSuggestedArchive(category),
      JSON.stringify(deriveTags(item.text, item.url)),
      source,
      `${relativePath}:L${item.lineNumber}`,
      nowIso, // captured_at — we don't have original dates for these
      nowIso,
      'active',
      fingerprint,
      0
    )

  return result.changes > 0
}

// ─── Main ingestion ─────────────────────────────────────────────────────────

export function ingestObsidianVault(
  config?: Partial<ObsidianIngestConfig>,
  options?: { dryRun?: boolean }
): ObsidianIngestResult {
  const fullConfig: ObsidianIngestConfig = {
    ...getDefaultConfig(),
    ...config,
  }
  const dryRun = options?.dryRun ?? false

  const result: ObsidianIngestResult = {
    filesScanned: 0,
    itemsExtracted: 0,
    persisted: 0,
    duplicates: 0,
    errors: [],
  }

  const files = resolveFiles(fullConfig)
  result.filesScanned = files.length

  for (const file of files) {
    try {
      const items = extractItemsFromFile(file)
      result.itemsExtracted += items.length

      for (const item of items) {
        const fingerprint = buildFingerprint(item.url, item.text)

        if (isAlreadyPersisted(fingerprint)) {
          result.duplicates += 1
          continue
        }

        if (dryRun) {
          result.persisted += 1
          continue
        }

        const inserted = insertItem(item)
        if (inserted) {
          result.persisted += 1
        } else {
          result.duplicates += 1
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({ file, reason })
    }
  }

  return result
}
