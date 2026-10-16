/**
 * Date/time helpers for user-facing values.
 *
 * The API stores instants in UTC. Formatting deliberately omits a `timeZone`
 * option so the browser/Capacitor runtime uses the device's current timezone
 * and locale (including daylight-saving changes).
 */
export function parseApiDate(value: string | Date | null | undefined): Date {
  if (value instanceof Date) return value
  if (!value) return new Date(NaN)

  const raw = String(value).trim()
  if (!raw) return new Date(NaN)
  if (raw.includes('T')) {
    return /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? new Date(raw) : new Date(`${raw}Z`)
  }
  // PostgreSQL/SQLite may return a UTC timestamp with a space separator.
  return new Date(`${raw.replace(' ', 'T')}Z`)
}

export function formatDeviceDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' },
): string {
  const date = parseApiDate(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString(undefined, options)
}

export function formatDeviceTime(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' },
): string {
  const date = parseApiDate(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleTimeString(undefined, options)
}

export function isSameDeviceDay(a: string | Date, b: Date = new Date()): boolean {
  const date = parseApiDate(a)
  return !Number.isNaN(date.getTime()) && date.toLocaleDateString() === b.toLocaleDateString()
}

/**
 * Telegram-style "last seen" label:
 *  - today            → "xx:xx AM/PM"
 *  - yesterday        → "yesterday at xx:xx AM/PM"
 *  - within a week    → "last seen a week ago"
 *  - older            → "last seen a long time ago"
 */
export function formatLastSeen(value: string | Date | null | undefined): string {
  const date = parseApiDate(value)
  if (Number.isNaN(date.getTime())) return 'last seen a long time ago'

  const now = new Date()
  const diffMinutes = (now.getTime() - date.getTime()) / 60_000
  // Someone hiding their online status still surfaces a last-seen row, but a
  // near-live timestamp (they're online right now) would leak that they're
  // active — collapse anything under 5 minutes into a vague "recently".
  if (diffMinutes < 5) return 'last seen recently'

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  if (isSameDeviceDay(date, now)) return `last seen at ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDeviceDay(date, yesterday)) return `last seen yesterday at ${time}`

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (diffDays <= 7) return 'last seen a week ago'
  return 'last seen a long time ago'
}