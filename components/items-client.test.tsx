import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ItemsClient } from './items-client'

const mockActiveItem = {
  id: 'item-active',
  url: 'https://example.com/active',
  title: 'Active Link',
  summary: null,
  previewSiteName: 'example.com',
  previewDescription: 'Active Description',
  previewImageUrl: null,
  previewFetchedAt: null,
  originalText: 'Active text',
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
}

const mockArchivedItem = {
  ...mockActiveItem,
  id: 'item-archived',
  title: 'Archived Note',
  status: 'archived',
  archivedTo: 'Reference',
}

const mockDroppedItem = {
  ...mockActiveItem,
  id: 'item-dropped',
  title: 'Discarded Link',
  status: 'dropped',
}

describe('ItemsClient UI actions and Bin visibility', () => {
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

  it('renders visible Bin tab in library navigation with count', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/api/items/list')) {
        return {
          ok: true,
          json: async () => ({
            items: [mockActiveItem],
            total: 1,
            page: 1,
            totalPages: 1,
            pageSize: 50,
            counts: { active: 1, archived: 0, snoozed: 0, dropped: 3 },
          }),
        } as Response
      }
      throw new Error(`Unexpected: ${url}`)
    }) as typeof fetch

    render(<ItemsClient />)

    await screen.findByText('Active Link')

    // Bin tab is visible in Shelf tabs
    const binTab = screen.getByRole('button', { name: /Bin \(3\)/ })
    expect(binTab).toBeInTheDocument()

    // Archived tab is visible with "Archived" label
    expect(screen.getByRole('button', { name: /Archived/ })).toBeInTheDocument()
  })

  it('provides a direct Discard button on normal cards and allows Undo', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/api/items/list')) {
        return {
          ok: true,
          json: async () => ({
            items: [mockActiveItem],
            total: 1,
            page: 1,
            totalPages: 1,
            pageSize: 50,
            counts: { active: 1, archived: 0, snoozed: 0, dropped: 0 },
          }),
        } as Response
      }
      if (url === '/api/items/item-active/drop') {
        return { ok: true, json: async () => ({ item: mockDroppedItem }) } as Response
      }
      if (url === '/api/items/item-active/restore') {
        return { ok: true, json: async () => ({ item: mockActiveItem }) } as Response
      }
      throw new Error(`Unexpected: ${url}`)
    }) as typeof fetch

    render(<ItemsClient />)

    await screen.findByText('Active Link')

    // Direct Discard button outside the menu
    const discardBtn = screen.getByRole('button', { name: 'Discard' })
    expect(discardBtn).toBeInTheDocument()

    // Click Discard
    fireEvent.click(discardBtn)

    // Item card removed and Undo banner appears
    await waitFor(() => {
      expect(screen.queryByText('Active Link')).not.toBeInTheDocument()
      expect(screen.getByText(/Discarded “Active Link”/)).toBeInTheDocument()
    })

    // Click Undo
    const undoBtn = screen.getByRole('button', { name: 'Undo' })
    fireEvent.click(undoBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/items/item-active/restore',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('renders direct Restore button when viewing Bin and restores on click', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/api/items/list')) {
        return {
          ok: true,
          json: async () => ({
            items: [mockDroppedItem],
            total: 1,
            page: 1,
            totalPages: 1,
            pageSize: 50,
            counts: { active: 0, archived: 0, snoozed: 0, dropped: 1 },
          }),
        } as Response
      }
      if (url === '/api/items/item-dropped/restore') {
        return { ok: true, json: async () => ({ item: mockActiveItem }) } as Response
      }
      throw new Error(`Unexpected: ${url}`)
    }) as typeof fetch

    render(<ItemsClient />)

    await screen.findByText('Discarded Link')

    // Direct Restore button is present
    const restoreBtn = screen.getByRole('button', { name: 'Restore' })
    expect(restoreBtn).toBeInTheDocument()

    fireEvent.click(restoreBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/items/item-dropped/restore',
        expect.objectContaining({ method: 'POST' })
      )
      expect(screen.queryByText('Discarded Link')).not.toBeInTheDocument()
    })
  })

  it('renders Review button on archived cards to return to review', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/api/items/list')) {
        return {
          ok: true,
          json: async () => ({
            items: [mockArchivedItem],
            total: 1,
            page: 1,
            totalPages: 1,
            pageSize: 50,
            counts: { active: 0, archived: 1, snoozed: 0, dropped: 0 },
          }),
        } as Response
      }
      if (url === '/api/items/item-archived/unarchive') {
        return { ok: true, json: async () => ({ item: mockActiveItem }) } as Response
      }
      throw new Error(`Unexpected: ${url}`)
    }) as typeof fetch

    render(<ItemsClient />)

    await screen.findByText('Archived Note')

    // Review button is visible for archived item
    const reviewBtn = screen.getByRole('button', { name: 'Review' })
    expect(reviewBtn).toBeInTheDocument()

    fireEvent.click(reviewBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/items/item-archived/unarchive',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('handles failed discard action without falsely reporting success', async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/api/items/list')) {
        return {
          ok: true,
          json: async () => ({
            items: [mockActiveItem],
            total: 1,
            page: 1,
            totalPages: 1,
            pageSize: 50,
            counts: { active: 1, archived: 0, snoozed: 0, dropped: 0 },
          }),
        } as Response
      }
      if (url === '/api/items/item-active/drop') {
        return {
          ok: false,
          json: async () => ({ error: 'Database locked' }),
        } as Response
      }
      throw new Error(`Unexpected: ${url}`)
    }) as typeof fetch

    render(<ItemsClient />)

    await screen.findByText('Active Link')

    const discardBtn = screen.getByRole('button', { name: 'Discard' })
    fireEvent.click(discardBtn)

    await waitFor(() => {
      expect(screen.getByText('Database locked')).toBeInTheDocument()
      // Card remains visible
      expect(screen.getByText('Active Link')).toBeInTheDocument()
    })
  })
})
