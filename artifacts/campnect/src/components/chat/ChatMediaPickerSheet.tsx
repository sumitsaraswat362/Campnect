import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Film, ImageIcon, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getRecentNativeMedia, hasNativeMediaGallery, NativeGalleryMedia, readNativeMedia } from '../../capacitor/photoGallery'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { MediaGridSkeleton } from '../shared/AppSkeletons'
import { mediaUploadError, mediaUploadSizeError } from '../../utils/mediaUploadPolicy'

const MAX_SELECTED_MEDIA = 10
type ChatGalleryMediaType = 'image' | 'video'

type LocalMedia = {
  id: string
  file: File
  preview: string
  mediaType: ChatGalleryMediaType
}

type ChatMediaPickerSheetProps = {
  open: boolean
  disabled?: boolean
  onClose: () => void
  onSendMedia: (file: File, type: ChatGalleryMediaType) => Promise<void> | void
}

type SectionFilter = 'all' | ChatGalleryMediaType

export function ChatMediaPickerSheet({ open, disabled, onClose, onSendMedia }: ChatMediaPickerSheetProps) {
  const [nativeMedia, setNativeMedia] = useState<NativeGalleryMedia[]>([])
  const [localMedia, setLocalMedia] = useState<LocalMedia[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [galleryError, setGalleryError] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all')
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nativeGallery = hasNativeMediaGallery()

  useBackDismiss(open, onClose, 360)

  useEffect(() => {
    if (!open) return
    setSelectedIds([])
    setGalleryError('')
    setSectionFilter('all')
    setSectionMenuOpen(false)
    if (!nativeGallery) return
    setLoading(true)
    getRecentNativeMedia()
      .then(setNativeMedia)
      .catch(() => {
        setGalleryError('Allow photo and video access to show recent media here.')
        setNativeMedia([])
      })
      .finally(() => setLoading(false))
  }, [open, nativeGallery])

  useEffect(() => {
    return () => localMedia.forEach((media) => URL.revokeObjectURL(media.preview))
  }, [localMedia])

  const allMedia = useMemo(() => {
    const local = localMedia.map((media) => ({
      id: media.id,
      name: media.file.name,
      thumbnail: media.preview,
      mediaType: media.mediaType,
      thumbnailIsVideo: media.mediaType === 'video',
    }))
    return nativeGallery
      ? nativeMedia.map((media) => ({ ...media, thumbnailIsVideo: false }))
      : local
  }, [localMedia, nativeGallery, nativeMedia])

  // Only offer a section in the dropdown when the gallery actually has media
  // of that type — an empty section is confusing filler.
  const sections = useMemo(() => {
    const videoCount = allMedia.filter((media) => media.mediaType === 'video').length
    const photoCount = allMedia.filter((media) => media.mediaType === 'image').length
    const options: { key: SectionFilter; label: string }[] = [{ key: 'all', label: 'Recents' }]
    if (photoCount) options.push({ key: 'image', label: 'Photos' })
    if (videoCount) options.push({ key: 'video', label: 'Videos' })
    return options
  }, [allMedia])

  // If the gallery refreshes and the active filter's section disappeared
  // (e.g. it emptied out), fall back to "Recents" instead of showing a
  // dead-end empty grid with no way out.
  useEffect(() => {
    if (sectionFilter === 'all') return
    if (!sections.some((section) => section.key === sectionFilter)) setSectionFilter('all')
  }, [sections, sectionFilter])

  const visibleMedia = useMemo(
    () => (sectionFilter === 'all' ? allMedia : allMedia.filter((media) => media.mediaType === sectionFilter)),
    [allMedia, sectionFilter],
  )

  const activeSectionLabel = sections.find((section) => section.key === sectionFilter)?.label || 'Recents'

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id)
      if (current.length >= MAX_SELECTED_MEDIA) {
        toast.error(`Select up to ${MAX_SELECTED_MEDIA} media items at once.`)
        return current
      }
      return [...current, id]
    })
  }

  function handleLocalFiles(files: FileList | null) {
    if (!files) return
    const selectedMedia = Array.from(files)
      .map((file) => {
        const mediaType: ChatGalleryMediaType | null = file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
            ? 'video'
            : null
        const sizeError = mediaType ? mediaUploadSizeError(file) : null
        if (sizeError) toast.error(sizeError)
        if (sizeError) return null
        return mediaType ? { file, mediaType } : null
      })
      .filter((media): media is { file: File; mediaType: ChatGalleryMediaType } => Boolean(media))
      .slice(0, MAX_SELECTED_MEDIA)
      .map(({ file, mediaType }, index) => ({
        id: `local-${Date.now()}-${index}`,
        file,
        preview: URL.createObjectURL(file),
        mediaType,
      }))
    if (!selectedMedia.length && files.length) {
      toast.error('Choose photos or videos from your gallery.')
    }
    setLocalMedia((current) => {
      current.forEach((media) => {
        if (media.preview) URL.revokeObjectURL(media.preview)
      })
      return selectedMedia
    })
    setSelectedIds(selectedMedia.map((media) => media.id))
  }

  async function sendSelected() {
    if (!selectedIds.length || sending || disabled) return
    setSending(true)
    try {
      for (const id of selectedIds) {
        const localItem = localMedia.find((media) => media.id === id)
        const nativeItem = nativeMedia.find((media) => media.id === id)
        const file = localItem?.file || (nativeItem ? await readNativeMedia(nativeItem) : null)
        const mediaType = localItem?.mediaType || nativeItem?.mediaType
        if (file && mediaType) {
          const error = await mediaUploadError(file, mediaType)
          if (error) {
            toast.error(error)
            return
          }
          await onSendMedia(file, mediaType)
        }
      }
      onClose()
    } catch {
      toast.error('One or more media items could not be sent.')
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="chat-media-picker-layer" data-swipe-ignore>
      <button type="button" className="chat-media-picker-backdrop" aria-label="Close media gallery" onClick={onClose} />
      <section className="chat-media-picker-sheet" role="dialog" aria-modal="true" aria-label="Choose recent photos or videos">
        <div className="chat-media-picker-handle" />
        <header className="chat-media-picker-header">
          <div className="chat-media-picker-section">
            <button
              type="button"
              className="chat-media-picker-title"
              disabled={sections.length < 2}
              aria-haspopup="listbox"
              aria-expanded={sectionMenuOpen}
              onClick={() => setSectionMenuOpen((current) => !current)}
            >
              {activeSectionLabel} {sections.length > 1 && <ChevronDown size={16} className={sectionMenuOpen ? 'is-open' : ''} />}
            </button>
            {sectionMenuOpen && sections.length > 1 && (
              <>
                <button type="button" className="chat-media-picker-section-scrim" aria-label="Close section menu" onClick={() => setSectionMenuOpen(false)} />
                <ul className="chat-media-picker-section-menu" role="listbox">
                  {sections.map((section) => (
                    <li key={section.key}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={sectionFilter === section.key}
                        className={sectionFilter === section.key ? 'is-active' : ''}
                        onClick={() => {
                          setSectionFilter(section.key)
                          setSectionMenuOpen(false)
                        }}
                      >
                        {section.label}
                        {sectionFilter === section.key && <Check size={14} />}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="chat-media-picker-header-actions">
            <button type="button" className="chat-media-picker-close" aria-label="Close media gallery" onClick={onClose}>
              <X size={19} />
            </button>
          </div>
        </header>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(event) => {
            handleLocalFiles(event.target.files)
            event.target.value = ''
          }}
        />

        {loading ? (
          <MediaGridSkeleton />
        ) : galleryError ? (
          <div className="chat-media-picker-state">
            <Film size={28} />
            <span>{galleryError}</span>
            {!nativeGallery && <button type="button" onClick={() => inputRef.current?.click()}>Choose photos or videos</button>}
          </div>
        ) : (
          <div className="chat-media-picker-grid">
            {!nativeGallery && (
              <button type="button" className="chat-media-picker-device-tile" onClick={() => inputRef.current?.click()}>
                <Film size={28} />
                <span>Choose photos or videos</span>
              </button>
            )}
            {visibleMedia.map((media) => {
              const selectionIndex = selectedIds.indexOf(media.id)
              const selected = selectionIndex >= 0
              return (
                <button
                  type="button"
                  key={media.id}
                  className={`chat-media-picker-photo${selected ? ' is-selected' : ''}`}
                  onClick={() => toggleSelection(media.id)}
                  aria-label={selected ? `Selected ${media.mediaType} ${selectionIndex + 1}` : `Select ${media.mediaType}`}
                >
                  {media.mediaType === 'video' && media.thumbnail && media.thumbnailIsVideo ? (
                    <video src={media.thumbnail} muted playsInline preload="metadata" />
                  ) : media.mediaType === 'video' && media.thumbnail ? (
                    <img src={media.thumbnail} alt="" />
                  ) : media.thumbnail ? (
                    <img src={media.thumbnail} alt="" />
                  ) : media.mediaType === 'video' ? (
                    <span className="chat-media-picker-audio-tile"><Film size={28} /><small>{media.name}</small></span>
                  ) : (
                    <span className="chat-media-picker-audio-tile"><ImageIcon size={28} /><small>{media.name}</small></span>
                  )}
                  <span className="chat-media-picker-check">
                    {selected ? selectionIndex + 1 : <Check size={13} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <footer className="chat-media-picker-footer">
          <span>{selectedIds.length ? `${selectedIds.length} selected` : `Select up to ${MAX_SELECTED_MEDIA} photos or videos`}</span>
          <button type="button" disabled={!selectedIds.length || sending || disabled} onClick={sendSelected}>
            {sending ? <><Loader2 className="chat-media-picker-spinner" size={16} /> Sending…</> : `Send${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}