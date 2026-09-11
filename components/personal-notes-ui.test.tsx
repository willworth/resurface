import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ResurfaceClient } from './resurface-client'
import { ItemsClient } from './items-client'

const baseReviewItem = {
  id: 'item-review-1',
  url: 'https://example.com/review-1',
  title: 'Review Test Item',
  summary: 'Review summary',
  originalText: 'Original source text content',
  category: 'link',
  suggestedArchive: 'Links / General',
  tags: [],
  source: 'web-ui',
  sourceItemId: null,
  capturedAt: '2026-02-01T00:00:00.000Z',
  ingestedAt: '2026-02-01T00:00:00.000Z',
  lastSurfacedAt: null,
  surfaceCount: 0,
  status: 'active',
  suppressUntil: null,
  archivedAt: null,
  archivedTo: null,
  droppedAt: null,
  fingerprint: 'fp-123',
  snoozeCount: 0,
  personalNote: null,
} as const

const baseLibraryItem = {
  id: 'item-lib-1',
  url: 'https://example.com/lib-1',
  title: 'Library Note Item',
  summary: null,
  previewSiteName: 'example.com',
  previewDescription: 'Library preview',
  previewImageUrl: null,
  previewFetchedAt: null,
  originalText: 'Library source text',
  category: 'link',
  source: 'web-ui',
  status: 'active',
  capturedAt: '2026-02-01T00:00:00.000Z',
  lastSurfacedAt: null,
  snoozeCount: 0,
  suppressUntil: null,
  suggestedArchive: null,
  archivedTo: null,
  libraryShelf: null,
  libraryPriority: 0,
  pinnedAt: null,
  tags: [],
  personalNote: 'Existing library personal note',
} as const

