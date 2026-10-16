import React, { useState, useEffect } from 'react'
import { parseApiDate, formatDeviceTime } from '../../utils/dateTime'

/**
 * Normalize a SQLite datetime string to a proper Date.
 * SQLite returns "YYYY-MM-DD HH:MM:SS" (space sep, no timezone) which is parsed
 * as local time in some JS engines and as NaN in others. We force UTC by
 * replacing the space with T and appending Z.
 */
export function normalizeDate(dateStr: string): Date {
  return parseApiDate(dateStr)
}

function timeAgo(dateStr: string): string {
  const date = normalizeDate(dateStr)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}y`
}

function clockTime(dateStr: string): string {
  return formatDeviceTime(dateStr)
}

interface TimeAgoProps {
  date: string
  style?: React.CSSProperties
  /** 'relative' shows "2m ago" style; 'clock' shows "9:41 AM" */
  mode?: 'relative' | 'clock'
}

export function TimeAgo({ date, style, mode = 'relative' }: TimeAgoProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (mode !== 'relative') return
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [mode])

  const text = !date ? 'Sending…' : mode === 'clock' ? clockTime(date) : timeAgo(date)

  return (
    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', ...style }}>
      {text}
    </span>
  )
}
