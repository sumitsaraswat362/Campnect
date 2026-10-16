import { useEffect, useRef, useState, type UIEvent } from 'react'
import { Search, X } from 'lucide-react'
import { OPENMOJI_EMOJIS, openMojiAssetUrl } from '../../features/openmoji/catalog'
import {
  fetchGiphy,
  GIPHY_PAGE_SIZE,
  trackGiphyAction,
  type GiphyKind,
  type GiphyResult,
  type GiphySelection,
} from '../../features/giphy/provider'

type PickerMode = 'emoji' | GiphyKind

interface Props {
  initialMode: PickerMode
  onEmojiSelect: (emoji: string) => void
  onGiphySelect: (selection: GiphySelection, kind: GiphyKind) => void
  onClose: () => void
}

const emojiCategories = ['All', 'Smileys & Emotion', 'People & Body', 'Animals & Nature', 'Food & Drink', 'Travel & Places', 'Activities', 'Objects', 'Symbols', 'Flags'] as const

export function GiphyPicker({ initialMode, onEmojiSelect, onGiphySelect, onClose }: Props) {
  const [mode, setMode] = useState<PickerMode>(initialMode)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [results, setResults] = useState<GiphyResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const requestIdRef = useRef(0)
  const trackedViewsRef = useRef(new Set<string>())
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  useEffect(() => {
    if (mode === 'emoji') {
      setResults([])
      setLoading(false)
      setError('')
      return
    }
    let timer: number | undefined
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    offsetRef.current = 0
    setHasMore(true)
    setResults([])
    timer = window.setTimeout(() => {
      fetchGiphy(mode, query, 0, controller.signal)
        .then((next) => {
          if (requestId !== requestIdRef.current) return
          setResults(next)
          setHasMore(next.length >= GIPHY_PAGE_SIZE)
        })
        .catch((reason: unknown) => {
          if (requestId !== requestIdRef.current || (reason as Error)?.name === 'AbortError') return
          setError(reason instanceof Error ? reason.message : 'GIPHY could not load results.')
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false)
        })
    }, 500)
    return () => {
      if (timer) window.clearTimeout(timer)
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [mode, query])

  useEffect(() => {
    for (const item of results) {
      if (trackedViewsRef.current.has(item.providerId)) continue
      trackedViewsRef.current.add(item.providerId)
      trackGiphyAction(item, 'view')
    }
  }, [results])

  function switchMode(next: PickerMode) {
    setMode(next)
    setCategory('All')
    setQuery('')
    trackedViewsRef.current.clear()
  }

  async function loadMore() {
    if (mode === 'emoji' || loading || !hasMore) return
    const nextOffset = offsetRef.current + GIPHY_PAGE_SIZE
    const requestId = requestIdRef.current
    setLoading(true)
    setError('')
    try {
      const next = await fetchGiphy(mode, query, nextOffset, controllerRef.current?.signal)
      if (requestId !== requestIdRef.current) return
      setResults((current) => {
        const known = new Set(current.map((item) => item.providerId))
        return [...current, ...next.filter((item) => !known.has(item.providerId))]
      })
      offsetRef.current = nextOffset
      setHasMore(next.length >= GIPHY_PAGE_SIZE)
    } catch (reason: unknown) {
      if (requestId === requestIdRef.current && (reason as Error)?.name !== 'AbortError') {
        setError(reason instanceof Error ? reason.message : 'GIPHY could not load results.')
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }

  function handleResultsScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 80) void loadMore()
  }

  const emojiItems = OPENMOJI_EMOJIS.filter((item) => {
    const needle = query.trim().toLowerCase()
    const inCategory = category === 'All' || item.category === category
    return inCategory && (!needle || `${item.name} ${item.keywords.join(' ')} ${item.emoji}`.toLowerCase().includes(needle))
  })
  const isEmoji = mode === 'emoji'

  return (
    <div ref={rootRef} role="dialog" aria-label="Emoji, sticker, and GIF picker" style={{ position: 'absolute', zIndex: 20, right: 12, bottom: 64, width: 'min(380px, calc(100vw - 24px))', maxHeight: 390, overflow: 'hidden', background: 'var(--chat-overlay-surface)', border: '1px solid var(--chat-divider)', borderRadius: 16, boxShadow: 'var(--chat-overlay-shadow)', padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        {(['emoji', 'sticker', 'gif'] as PickerMode[]).map((tab) => (
          <button key={tab} type="button" onClick={() => switchMode(tab)} style={{ border: 0, borderRadius: 9, padding: '7px 10px', background: mode === tab ? 'var(--chat-accent-soft)' : 'transparent', color: 'var(--chat-text)', fontWeight: 800, cursor: 'pointer' }}>
            {tab === 'emoji' ? 'Emoji' : tab === 'sticker' ? 'Stickers' : 'GIFs'}
          </button>
        ))}
        <button type="button" aria-label="Close picker" onClick={onClose} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--chat-text-muted)', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 10, background: 'var(--chat-soft-surface)', border: '1px solid var(--chat-divider)' }}>
        <Search size={15} color="var(--chat-text-muted)" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${isEmoji ? 'emoji' : mode === 'sticker' ? 'stickers' : 'GIFs'}`} style={{ border: 0, outline: 0, background: 'transparent', color: 'var(--chat-text)', width: '100%', fontSize: 13 }} />
      </label>
      {isEmoji && (
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', padding: '9px 0 7px' }}>
          {emojiCategories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} style={{ whiteSpace: 'nowrap', border: 0, borderRadius: 999, padding: '5px 8px', background: category === item ? 'var(--chat-accent)' : 'var(--chat-soft-surface)', color: category === item ? '#fff' : 'var(--chat-text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{item}</button>)}
        </div>
      )}
      <div onScroll={handleResultsScroll} style={{ display: 'grid', gridTemplateColumns: isEmoji ? 'repeat(7, 1fr)' : 'repeat(4, 1fr)', gap: 5, overflowY: 'auto', maxHeight: 235, padding: 2 }}>
        {isEmoji ? emojiItems.map((item) => (
          <button key={item.id} type="button" title={item.name} aria-label={item.name} onClick={() => onEmojiSelect(item.emoji)} style={{ minHeight: 38, border: 0, background: 'transparent', borderRadius: 10, cursor: 'pointer', padding: 6 }}>
            <img src={openMojiAssetUrl(item.id)} alt="" loading="lazy" style={{ width: 27, height: 27, objectFit: 'contain' }} />
            <span hidden style={{ fontSize: 24 }}>{item.emoji}</span>
          </button>
        )) : results.map((item) => (
          <button key={item.providerId} type="button" title={item.altText} aria-label={item.altText} onClick={() => {
            trackGiphyAction(item, 'click')
            trackGiphyAction(item, 'send')
            onGiphySelect({
              provider: item.provider,
              providerId: item.providerId,
              renditionUrl: item.renditionUrl,
              width: item.width,
              height: item.height,
              altText: item.altText,
              creatorName: item.creatorName,
              creatorUrl: item.creatorUrl,
            }, mode)
          }} style={{ minHeight: 70, border: 0, background: 'var(--chat-soft-surface)', borderRadius: 10, cursor: 'pointer', padding: 4, overflow: 'hidden' }}>
            <img src={item.renditionUrl} alt={item.altText} loading="lazy" style={{ display: 'block', width: '100%', height: 65, objectFit: 'contain' }} />
          </button>
        ))}
        {!loading && !error && ((isEmoji && !emojiItems.length) || (!isEmoji && !results.length)) && <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--chat-text-muted)', fontSize: 13 }}>No {isEmoji ? 'emoji' : mode === 'sticker' ? 'stickers' : 'GIFs'} found.</p>}
        {loading && <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--chat-text-muted)', fontSize: 13 }}>Loading…</p>}
        {error && <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#b52d49', fontSize: 13 }}>{error}</p>}
      </div>
      {!isEmoji && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 7, minHeight: 18 }}>
        <span style={{ fontSize: 10, color: 'var(--chat-text-muted)', fontWeight: 700 }}>Powered by GIPHY</span>
        {hasMore && !loading && <span style={{ fontSize: 10, color: 'var(--chat-text-muted)' }}>Scroll for more</span>}
      </div>}
    </div>
  )
}