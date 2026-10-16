import { DEMO_MODE } from '../demo/config'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip } from '../api/clips'
import { mediaUrl } from '../utils/mediaUrl'
import { clipMountedWindow } from './useClipPlayback'

type NetworkConnection = { saveData?: boolean; effectiveType?: string }
type Preparation = 'loading' | 'ready' | 'failed'

export function clipPreparationConcurrency(connection?: NetworkConnection) {
  return connection?.saveData || /(^|-)2g/.test(connection?.effectiveType || '') ? 1 : 2
}

/** Controls which already-mounted video elements receive a source. */
export function useClipPreloadScheduler(clips: Clip[], active: number) {
  const entries = useRef(new Map<string, { url: string; state: Preparation }>())
  const wanted = useRef(new Set<string>())
  const failed = useRef(new Set<string>())
  const [prepared, setPrepared] = useState<Set<string>>(() => new Set())

  const pump = useCallback(() => {
    const connection = (navigator as Navigator & { connection?: NetworkConnection }).connection
    const limit = clipPreparationConcurrency(connection)
    let loading = [...entries.current.values()].filter(entry => entry.state === 'loading').length
    const current = clips[active]
    if (current && !entries.current.has(current.id) && loading >= limit) {
      const cancelled: string[] = []
      for (const [id, entry] of entries.current) {
        if (loading < limit) break
        if (id === current.id || entry.state !== 'loading') continue
        entries.current.delete(id)
        cancelled.push(id)
        loading -= 1
      }
      if (cancelled.length) {
        setPrepared(previous => {
          const next = new Set(previous)
          for (const id of cancelled) next.delete(id)
          return next
        })
      }
    }
    // Only actively prepare the current Clip and its immediate successor.
    // Mounted distant elements retain metadata-only browser behavior and never
    // receive a full media preparation simply because they are in the DOM.
    const ordered = [active, active + 1]
      .filter(index => index >= 0 && index < clips.length)
      .map(index => clips[index])
      .filter((clip): clip is Clip => Boolean(clip))
      .sort((a, b) => (a.id === current?.id ? -1 : b.id === current?.id ? 1 : 0))
    const urls = new Set([...entries.current.values()].map(entry => entry.url))

    for (const clip of ordered) {
      const url = mediaUrl(clip.media?.[0])
      if (DEMO_MODE && url?.startsWith('/api/media/')) continue
      if (!url || urls.has(url) || entries.current.has(clip.id) || (failed.current.has(clip.id) && clip.id !== current?.id) || loading >= limit) continue
      urls.add(url)
      entries.current.set(clip.id, { url, state: 'loading' })
      loading += 1
      setPrepared(previous => new Set(previous).add(clip.id))
    }
  }, [active, clips])

  useEffect(() => {
    const keep = new Set(clipMountedWindow(active, clips.length).map(index => clips[index]?.id).filter(Boolean) as string[])
    wanted.current = keep
    for (const [id] of entries.current) {
      if (!keep.has(id)) entries.current.delete(id)
    }
    for (const id of failed.current) {
      if (!keep.has(id)) failed.current.delete(id)
    }
    setPrepared(previous => new Set([...previous].filter(id => keep.has(id))))
    pump()
  }, [active, clips, pump])

  const settle = useCallback((id: string, outcomeFailed = false) => {
    const entry = entries.current.get(id)
    if (!entry || !wanted.current.has(id)) return
    entry.state = outcomeFailed ? 'failed' : 'ready'
    // Failed inactive sources remain unprepared; they do not retry in the
    // background, but may receive the active clip's signed-URL retry path.
    if (outcomeFailed) {
      failed.current.add(id)
      entries.current.delete(id)
      setPrepared(previous => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
    } else {
      failed.current.delete(id)
    }
    pump()
  }, [pump])

  return { prepared, settle }
}