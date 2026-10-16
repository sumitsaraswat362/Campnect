import { parseApiDate } from './dateTime'

type Timestamp = string | Date | null | undefined

function localDateParts(value: Timestamp, timeZone?: string) {
  const date = parseApiDate(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const read = (name: string) => Number(parts.find((part) => part.type === name)?.value)
  return { year: read('year'), month: read('month'), day: read('day') }
}

function calendarDayNumber(parts: NonNullable<ReturnType<typeof localDateParts>>) {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000
}

export function parseServerTimestamp(value: Timestamp): Date {
  return parseApiDate(value)
}

export function formatChatMessageTime(value: Timestamp, timeZone?: string): string {
  const date = parseServerTimestamp(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function getChatDateGroup(value: Timestamp, now: Date = new Date(), timeZone?: string): 'today' | 'yesterday' | 'date' | 'invalid' {
  const dateParts = localDateParts(value, timeZone)
  const nowParts = localDateParts(now, timeZone)
  if (!dateParts || !nowParts) return 'invalid'
  const difference = calendarDayNumber(nowParts) - calendarDayNumber(dateParts)
  if (difference === 0) return 'today'
  if (difference === 1) return 'yesterday'
  return 'date'
}

export function getChatLocalDateKey(value: Timestamp, timeZone?: string): string {
  const parts = localDateParts(value, timeZone)
  return parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : ''
}

export function formatChatDateDivider(value: Timestamp, now: Date = new Date(), timeZone?: string): string {
  const date = parseServerTimestamp(value)
  const group = getChatDateGroup(date, now, timeZone)
  if (group === 'today') return 'Today'
  if (group === 'yesterday') return 'Yesterday'
  if (group === 'invalid') return 'Unknown date'

  const dateParts = localDateParts(date, timeZone)
  const nowParts = localDateParts(now, timeZone)
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'short',
    day: 'numeric',
    ...(dateParts?.year !== nowParts?.year ? { year: 'numeric' } : {}),
  }).format(date)
}

export function formatChatLastSeen(value: Timestamp, now: Date = new Date(), timeZone?: string): string {
  const date = parseServerTimestamp(value)
  if (Number.isNaN(date.getTime())) return 'Last seen recently'
  const time = formatChatMessageTime(date, timeZone)
  const group = getChatDateGroup(date, now, timeZone)
  if (group === 'today') return `Last seen today at ${time}`
  if (group === 'yesterday') return `Last seen yesterday at ${time}`
  if (group === 'date') {
    const label = new Intl.DateTimeFormat(undefined, { timeZone, month: 'short', day: 'numeric' }).format(date)
    return `Last seen ${label} at ${time}`
  }
  return 'Last seen recently'
}