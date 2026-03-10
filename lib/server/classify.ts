// apps/resurface/lib/server/classify.ts

// packages/apps/resurface/lib/server/classify.ts

import crypto from 'node:crypto'
import { ResurfaceCategory } from './types'

const URL_REGEX = /https?:\/\/[^\s)\]]+/i

export function extractUrl(content: string): string | null {
  const match = content.match(URL_REGEX)
  return match ? match[0] : null
}

export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim())
    parsed.hash = ''

    const stripParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
    ]
    stripParams.forEach((key) => parsed.searchParams.delete(key))

    parsed.pathname = parsed.pathname.replace(/\/$/, '')
    return parsed.toString()
  } catch {
    return rawUrl.trim().toLowerCase()
  }
}

export function normalizeText(value: string): string {
  return value.replace(URL_REGEX, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function buildFingerprint(url: string | null, text: string): string {
  const material = url ? normalizeUrl(url) : normalizeText(text)
  return crypto.createHash('sha256').update(material).digest('hex')
}

const CAPTURE_PREFIXES = [
  'read ',
  'watch ',
  'listen ',
  'save ',
  'bookmark ',
  'reference:',
  'quote:',
  'idea:',
]
const ACTION_PREFIXES = [
  'buy ',
  'call ',
  'email ',
  'send ',
  'book ',
  'pay ',
  'fix ',
  'finish ',
  'update ',
]

export function isCapture(content: string): boolean {
  const normalized = content.trim().toLowerCase()

  if (!normalized) {
    return false
  }

  if (extractUrl(content)) {
    return true
  }

  if (CAPTURE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true
  }

  if (
    normalized.includes('"') ||
    normalized.includes('“') ||
    normalized.includes('”')
  ) {
    return true
  }

  if (ACTION_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false
  }

  return normalized.length > 100
}

export function deriveCategory(
  content: string,
  url: string | null
): ResurfaceCategory {
  const normalized = content.toLowerCase()

  if (
    normalized.includes('"') ||
    normalized.includes('“') ||
    normalized.includes('”')
  ) {
    return 'quote'
  }

  if (url) {
    const loweredUrl = url.toLowerCase()
    if (
      loweredUrl.includes('youtube.com') ||
      loweredUrl.includes('youtu.be') ||
      loweredUrl.includes('spotify.com') ||
      loweredUrl.includes('bandcamp.com')
    ) {
      return 'music'
    }
    if (
      loweredUrl.includes('github.com') ||
      loweredUrl.includes('npmjs.com') ||
      loweredUrl.includes('producthunt.com')
    ) {
      return 'tool'
    }
    if (
      loweredUrl.includes('medium.com') ||
      loweredUrl.includes('substack.com') ||
      loweredUrl.includes('/article') ||
      loweredUrl.includes('/blog')
    ) {
      return 'article'
    }
    return 'link'
  }

  if (normalized.includes('idea')) {
    return 'idea'
  }

  return 'reference'
}

export function deriveSuggestedArchive(category: ResurfaceCategory): string {
  switch (category) {
    case 'music':
      return 'Music / References'
    case 'tool':
      return 'Dev Tools / AI Agents'
    case 'quote':
      return 'Quotes / Personal'
    case 'idea':
      return 'Ideas / Seeds'
    case 'article':
      return 'Reading / Articles'
    case 'reference':
      return 'Reference / General'
    case 'link':
    default:
      return 'Links / General'
  }
}

export function deriveTags(content: string, url: string | null): string[] {
  const tags = new Set<string>()
  const normalized = content.toLowerCase()

  if (normalized.includes('ai')) tags.add('ai')
  if (normalized.includes('agent')) tags.add('agents')
  if (normalized.includes('music')) tags.add('music')
  if (normalized.includes('design')) tags.add('design')
  if (normalized.includes('product')) tags.add('product')

  if (url) {
    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '')
      } catch {
        return null
      }
    })()
    if (host) tags.add(host)
  }

  return Array.from(tags)
}

export function deriveTitle(content: string, url: string | null): string {
  const withoutUrl = content.replace(URL_REGEX, '').trim()
  if (withoutUrl.length > 0) {
    return withoutUrl.slice(0, 160)
  }

  if (url) {
    try {
      const parsed = new URL(url)
      return parsed.hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  }

  return 'Untitled capture'
}