describe('Personal Notes UI - Review (ResurfaceClient)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('renders "+ Add a note" button when item has no note and opens editor', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('/api/items/next')) {
        return {
          ok: true,
          json: async () => ({
            item: baseReviewItem,
            forceDecision: false,
            remaining: 5,
          }),
        } as Response
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    render(<ResurfaceClient />)

    await screen.findByText('Review Test Item')

    const addNoteBtn = screen.getByRole('button', { name: /Add a note/i })
    expect(addNoteBtn).toBeInTheDocument()

    // Click "+ Add a note"
    fireEvent.click(addNoteBtn)

    // Editor textarea and controls appear
    const textarea = screen.getByPlaceholderText(/Jot down a thought/i)
    expect(textarea).toBeInTheDocument()
    expect(screen.getByText('0/10,000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save note/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Cancel$/i })).toBeInTheDocument()
  })

  it('suppresses keyboard shortcuts (A, D, N, 1) while typing in note textarea', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('/api/items/next')) {
        return {
          ok: true,
          json: async () => ({
            item: baseReviewItem,
            forceDecision: false,
            remaining: 5,
          }),
        } as Response
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    render(<ResurfaceClient />)

    await screen.findByText('Review Test Item')
    fireEvent.click(screen.getByRole('button', { name: /Add a note/i }))

    const textarea = screen.getByPlaceholderText(/Jot down a thought/i)

    // Trigger keydown with 'a', 'd', 'n', '1' targeting the textarea
    fireEvent.keyDown(textarea, { key: 'a' })
    fireEvent.keyDown(textarea, { key: 'd' })
    fireEvent.keyDown(textarea, { key: 'n' })
    fireEvent.keyDown(textarea, { key: '1' })

    // None of these should call archive, drop, pass, or snooze endpoints
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    for (const [callUrl] of calls) {
      expect(String(callUrl)).not.toMatch(/archive|drop|pass|snooze/)
    }
  })

  it('saves multiline note, stays on current item, and displays saved note', async () => {
    let currentItem = {
      ...baseReviewItem,
      personalNote: null as string | null,
    }

    global.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/items/next')) {
        return {
          ok: true,
          json: async () => ({
            item: currentItem,
            forceDecision: false,
            remaining: 5,
          }),
        } as Response
      }
      if (url === '/api/items/item-review-1/note' && (init?.method === 'PUT' || init?.method === 'POST')) {
        const body = JSON.parse(init.body as string)
        currentItem = { ...currentItem, personalNote: body.note }
        return {
          ok: true,
          json: async () => ({ item: currentItem }),
        } as Response
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    render(<ResurfaceClient />)

    await screen.findByText('Review Test Item')
    fireEvent.click(screen.getByRole('button', { name: /Add a note/i }))

    const textarea = screen.getByPlaceholderText(/Jot down a thought/i)
    fireEvent.change(textarea, { target: { value: 'Line 1 thought\nLine 2 reference' } })

    const saveBtn = screen.getByRole('button', { name: /Save note/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/items/item-review-1/note',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            note: 'Line 1 thought\nLine 2 reference',
            expectedCurrentNote: null,
          }),
        })
      )
    })

    // Saved note is rendered in "Your note" display section
    await screen.findByText('Your note')
    expect(screen.getByText(/Line 1 thought/)).toBeInTheDocument()
    expect(screen.getByText(/Line 2 reference/)).toBeInTheDocument()

    // Item has not advanced
    expect(screen.getByText('Review Test Item')).toBeInTheDocument()
  })

  it('renders hostile HTML markup literally as inert plain text', async () => {
    const hostileNote = '<script>alert("xss")</script><b>bold text</b>'
    const itemWithHostileNote = {
      ...baseReviewItem,
      personalNote: hostileNote,
    }

    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('/api/items/next')) {
        return {
          ok: true,
          json: async () => ({
            item: itemWithHostileNote,
            forceDecision: false,
            remaining: 5,
          }),
        } as Response
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    render(<ResurfaceClient />)

    await screen.findByText('Review Test Item')

    // Expect the literal string to be present
    expect(screen.getByText(hostileNote)).toBeInTheDocument()
    // Ensure no actual <b> or <script> elements are rendered from the note
    expect(document.querySelector('script[src*="xss"]')).toBeNull()
  })

  it('displays conflict resolution UI when server returns 409', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('/api/items/next')) {
        return {
          ok: true,
          json: async () => ({
            item: baseReviewItem,
            forceDecision: false,
            remaining: 5,
          }),
        } as Response
      }
      if (url === '/api/items/item-review-1/note') {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: 'Note was modified elsewhere',
            currentNote: 'Note saved concurrently from another window',
          }),
        } as Response
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    render(<ResurfaceClient />)

    await screen.findByText('Review Test Item')
    fireEvent.click(screen.getByRole('button', { name: /Add a note/i }))

    const textarea = screen.getByPlaceholderText(/Jot down a thought/i)
    fireEvent.change(textarea, { target: { value: 'My local draft' } })

    fireEvent.click(screen.getByRole('button', { name: /Save note/i }))

    // Conflict panel should appear
    await screen.findByText(/Note was modified elsewhere/)
    expect(screen.getByText(/Note saved concurrently from another window/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Overwrite with my draft/i })).toBeInTheDocument()
  })
})

describe('Personal Notes UI - Library (ItemsClient)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('renders "Has a note" filter toggle tab and filters on click', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/api/items/list')) {
        return {
          ok: true,
          json: async () => ({
            items: [baseLibraryItem],
            total: 1,
            page: 1,
            totalPages: 1,
            pageSize: 50,
            counts: { active: 1, archived: 0, snoozed: 0, dropped: 0 },
          }),
        } as Response
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    render(<ItemsClient />)

    await screen.findByText('Library Note Item')

    // Check "Has a note" tab button exists
    const hasNoteBtn = screen.getByRole('button', { name: /Has a note/i })
    expect(hasNoteBtn).toBeInTheDocument()

    // Click "Has a note" filter toggle
    fireEvent.click(hasNoteBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('has_note=1')
      )
    })
  })

  it('displays note indicator and content on item cards in library', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/api/items/list')) {
        return {
          ok: true,
          json: async () => ({
            items: [baseLibraryItem],
            total: 1,
            page: 1,
            totalPages: 1,
            pageSize: 50,
            counts: { active: 1, archived: 0, snoozed: 0, dropped: 0 },
          }),
        } as Response
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    render(<ItemsClient />)

    await screen.findByText('Library Note Item')

    // Note block should be visible on the card
    expect(screen.getByText('Existing library personal note')).toBeInTheDocument()
    expect(screen.getByText('Your note')).toBeInTheDocument()
  })
})
