// apps/resurface/lib/server/obsidian.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { extractItemsFromFile, ingestObsidianVault } from './obsidian'

// ─── Helpers ────────────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resurface-obsidian-'))
  // Set up test DB
  process.env.RESURFACE_SQLITE_PATH = path.join(tmpDir, 'test.db')
})

afterEach(() => {
  delete process.env.RESURFACE_SQLITE_PATH
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeTestFile(relativePath: string, content: string): string {
  const fullPath = path.join(tmpDir, 'vault', relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf-8')
  return fullPath
}

// ─── extractItemsFromFile ───────────────────────────────────────────────────

describe('extractItemsFromFile', () => {
  it('extracts bare URLs', () => {
    const file = writeTestFile(
      'test.md',
      [
        'https://example.com/article',
        'https://youtube.com/watch?v=abc',
        '',
        'short',
      ].join('\n')
    )

    const items = extractItemsFromFile(file)

    expect(items).toHaveLength(2)
    expect(items[0].url).toBe('https://example.com/article')
    expect(items[1].url).toBe('https://youtube.com/watch?v=abc')
  })

  it('extracts markdown links', () => {
    const file = writeTestFile(
      'test.md',
      [
        '[Great Article](https://example.com/great)',
        '[Another One](https://other.com/thing)',
      ].join('\n')
    )

    const items = extractItemsFromFile(file)

    expect(items).toHaveLength(2)
    expect(items[0].url).toBe('https://example.com/great')
    expect(items[0].text).toContain('Great Article')
    expect(items[1].url).toBe('https://other.com/thing')
  })

  it('skips frontmatter', () => {
    const file = writeTestFile(
      'test.md',
      [
        '---',
        'title: Test',
        'date: 2026-01-01',
        '---',
        'https://example.com/after-frontmatter',
      ].join('\n')
    )

    const items = extractItemsFromFile(file)

    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://example.com/after-frontmatter')
  })

  it('skips headings and empty lines', () => {
    const file = writeTestFile(
      'test.md',
      [
        '# Main Heading',
        '',
        '## Sub Heading',
        '',
        'https://example.com/real-content',
      ].join('\n')
    )

    const items = extractItemsFromFile(file)

    expect(items).toHaveLength(1)
  })

  it('deduplicates URLs within a file', () => {
    const file = writeTestFile(
      'test.md',
      [
        'https://example.com/same',
        'some text with https://example.com/same embedded',
      ].join('\n')
    )

    const items = extractItemsFromFile(file)

    expect(items).toHaveLength(1)
  })

  it('extracts substantive non-URL lines', () => {
    const file = writeTestFile(
      'test.md',
      [
        'This is a substantive idea about building something interesting',
        'short',
        'Another longer line that should definitely be captured as an item',
      ].join('\n')
    )

    const items = extractItemsFromFile(file)

    // "short" should be filtered (< 10 chars)
    expect(items).toHaveLength(2)
    expect(items[0].url).toBeNull()
    expect(items[0].text).toContain('substantive idea')
  })

  it('includes line numbers', () => {
    const file = writeTestFile(
      'test.md',
      [
        '# Header',
        '',
        'https://example.com/line3',
        '',
        'https://example.com/line5',
      ].join('\n')
    )

    const items = extractItemsFromFile(file)

    expect(items).toHaveLength(2)
    expect(items[0].lineNumber).toBe(3)
    expect(items[1].lineNumber).toBe(5)
  })

  it('handles URLs with surrounding text', () => {
    const file = writeTestFile(
      'test.md',
      ['Check this out https://example.com/cool stuff'].join('\n')
    )

    const items = extractItemsFromFile(file)

    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://example.com/cool')
    expect(items[0].text).toContain('Check this out')
  })
})

// ─── ingestObsidianVault ────────────────────────────────────────────────────

describe('ingestObsidianVault', () => {
  it('ingests files from configured sources (dry run)', () => {
    const vaultPath = path.join(tmpDir, 'vault')
    writeTestFile(
      'source1.md',
      ['https://example.com/one', 'https://example.com/two'].join('\n')
    )
    writeTestFile('source2.md', ['[Cool Thing](https://cool.com)'].join('\n'))

    const result = ingestObsidianVault(
      {
        vaultPath,
        sources: ['source1.md', 'source2.md'],
      },
      { dryRun: true }
    )

    expect(result.filesScanned).toBe(2)
    expect(result.itemsExtracted).toBe(3)
    expect(result.persisted).toBe(3)
    expect(result.duplicates).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('persists to database', () => {
    const vaultPath = path.join(tmpDir, 'vault')
    writeTestFile('test.md', ['https://example.com/persisted'].join('\n'))

    const result = ingestObsidianVault({
      vaultPath,
      sources: ['test.md'],
    })

    expect(result.persisted).toBe(1)

    // Second run should show as duplicate
    const result2 = ingestObsidianVault({
      vaultPath,
      sources: ['test.md'],
    })

    expect(result2.duplicates).toBe(1)
    expect(result2.persisted).toBe(0)
  })

  it('scans directories recursively', () => {
    const vaultPath = path.join(tmpDir, 'vault')
    writeTestFile('media/file1.md', 'https://example.com/dir1')
    writeTestFile('media/sub/file2.md', 'https://example.com/dir2')

    const result = ingestObsidianVault(
      {
        vaultPath,
        sources: ['media'],
      },
      { dryRun: true }
    )

    expect(result.filesScanned).toBe(2)
    expect(result.itemsExtracted).toBe(2)
  })

  it('skips missing sources gracefully', () => {
    const vaultPath = path.join(tmpDir, 'vault')
    writeTestFile('exists.md', 'https://example.com/exists')

    const result = ingestObsidianVault(
      {
        vaultPath,
        sources: ['exists.md', 'missing.md', 'also-missing/dir'],
      },
      { dryRun: true }
    )

    expect(result.filesScanned).toBe(1)
    expect(result.errors).toHaveLength(0)
  })
})
