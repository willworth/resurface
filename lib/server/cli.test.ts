// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { getResurfaceDatabase, resetResurfaceDatabaseForTests } from './sqlite'

let tempDir: string
let dbPath: string
function run(...args: string[]) {
  return spawnSync(process.execPath, ['cli.mjs', ...args], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, RESURFACE_SQLITE_PATH: dbPath },
  })
}
function results(...args: string[]) {
  const result = run(...args, '--json')
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout) as Array<Record<string, unknown>>
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-cli-'))
  dbPath = path.join(tempDir, 'resurface.db')
  process.env.RESURFACE_SQLITE_PATH = dbPath
  resetResurfaceDatabaseForTests()
  const db = getResurfaceDatabase()
  const insert = db.prepare(`INSERT INTO resurface_items
    (id, title, summary, original_text, personal_note, category, tags_json, source,
     captured_at, ingested_at, status, fingerprint)
    VALUES (?, ?, ?, ?, ?, 'reference', '[]', 'test', ?, ?, ?, ?)`)
  insert.run('seed', 'Music practice', '', 'Piano scales', '', '2026-01-01', '2026-01-01', 'active', 'seed')
  insert.run('note', 'Archived lesson', '', 'Saved lesson', 'Music piano practice', '2026-03-01', '2026-02-01', 'archived', 'note')
  insert.run('summary', 'New save', 'Music practice', 'Saved text', '', '2026-02-01', '2026-04-01', 'snoozed', 'summary')
  insert.run('literal', '100%_unique', '', 'Literal characters', '', '2026-04-01', '2026-04-01', 'active', 'literal')
  insert.run('dropped', 'Music practice', '', 'Piano scales', '', '2026-05-01', '2026-05-01', 'dropped', 'dropped')
  resetResurfaceDatabaseForTests()
})
afterEach(() => {
  resetResurfaceDatabaseForTests()
  delete process.env.RESURFACE_SQLITE_PATH
  fs.rmSync(tempDir, { recursive: true, force: true })
})

it('searches notes and summaries, excludes dropped, supports status and literal characters', () => {
  expect(results('search', 'MUSIC').map(row => row.id)).toEqual(['note', 'summary', 'seed'])
  expect(results('search', 'music', '--status', 'archived').map(row => row.id)).toEqual(['note'])
  expect(results('search', '%_').map(row => row.id)).toEqual(['literal'])
  expect(results('search', "' OR 1=1 --")).toEqual([])
})
it('returns recent saves ordered by capture time, bounded by n', () => {
  expect(results('recent', '2').map(row => row.id)).toEqual(['literal', 'note'])
  expect(results('recent', '--status', 'dropped').map(row => row.id)).toEqual(['dropped'])
})
it('ranks related text and exact IDs, omitting seed and zero-overlap rows', () => {
  expect(results('related', 'seed').map(row => row.id)).toEqual(['note', 'summary'])
  expect(results('related', 'piano practice', '--limit', '1')[0]?.id).toBe('note')
  expect(results('related', 'unmatched')).toEqual([])
})
it('leaves all data and schema unchanged across reads', () => {
  const before = fs.readFileSync(dbPath)
  results('search', 'music')
  results('recent')
  results('related', 'seed')
  expect(fs.readFileSync(dbPath)).toEqual(before)
  const db = new DatabaseSync(dbPath, { readOnly: true })
  expect(db.prepare('SELECT COUNT(*) as n FROM resurface_events').get()?.n).toBe(0)
  db.close()
})
it('rejects missing arguments, invalid limits and missing databases without creation', () => {
  for (const args of [['search'], ['related'], ['recent', '0'], ['recent', '2x'], ['recent', '1001']]) {
    expect(run(...args).status).toBe(1)
  }
  dbPath = path.join(tempDir, 'missing', 'resurface.db')
  expect(run('recent', '--json').status).toBe(1)
  expect(fs.existsSync(path.dirname(dbPath))).toBe(false)
})
