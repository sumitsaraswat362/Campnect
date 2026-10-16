import { DEMO_MODE } from '../demo/config'
import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../api/client'

export interface MaintenanceStatus {
  enabled: boolean
  message: string
}

const POLL_INTERVAL_MS = 15000

/**
 * Polls the public maintenance-status endpoint so an admin toggling
 * maintenance mode takes effect for every open app instance (web and the
 * Android app, which always talks to this live backend) within seconds —
 * no app reload, rebuild, or republish required.
 */
export function useMaintenanceStatus(): MaintenanceStatus {
  const [status, setStatus] = useState<MaintenanceStatus>({ enabled: false, message: '' })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (DEMO_MODE) return

    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/maintenance`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!mountedRef.current) return
        setStatus({ enabled: Boolean(data?.enabled), message: String(data?.message || '') })
      } catch {
        // Network hiccup: keep the last known status rather than flipping
        // the app into (or out of) maintenance on a transient failure.
      }
    }

    void check()
    const interval = window.setInterval(check, POLL_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      mountedRef.current = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  return status
}
