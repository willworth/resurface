// apps/resurface/lib/server/preview.ts

export type PreviewMetadata = {
  previewTitle: string | null
  previewSiteName: string | null
  previewDescription: string | null
  previewImageUrl: string | null
  previewFetchedAt: string | null
}

function hostName(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractMetaContent(
  html: string,
  attribute: 'property' | 'name',
  value: string
): string | null {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${value}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${value}["'][^>]*>`,
    'i'
  )
  const match = html.match(pattern)
  const content = match?.[1] ?? match?.[2] ?? null
  return content ? decodeHtmlEntities(content.trim()) : null
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null
}

function cleanTitle(value: string | null): string | null {
  if (!value) return null

  const trimmed = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s+YouTube$/i, '')

  if (!trimmed) return null

  const lowered = trimmed.toLowerCase()
  if (
    lowered === 'youtube' ||
    lowered === 'youtube.com' ||
    lowered === 'github' ||
    lowered === 'github.com'
  ) {
    return null
  }

  return trimmed
}

function extractJsonLdDescriptions(html: string): string[] {
  const matches = Array.from(
    html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  )

  const descriptions: string[] = []

  for (const match of matches) {
    const raw = match[1]?.trim()
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw) as unknown
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed]

      while (queue.length > 0) {
        const next = queue.shift()
        if (!next || typeof next !== 'object') continue

        const candidate = next as Record<string, unknown>
        const description = candidate.description
        if (typeof description === 'string' && description.trim()) {
          descriptions.push(decodeHtmlEntities(description.trim()))
        }

        for (const value of Object.values(candidate)) {
          if (value && typeof value === 'object') {
            queue.push(value)
          }
        }
      }
    } catch {
      continue
    }
  }

  return descriptions
}

function cleanYouTubeDescription(value: string | null): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const genericPatterns = [
    /enjoy the videos and music you love/i,
    /disfruta de los videos y la musica que te gustan/i,
    /sube material original/i,
    /share it all with friends/i,
  ]

  if (genericPatterns.some((pattern) => pattern.test(trimmed))) {
    return null
  }

  return trimmed
}

function pickYouTubeDescription(html: string): string | null {
  const jsonLd = extractJsonLdDescriptions(html)
    .map((description) => cleanYouTubeDescription(description))
    .find((description): description is string => Boolean(description))

  if (jsonLd) return jsonLd

  return cleanYouTubeDescription(
    extractMetaContent(html, 'property', 'og:description') ??
      extractMetaContent(html, 'name', 'description')
  )
}

function normalizeGitHubRepoDescription(value: string | null): string | null {
  if (!value) return null

  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null

  const lowered = trimmed.toLowerCase()
  if (
    lowered === 'github' ||
    lowered.startsWith('github is where') ||
    lowered.startsWith('build and ship software')
  ) {
    return null
  }

  return trimmed
}

function pickGitHubDescription(html: string): string | null {
  const selectors = [
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
    /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
  ]

  for (const selector of selectors) {
    const match = html.match(selector)
    const candidate = normalizeGitHubRepoDescription(
      match?.[1] ? decodeHtmlEntities(match[1]) : null
    )
    if (candidate) return candidate
  }

  const jsonLd = extractJsonLdDescriptions(html)
    .map((description) => normalizeGitHubRepoDescription(description))
    .find((description): description is string => Boolean(description))

  return jsonLd ?? null
}

function toAbsoluteUrl(baseUrl: string, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null

  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return maybeRelative
  }
}

function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export async function fetchPreviewMetadata(
  url: string
): Promise<PreviewMetadata> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'ResurfaceBot/0.1 (+local preview fetch)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })

    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('text/html')) {
      return {
        previewTitle: null,
        previewSiteName: hostLabel(url),
        previewDescription: null,
        previewImageUrl: null,
        previewFetchedAt: new Date().toISOString(),
      }
    }

    const html = await response.text()
    const finalUrl = response.url || url
    const host = hostName(finalUrl)

    const previewSiteName =
      extractMetaContent(html, 'property', 'og:site_name') ??
      extractMetaContent(html, 'name', 'application-name') ??
      hostLabel(finalUrl)

    const previewTitle = cleanTitle(
      extractMetaContent(html, 'property', 'og:title') ??
        extractMetaContent(html, 'name', 'twitter:title') ??
        extractTitle(html)
    )

    const previewDescription =
      host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be'
        ? pickYouTubeDescription(html)
        : host === 'github.com'
          ? pickGitHubDescription(html)
          : extractMetaContent(html, 'property', 'og:description') ??
            extractMetaContent(html, 'name', 'description')

    const previewImageUrl = toAbsoluteUrl(
      finalUrl,
      extractMetaContent(html, 'property', 'og:image') ??
        extractMetaContent(html, 'name', 'twitter:image')
    )

    return {
      previewTitle,
      previewSiteName,
      previewDescription:
        previewDescription ?? extractTitle(html) ?? null,
      previewImageUrl,
      previewFetchedAt: new Date().toISOString(),
    }
  } catch {
    return {
      previewTitle: null,
      previewSiteName: hostLabel(url),
      previewDescription: null,
      previewImageUrl: null,
      previewFetchedAt: new Date().toISOString(),
    }
  }
}
