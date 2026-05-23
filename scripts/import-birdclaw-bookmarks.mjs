#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const DEFAULT_BASE_URL = process.env.RESURFACE_BASE_URL ?? 'http://127.0.0.1:7790'

function usage() {
  console.error(`Usage: node scripts/import-birdclaw-bookmarks.mjs [options]

Imports X/Twitter bookmarks into Resurface.

Options:
  --limit <n>          Max bookmarks to export/import (default: 100)
  --query <text>       Optional Birdclaw search query before --bookmarked filter
  --source <source>    auto, birdclaw, or twitter-cli (default: auto)
  --input <file>       Read Birdclaw search JSON from a file instead of invoking birdclaw
  --base-url <url>     Resurface base URL (default: RESURFACE_BASE_URL or ${DEFAULT_BASE_URL})
  --dry-run            Print normalized Resurface payload instead of posting
  --no-sync            Do not run birdclaw sync first (refuses local-only cache unless --allow-local-cache)
  --allow-local-cache  Allow importing from existing Birdclaw cache without successful live sync
  --help               Show this help

Default behavior runs a live Birdclaw bookmark sync first. This deliberately avoids
accidentally importing Birdclaw's demo/local seed rows into Resurface.
If Birdclaw live sync fails in auto mode, the script falls back to the local
twitter CLI, which reads the authenticated browser session directly.
`)
}

function parseArgs(argv) {
  const options = {
    limit: 100,
    query: '',
    source: 'auto',
    input: null,
    baseUrl: DEFAULT_BASE_URL,
    dryRun: false,
    sync: true,
    allowLocalCache: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--limit':
      case '-n':
        options.limit = Number(argv[++i])
        break
      case '--query':
      case '-q':
        options.query = argv[++i] ?? ''
        break
      case '--source':
        options.source = argv[++i] ?? 'auto'
        break
      case '--input':
      case '-i':
        options.input = argv[++i]
        break
      case '--base-url':
        options.baseUrl = argv[++i] ?? DEFAULT_BASE_URL
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--no-sync':
        options.sync = false
        break
      case '--allow-local-cache':
        options.allowLocalCache = true
        break
      case '--help':
      case '-h':
        usage()
        process.exit(0)
      default:
        console.error(`Unknown option: ${arg}`)
        usage()
        process.exit(2)
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    console.error('--limit must be a positive number')
    process.exit(2)
  }
  if (!['auto', 'birdclaw', 'twitter-cli'].includes(options.source)) {
    console.error('--source must be one of: auto, birdclaw, twitter-cli')
    process.exit(2)
  }

  return options
}

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0 && !allowFailure) {
    const stderr = result.stderr?.trim()
    const stdout = result.stdout?.trim()
    throw new Error(
      `${command} ${args.join(' ')} failed with exit ${result.status}${stderr ? `\n${stderr}` : ''}${stdout ? `\n${stdout}` : ''}`
    )
  }

  return result
}

function readJsonFromCommand(command, args) {
  const result = run(command, args)
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(
      `Could not parse JSON from ${command} ${args.join(' ')}: ${error.message}\n${result.stdout.slice(0, 1000)}`
    )
  }
}

function normalizeHandle(handle) {
  if (!handle) return undefined
  const cleaned = String(handle).trim().replace(/^@/, '')
  return cleaned ? `@${cleaned}` : undefined
}

function tweetUrl(item) {
  if (item.url) return item.url
  const handle = item.author?.handle ?? item.authorHandle ?? item.username
  const cleanHandle = handle ? String(handle).replace(/^@/, '') : 'i/web'
  return `https://x.com/${cleanHandle}/status/${item.id ?? item.tweetId}`
}

function normalizeBirdclawItem(item) {
  const tweetId = String(item.id ?? item.tweetId ?? item.tweet_id ?? '').trim()
  const text = String(item.text ?? item.fullText ?? item.full_text ?? item.plainText ?? '').trim()

  if (!tweetId || !text) return null

  return {
    tweetId,
    text,
    url: tweetUrl(item),
    authorHandle: normalizeHandle(item.author?.handle ?? item.authorHandle ?? item.user?.screen_name),
    capturedAt: item.bookmarkedAt ?? item.savedAt ?? item.createdAt ?? item.created_at,
  }
}

