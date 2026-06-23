export type ArchiveLibraryOptions = {
  shelf?: string | null
  priority?: number | null
  pinned?: boolean | null
}

export function normalizeLibraryShelf(
  shelf: string | null | undefined
): string | null {
  const normalized = shelf
    ?.trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized && normalized.length > 0 ? normalized : null
}

export function clampLibraryPriority(priority: unknown): number {
  const parsed = Number(priority)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.max(0, Math.min(Math.trunc(parsed), 5))
}
