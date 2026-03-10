// apps/resurface/lib/server/snooze.test.ts

// packages/apps/resurface/lib/server/snooze.test.ts

import { computeSnoozeUntil } from './snooze'

describe('computeSnoozeUntil', () => {
  const base = new Date('2026-02-15T10:00:00.000Z')

  it('computes tomorrow', () => {
    const until = new Date(computeSnoozeUntil('tomorrow', base))
    expect(until.getUTCDate()).toBe(16)
  })

  it('computes next week', () => {
    const until = new Date(computeSnoozeUntil('next-week', base))
    expect(until.getUTCDate()).toBe(22)
  })

  it('computes in a month as +30 days', () => {
    const until = new Date(computeSnoozeUntil('in-a-month', base))
    expect(until.getUTCDate()).toBe(17)
    expect(until.getUTCMonth()).toBe(2)
  })

  it('computes weekend as saturday 09:00 local', () => {
    const friday = new Date('2026-02-13T10:00:00.000Z')
    const until = new Date(computeSnoozeUntil('this-weekend', friday))
    expect(until.getUTCDay()).toBe(6)
  })
})
