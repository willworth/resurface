// apps/resurface/lib/server/snooze.ts


export type SnoozePreset =
  | 'tomorrow'
  | 'this-weekend'
  | 'next-week'
  | 'in-a-month'
  | 'surprise'

function nextWeekend(base: Date): Date {
  const copy = new Date(base)
  const day = copy.getDay()
  const daysUntilSaturday = (6 - day + 7) % 7 || 7
  copy.setDate(copy.getDate() + daysUntilSaturday)
  copy.setHours(9, 0, 0, 0)
  return copy
}

export function computeSnoozeUntil(
  preset: SnoozePreset,
  now = new Date()
): string {
  const target = new Date(now)

  switch (preset) {
    case 'tomorrow':
      target.setDate(target.getDate() + 1)
      break
    case 'this-weekend':
      return nextWeekend(now).toISOString()
    case 'next-week':
      target.setDate(target.getDate() + 7)
      break
    case 'in-a-month':
      target.setDate(target.getDate() + 30)
      break
    case 'surprise': {
      const randomDays = Math.floor(Math.random() * 28) + 3
      target.setDate(target.getDate() + randomDays)
      break
    }
    default:
      target.setDate(target.getDate() + 1)
      break
  }

  return target.toISOString()
}
