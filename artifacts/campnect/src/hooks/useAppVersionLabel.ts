import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { AppVersion } from '../capacitor/plugins'

/** Native screens show the installed package version; web uses the build version. */
export function useAppVersionLabel(): string {
  const [label, setLabel] = useState(() =>
    Capacitor.isNativePlatform() ? 'Checking version…' : `Version ${import.meta.env.VITE_APP_VERSION}`,
  )

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    void AppVersion.get()
      .then(({ versionName }) => {
        if (!versionName?.trim()) throw new Error('The installed app version is missing')
        if (!cancelled) setLabel(`Version ${versionName}`)
      })
      .catch((error) => {
        console.warn('Campnect could not read the installed app version.', error)
        if (!cancelled) setLabel('Version unavailable')
      })
    return () => { cancelled = true }
  }, [])

  return label
}