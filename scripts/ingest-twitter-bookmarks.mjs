#!/usr/bin/env node

import fs from 'node:fs'

const [, , inputPath, baseUrlArg] = process.argv

if (!inputPath) {
  console.error(
    'Usage: node scripts/ingest-twitter-bookmarks.mjs <bookmarks-json-file> [baseUrl]'
  )
  process.exit(1)
}

const baseUrl =
  baseUrlArg ?? process.env.RESURFACE_BASE_URL ?? 'http://127.0.0.1:7790'
const bookmarks = JSON.parse(fs.readFileSync(inputPath, 'utf8'))

const payload = Array.isArray(bookmarks) ? { bookmarks } : bookmarks

const response = await fetch(`${baseUrl}/api/ingest/twitter-bookmarks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

const result = await response.json()
if (!response.ok) {
  console.error(JSON.stringify(result, null, 2))
  process.exit(1)
}

console.log(JSON.stringify(result, null, 2))