function normalizeTwitterCliItem(item) {
  const tweetId = String(item.id ?? '').trim()
  const text = String(item.text ?? '').trim()

  if (!tweetId || !text) return null

  const authorHandle = normalizeHandle(item.author?.screenName ?? item.author?.handle)
  const cleanHandle = authorHandle ? authorHandle.replace(/^@/, '') : 'i/web'

  return {
    tweetId,
    text,
    url: `https://x.com/${cleanHandle}/status/${tweetId}`,
    authorHandle,
    capturedAt: item.createdAt,
  }
}

function normalizeItems(raw) {
  const items = Array.isArray(raw) ? raw : raw.items ?? raw.bookmarks ?? raw.data ?? []
  if (!Array.isArray(items)) {
    throw new Error('Birdclaw JSON did not contain an array, .items, .bookmarks, or .data')
  }

  const seen = new Set()
  const normalized = []

  for (const item of items) {
    const mapped = normalizeBirdclawItem(item)
    if (!mapped) continue
    if (seen.has(mapped.tweetId)) continue
    seen.add(mapped.tweetId)
    normalized.push(mapped)
  }

  return normalized
}

function normalizeTwitterCliItems(raw) {
  const items = Array.isArray(raw) ? raw : raw.data ?? raw.items ?? raw.bookmarks ?? []
  if (!Array.isArray(items)) {
    throw new Error('twitter CLI JSON did not contain an array, .data, .items, or .bookmarks')
  }

  const seen = new Set()
  const normalized = []

  for (const item of items) {
    const mapped = normalizeTwitterCliItem(item)
    if (!mapped) continue
    if (seen.has(mapped.tweetId)) continue
    seen.add(mapped.tweetId)
    normalized.push(mapped)
  }

  return normalized
}

async function postToResurface(baseUrl, bookmarks) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/ingest/twitter-bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarks }),
  })

  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text }
  }

  if (!response.ok) {
    throw new Error(`Resurface ingest failed (${response.status}): ${JSON.stringify(body, null, 2)}`)
  }

  return body
}

function readBirdclawBookmarks(options) {
  run('birdclaw', ['--version'])

  if (options.sync) {
    const syncLimit = Math.max(5, Math.min(100, options.limit))
    console.error(`Syncing up to ${syncLimit} Birdclaw bookmarks before export...`)
    run('birdclaw', [
      'sync',
      'bookmarks',
      '--mode',
      'auto',
      '--limit',
      String(syncLimit),
      '--refresh',
      '--json',
    ])
  } else if (!options.allowLocalCache) {
    console.error('Refusing to import from Birdclaw cache without a live sync. Use --allow-local-cache if you know the cache is real.')
    process.exit(2)
  }

  const args = ['search', 'tweets']
  if (options.query) args.push(options.query)
  args.push('--bookmarked', '--limit', String(options.limit), '--json')
  return normalizeItems(readJsonFromCommand('birdclaw', args))
}

function readTwitterCliBookmarks(options) {
  if (options.query) {
    console.error('Warning: --query is only supported for Birdclaw search; ignoring it for twitter-cli source.')
  }
  console.error(`Fetching up to ${options.limit} live bookmarks via local twitter CLI...`)
  const raw = readJsonFromCommand('/Users/willworth/.local/bin/twitter', [
    'bookmarks',
    '--max',
    String(options.limit),
    '--json',
  ])
  return normalizeTwitterCliItems(raw)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  let bookmarks
  if (options.input) {
    bookmarks = normalizeItems(JSON.parse(fs.readFileSync(options.input, 'utf8')))
  } else {
    if (options.source === 'twitter-cli') {
      bookmarks = readTwitterCliBookmarks(options)
    } else {
      try {
        bookmarks = readBirdclawBookmarks(options)
      } catch (error) {
        if (options.source === 'birdclaw') throw error
        console.error(`Birdclaw live bookmark read failed; falling back to twitter-cli.\n${error.message}`)
        bookmarks = readTwitterCliBookmarks(options)
      }
    }
  }

  const payload = { bookmarks }

  if (options.dryRun) {
    console.log(JSON.stringify(payload, null, 2))
    console.error(`Dry run: normalized ${bookmarks.length} bookmarks.`)
    return
  }

  if (bookmarks.length === 0) {
    console.log(JSON.stringify({ scanned: 0, persisted: 0, duplicates: 0, invalid: 0, note: 'No bookmarks to import' }, null, 2))
    return
  }

  const result = await postToResurface(options.baseUrl, bookmarks)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
