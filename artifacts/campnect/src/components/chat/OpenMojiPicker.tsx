import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { OPENMOJI_EMOJIS, OPENMOJI_STICKERS, openMojiAssetUrl, type OpenMojiCategory, type OpenMojiSticker } from '../../features/openmoji/catalog'

type Mode = 'emoji' | 'sticker'
interface Props {
  initialMode: Mode
  onEmojiSelect: (emoji: string) => void
  onStickerSelect: (sticker: OpenMojiSticker) => void
  onClose: () => void
}

const emojiCategories = ['All', 'Smileys & Emotion', 'People & Body', 'Animals & Nature', 'Food & Drink', 'Travel & Places', 'Activities', 'Objects', 'Symbols', 'Flags'] as const
const stickerCategories = ['All', 'Reactions', 'Funny', 'Love', 'Celebration', 'Campus Life', 'Study', 'Food', 'Animals', 'Expressions'] as const

export function OpenMojiPicker({ initialMode, onEmojiSelect, onStickerSelect, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) onClose() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [onClose])

  const items = useMemo(() => {
    const source = mode === 'emoji' ? OPENMOJI_EMOJIS : OPENMOJI_STICKERS
    const needle = query.trim().toLowerCase()
    return source.filter((item) => {
      const inCategory = category === 'All' || (mode === 'emoji' ? item.category === category : (item as OpenMojiSticker).stickerCategory === category)
      const matches = !needle || `${item.name} ${item.keywords.join(' ')} ${item.emoji}`.toLowerCase().includes(needle)
      return inCategory && matches
    })
  }, [mode, query, category])
  const categories = mode === 'emoji' ? emojiCategories : stickerCategories
  const switchMode = (next: Mode) => { setMode(next); setCategory('All'); setQuery('') }

  return <div ref={rootRef} role="dialog" aria-label="Emoji and sticker picker" style={{ position: 'absolute', zIndex: 20, right: 12, bottom: 64, width: 'min(360px, calc(100vw - 24px))', maxHeight: 360, overflow: 'hidden', background: 'var(--color-surface)', border: '1px solid var(--chat-divider)', borderRadius: 16, boxShadow: '0 18px 50px rgba(0,0,0,.22)', padding: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
      {(['emoji', 'sticker'] as Mode[]).map((tab) => <button key={tab} type="button" onClick={() => switchMode(tab)} style={{ border: 0, borderRadius: 9, padding: '7px 10px', background: mode === tab ? 'var(--chat-accent-soft)' : 'transparent', color: 'var(--chat-text)', fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>{tab === 'emoji' ? 'Emoji' : 'Stickers'}</button>)}
      <button type="button" aria-label="Close picker" onClick={onClose} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--chat-text-muted)', cursor: 'pointer', display: 'flex' }}><X size={18}/></button>
    </div>
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 10, background: 'var(--chat-soft-surface)', border: '1px solid var(--chat-divider)' }}><Search size={15} color="var(--chat-text-muted)" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${mode}s`} style={{ border: 0, outline: 0, background: 'transparent', color: 'var(--chat-text)', width: '100%', fontSize: 13 }} /></label>
    <div style={{ display: 'flex', gap: 5, overflowX: 'auto', padding: '9px 0 7px' }}>{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} style={{ whiteSpace: 'nowrap', border: 0, borderRadius: 999, padding: '5px 8px', background: category === item ? 'var(--chat-accent)' : 'var(--chat-soft-surface)', color: category === item ? '#fff' : 'var(--chat-text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{item}</button>)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: mode === 'emoji' ? 'repeat(7, 1fr)' : 'repeat(4, 1fr)', gap: 5, overflowY: 'auto', maxHeight: 220, padding: 2 }}>
      {items.map((item) => <button key={`${mode}-${item.id}-${mode === 'sticker' ? (item as OpenMojiSticker).stickerCategory : ''}`} type="button" title={item.name} aria-label={item.name} onClick={() => mode === 'emoji' ? onEmojiSelect(item.emoji) : onStickerSelect(item as OpenMojiSticker)} style={{ minHeight: mode === 'emoji' ? 38 : 66, border: 0, background: 'transparent', borderRadius: 10, cursor: 'pointer', padding: mode === 'emoji' ? 6 : 8 }}>
        <img src={openMojiAssetUrl(item.id)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }} style={{ width: mode === 'emoji' ? 27 : 52, height: mode === 'emoji' ? 27 : 52, objectFit: 'contain' }} />
        <span hidden style={{ fontSize: mode === 'emoji' ? 24 : 42 }}>{item.emoji}</span>
      </button>)}
      {!items.length && <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--chat-text-muted)', fontSize: 13 }}>No {mode}s found.</p>}
    </div>
  </div>
}