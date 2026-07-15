// apps/resurface/components/resurface-client.test.tsx

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ResurfaceClient } from './resurface-client'

const baseItem = {
  id: 'item-1',
  url: 'https://example.com',
  title: 'Example item',
  summary: null,
  originalText: 'Example original text',
  category: 'link',
  suggestedArchive: 'Links / General',
  tags: [],
  source: 'test',
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
  fingerprint: 'abc',
  snoozeCount: 0,
} as const

describe('ResurfaceClient keyboard shortcuts', () => {
  const originalFetch = global.fetch
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

  function installFetch(forceDecision = false) {
    let firstLoad = true

    global.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.startsWith('/api/items/next')) {
        return {
          ok: true,
          json: async () => ({
            item: firstLoad ? baseItem : null,
            forceDecision,
            remaining: 10,
          }),
        } as Response
      }

      if (
        url === '/api/items/item-1/archive' ||
        url === '/api/items/item-1/drop'
      ) {
        firstLoad = false
        return {
          ok: true,
          json: async () => ({ item: baseItem }),
        } as Response
      }

      if (url === '/api/items/item-1/snooze') {
        firstLoad = false
        return {
          ok: true,
          json: async () => ({ item: { ...baseItem, snoozeCount: 1 } }),
        } as Response
      }

      if (url === '/api/items/item-1/pass') {
        firstLoad = false
        return {
          ok: true,
          json: async () => ({ item: baseItem }),
        } as Response
      }

      throw new Error(
        `Unexpected fetch call: ${url} (${init?.method ?? 'GET'})`
      )
    }) as typeof fetch
  }

  beforeEach(() => {
    window.localStorage.clear()
    installFetch(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    global.fetch = originalFetch
    openSpy.mockRestore()
  })

  it('archives with A and opens URL with O', async () => {
    render(<ResurfaceClient />)

    await screen.findByText('Example item')

    await waitFor(() => {
      fireEvent.keyDown(window, { key: 'o' })
      expect(openSpy).toHaveBeenCalledWith(
        'https://example.com',
        '_blank',
        'noopener,noreferrer'
      )
    })

    fireEvent.keyDown(window, { key: 'a' })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/items/item-1/archive',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('puts the review item before capture and search', async () => {
    render(<ResurfaceClient />)

    const item = await screen.findByText('Example item')
    const capture = screen.getByRole('heading', { name: 'Capture' })
    const search = screen.getByLabelText('Search saved things')

    expect(
      item.compareDocumentPosition(capture) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      item.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('drops with D', async () => {
    render(<ResurfaceClient />)

    await screen.findByText('Example item')
    fireEvent.keyDown(window, { key: 'd' })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/items/item-1/drop',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('passes with N and excludes the item from the next load', async () => {
    render(<ResurfaceClient />)

    await screen.findByText('Example item')
    fireEvent.keyDown(window, { key: 'n' })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/items/item-1/pass',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/items/next?exclude=item-1',
        expect.objectContaining({ method: 'GET' })
      )
    })
  })

  it('disables snooze buttons in force-decision mode', async () => {
    installFetch(true)
    render(<ResurfaceClient />)

    await screen.findByText('Example item')

    // All snooze buttons should be disabled
    const snoozeButtons = screen.getAllByRole('button', {
      name: /1d|3d|1w|1m|\?/,
    })
    for (const btn of snoozeButtons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    }

    // Pressing a snooze key should not trigger a fetch
    const fetchCountBefore = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls.length
    fireEvent.keyDown(window, { key: '1' })
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      fetchCountBefore
    )
  })

  it('shows cached data and disables writes when the next item cannot load', async () => {
    window.localStorage.setItem(
      'resurface:read-cache:next-item',
      JSON.stringify({
        cachedAt: '2026-05-24T12:00:00.000Z',
        payload: {
          item: baseItem,
          forceDecision: false,
          remaining: 10,
        },
      })
    )

    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as typeof fetch

    render(<ResurfaceClient />)

    await screen.findByText('Example item')
    expect(
      screen.getByText(/Showing last cached item/)
    ).toHaveTextContent('Writes are disabled')

    expect(screen.getByRole('button', { name: /Keep/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Drop/ })).toBeDisabled()

    fireEvent.keyDown(window, { key: 'a' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
