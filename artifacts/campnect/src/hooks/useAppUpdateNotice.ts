import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { AppVersion } from '../capacitor/plugins'
import { appUpdateApi, type AppUpdateNotice } from '../api/appUpdate'

const dismissalKey = (updatedAt: string) => `campnect:update-notice-dismissed:${updatedAt}`

export function useAppUpdateNotice() {
  const [notice, setNotice] = useState<AppUpdateNotice | null>(null)

  const refresh = useCallback(async () => {
    if (Capacitor.getPlatform() !== 'android') {
      setNotice(null)
      return
    }
    try {
      const response = await appUpdateApi.get()
      const next = response.data
      if (!next.enabled) return setNotice(null)
      const appInfo = await AppVersion.get()
      if (!Number.isSafeInteger(appInfo.versionCode) || appInfo.versionCode >= next.minimumVersionCode) {
        return setNotice(null)
      }
      if (next.mode === 'soft' && localStorage.getItem(dismissalKey(next.updatedAt)) === '1') {
        return setNotice(null)
      }
      setNotice(next)
    } catch {
      // Update notices must never prevent someone from opening the app when
      // the status endpoint is temporarily unavailable.
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [refresh])

  const dismiss = useCallback(() => {
    if (!notice || notice.mode === 'force') return
    localStorage.setItem(dismissalKey(notice.updatedAt), '1')
    setNotice(null)
  }, [notice])

  return { notice, dismiss }
}