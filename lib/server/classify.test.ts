// apps/resurface/lib/server/classify.test.ts


import {
  buildFingerprint,
  deriveCategory,
  extractUrl,
  isCapture,
  normalizeUrl,
} from './classify'

describe('classify', () => {
  it('extracts a URL from task text', () => {
    expect(extractUrl('Read this https://example.com/page?utm_source=x')).toBe(
      'https://example.com/page?utm_source=x'
    )
  })

  it('normalizes URL tracking params for fingerprint stability', () => {
    expect(
      normalizeUrl('https://example.com/path/?utm_source=test&fbclid=abc')
    ).toBe('https://example.com/path')
  })

  it('classifies link captures and not obvious tasks', () => {
    expect(isCapture('Read this https://example.com')).toBe(true)
    expect(isCapture('Buy groceries tomorrow')).toBe(false)
  })

  it('derives music category from youtube links', () => {
    expect(deriveCategory('Great live version', 'https://youtu.be/abc')).toBe(
      'music'
    )
  })

  it('creates deterministic fingerprints', () => {
    const a = buildFingerprint('https://example.com/?utm_source=x', 'ignore me')
    const b = buildFingerprint('https://example.com/', 'something else')
    expect(a).toBe(b)
  })
})
