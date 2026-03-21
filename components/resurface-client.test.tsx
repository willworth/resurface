// apps/resurface/components/resurface-client.test.tsx

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

      if (url === '/api/items/next') {
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

      throw new Error(
        `Unexpected fetch call: ${url} (${init?.method ?? 'GET'})`
      )
    }) as typeof fetch
  }

  beforeEach(() => {
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
})
