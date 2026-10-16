import { DEMO_MODE } from '../../demo/config'
import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  X, ChevronLeft, MapPin, Tag, Globe, Users, Lock,
  Plus, Layers, Copy, Scissors, Play, Pause, Wand2, Loader2, Volume2, VolumeX, RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../../components/shared/Avatar'
import { AlertDialog } from '../../components/shared/AlertDialog'
import { postsApi } from '../../api/posts'
import { useAuthStore } from '../../stores/authStore'
import { useFeedStore } from '../../stores/feedStore'
import { createLocalMediaPreview, disposeLocalMediaPreview } from '../../utils/localMediaPreview'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { MediaGridSkeleton } from '../../components/shared/AppSkeletons'
import {
  clampPostCrop,
  cropImageForInstagramPost,
  DEFAULT_POST_CROP,
  DEFAULT_POST_IMAGE_ADJUSTMENTS,
  type PostCrop,
  type PostImageAdjustments,
} from '../../utils/instagramPostCrop'
import {
  getRecentNativePhotos,
  hasNativeMediaGallery,
  readNativePhoto,
  type NativeGalleryPhoto,
} from '../../capacitor/photoGallery'
import {
  mediaUploadError,
  mediaUploadSizeError,
  PHOTO_MAX_UPLOAD_BYTES,
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_MAX_UPLOAD_BYTES,
} from '../../utils/mediaUploadPolicy'

type Step = 'picker' | 'filter' | 'caption'
type PostPublishState = 'idle' | 'uploading' | 'publishing' | 'success' | 'error'

const MAX_IMAGE_BYTES = PHOTO_MAX_UPLOAD_BYTES
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
  'video/3gpp', 'video/x-msvideo',
])

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  avi: 'video/x-msvideo',
}

function normalizeUploadFile(file: File): File {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const reportedMime = file.type.split(';', 1)[0].toLowerCase()
  const normalizedMime = reportedMime === 'image/jpg'
    ? 'image/jpeg'
    : reportedMime === 'video/3gp'
      ? 'video/3gpp'
      : ALLOWED_MEDIA_TYPES.has(reportedMime)
        ? reportedMime
        : MEDIA_MIME_BY_EXTENSION[extension]

  if (!normalizedMime || normalizedMime === reportedMime) return file
  return new File([file], file.name || `campnect-upload.${extension || 'bin'}`, {
    type: normalizedMime,
    lastModified: file.lastModified,
  })
}

function isRealUploadFile(value: unknown): value is File {
  const file = value as File | null
  const mime = file?.type?.split(';', 1)[0] || ''
  return !!file &&
    typeof file === 'object' &&
    typeof file.size === 'number' &&
    file.size > 0 &&
    typeof file.type === 'string' &&
    (
      (mime.startsWith('image/') && file.size <= MAX_IMAGE_BYTES) ||
      (mime.startsWith('video/') && file.size <= VIDEO_MAX_UPLOAD_BYTES)
    ) &&
    ALLOWED_MEDIA_TYPES.has(mime) &&
    typeof file.arrayBuffer === 'function'
}

function uploadSelectionError(files: File[]) {
  for (const file of files) {
    const error = mediaUploadSizeError(file)
    if (error) return error
  }
  return 'Choose a supported image or video file.'
}

function describeUploadFile(file: File | Blob | null | undefined) {
  if (!file) return null
  return {
    name: 'name' in file ? String((file as File).name || 'upload') : 'upload',
    mime: file.type || 'unknown',
    bytes: file.size,
  }
}

function debugUpload(stage: string, details: Record<string, unknown>) {
  if ((import.meta as any).env?.DEV) console.debug(`[upload] ${stage}`, details)
}

const FILTERS = [
  { id: 'normal',    label: 'Normal',    css: 'none' },
  { id: 'clarendon', label: 'Clarendon', css: 'saturate(1.35) contrast(1.1) brightness(1.1)' },
  { id: 'gingham',   label: 'Gingham',   css: 'sepia(0.12) saturate(0.85) brightness(1.05)' },
  { id: 'moon',      label: 'Moon',      css: 'grayscale(1) brightness(1.1) contrast(1.1)' },
  { id: 'lark',      label: 'Lark',      css: 'saturate(1.1) brightness(1.1) contrast(0.9) sepia(0.05)' },
  { id: 'crema',     label: 'Crema',     css: 'sepia(0.2) saturate(0.9) brightness(1.1)' },
  { id: 'warm',      label: 'Warm',      css: 'sepia(0.3) saturate(1.2) brightness(1.05)' },
  { id: 'cool',      label: 'Cool',      css: 'hue-rotate(20deg) saturate(1.1) brightness(1.05)' },
]

interface MediaItem {
  file: File
  url: string
  isVideo: boolean
  aspectRatio?: number
  nativeId?: string
}

async function getImageAspectRatio(url: string): Promise<number | undefined> {
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : undefined)
    image.onerror = () => resolve(undefined)
    image.src = url
  })
}

export function CreatePostScreen() {
  const navigate  = useNavigate()
  const routeLocation = useLocation()
  const { user }  = useAuthStore()
  const { prependPost } = useFeedStore()

  const [step,        setStep]        = useState<Step>('picker')
  useBackDismiss(step === 'filter', () => setStep('picker'), 150)
  useBackDismiss(step === 'caption', () => setStep('filter'), 160)
  const [mediaItems,  setMediaItems]  = useState<MediaItem[]>([])
  const [activeIdx,   setActiveIdx]   = useState(0)
  const [filterId,    setFilterId]    = useState('normal')
  const [cropsByUrl, setCropsByUrl]   = useState<Record<string, PostCrop>>({})
  const [adjustmentsByUrl, setAdjustmentsByUrl] = useState<Record<string, PostImageAdjustments>>({})
  const [caption,     setCaption]     = useState('')
  const [location,    setLocation]    = useState('')
  const [tagText,     setTagText]     = useState('')
  const [visibility,  setVisibility]  = useState<'public'|'college'|'friends'>('public')
  const [publishState, setPublishState] = useState<PostPublishState>('idle')
  const [progress,    setProgress]    = useState(0)
  const [dragOver,    setDragOver]    = useState<number|null>(null)
  const [dragFrom,    setDragFrom]    = useState<number|null>(null)
  const [nativePhotos, setNativePhotos] = useState<NativeGalleryPhoto[]>([])
  const [nativeGalleryLoading, setNativeGalleryLoading] = useState(false)
  const [nativeGalleryError, setNativeGalleryError] = useState<string | null>(null)
  const [readingNativePhotoId, setReadingNativePhotoId] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaItemsRef = useRef<MediaItem[]>([])
  const nativeGalleryAvailable = hasNativeMediaGallery()

  const activeFilter = FILTERS.find(f => f.id === filterId) ?? FILTERS[0]
  const isMulti      = mediaItems.length > 1
  const uploading = publishState === 'uploading' || publishState === 'publishing'

  /* ─── File picking ─────────────────────────────── */
  useEffect(() => {
    mediaItemsRef.current = mediaItems
  }, [mediaItems])

  useEffect(() => () => {
    mediaItemsRef.current.forEach(item => disposeLocalMediaPreview(item.url))
  }, [])

  useEffect(() => {
    if (!nativeGalleryAvailable) return
    let cancelled = false
    setNativeGalleryLoading(true)
    setNativeGalleryError(null)
    getRecentNativePhotos(80)
      .then(photos => {
        if (!cancelled) setNativePhotos(photos)
      })
      .catch(() => {
        if (!cancelled) setNativeGalleryError('Photo access is unavailable. Use Add more to open the system gallery.')
      })
      .finally(() => {
        if (!cancelled) setNativeGalleryLoading(false)
      })
    return () => { cancelled = true }
  }, [nativeGalleryAvailable])

  async function handleFilePick(files: FileList | File[] | null, nativeId?: string) {
    if (!files || files.length === 0) return
    const picked = Array.from(files).map(normalizeUploadFile)
    const validFiles: File[] = []
    const invalid: File[] = []
    let fileValidationError: string | null = null
    for (const file of picked) {
      const policyError = await mediaUploadError(file)
      if (!isRealUploadFile(file) || policyError) {
        invalid.push(file)
        fileValidationError ||= policyError
      } else validFiles.push(file)
    }
    if (validFiles.length !== picked.length) {
      setSelectionError(fileValidationError || uploadSelectionError(invalid))
    }
    if (validFiles.length === 0) return
    const containsVideo = validFiles.some(file => file.type.startsWith('video/'))
    const alreadyHasVideo = mediaItemsRef.current.some(item => item.isVideo)
    if ((containsVideo && (validFiles.length > 1 || mediaItemsRef.current.length > 0)) || (alreadyHasVideo && validFiles.length > 0)) {
      toast.error('Videos are published as Clips. Choose one video at a time.')
      return
    }
    let items: MediaItem[]
    try {
      items = await Promise.all(validFiles.slice(0, 10).map(async file => {
        const url = await createLocalMediaPreview(file)
        return {
          file,
          url,
          isVideo: file.type.startsWith('video/'),
          aspectRatio: file.type.startsWith('image/') ? await getImageAspectRatio(url) : undefined,
          nativeId: validFiles.length === 1 ? nativeId : undefined,
        }
      }))
    } catch {
      toast.error('One of those files could not be previewed. Try choosing it again.')
      return
    }
    debugUpload('selected', { files: items.map(item => describeUploadFile(item.file)) })
    setMediaItems(prev => {
      const combined = [...prev, ...items].slice(0, 10)
      const retained = new Set(combined.map(item => item.url))
      items.forEach(item => { if (!retained.has(item.url)) disposeLocalMediaPreview(item.url) })
      return combined
    })
  }

  async function handleNativePhotoPick(photo: NativeGalleryPhoto) {
    const existingIndex = mediaItemsRef.current.findIndex(item => item.nativeId === photo.id)
    if (existingIndex >= 0) {
      removeMedia(existingIndex)
      return
    }
    if (mediaItemsRef.current.length >= 10 || readingNativePhotoId) {
      if (mediaItemsRef.current.length >= 10) toast.error('You can select up to 10 photos or videos')
      return
    }
    setReadingNativePhotoId(photo.id)
    try {
      const selectedFile = await readNativePhoto(photo)
      await handleFilePick([selectedFile], photo.id)
      setActiveIdx(Math.min(mediaItemsRef.current.length, 9))
    } catch {
      toast.error('That photo could not be opened. Try choosing it from Add more.')
    } finally {
      setReadingNativePhotoId(null)
    }
  }

  function removeMedia(idx: number) {
    setMediaItems(prev => {
      disposeLocalMediaPreview(prev[idx].url)
      const next = prev.filter((_, i) => i !== idx)
      return next
    })
    setActiveIdx(i => Math.min(i, Math.max(0, mediaItems.length - 2)))
  }

  /* ─── Drag-to-reorder ───────────────────────────── */
  function onDragStart(idx: number) { setDragFrom(idx) }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOver(idx)
  }
  function onDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    if (dragFrom === null || dragFrom === toIdx) { setDragFrom(null); setDragOver(null); return }
    setMediaItems(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(dragFrom, 1)
      arr.splice(toIdx, 0, moved)
      return arr
    })
    setActiveIdx(toIdx)
    setDragFrom(null)
    setDragOver(null)
  }
  function onDragEnd() { setDragFrom(null); setDragOver(null) }

  /* ─── Share ─────────────────────────────────────── */
  async function handleShare() {
    if (mediaItems.length === 0 && !caption.trim()) {
      toast.error('Add a photo or caption first')
      return
    }
    if (uploading) return
    for (const item of mediaItems) {
      const error = !isRealUploadFile(item.file)
        ? 'The selected media is no longer available. Choose it again.'
        : await mediaUploadError(item.file, item.isVideo ? 'video' : 'image')
      if (error) {
        toast.error(error)
        return
      }
    }
    const enteredTags = tagText.split(',').map(t => t.trim()).filter(Boolean)
    if (enteredTags.some(tag => !/^@[a-z0-9_.]{3,30}$/i.test(tag))) {
      toast.error('Tag people using @username only')
      return
    }
    setPublishState('uploading')
    setProgress(15)
    let succeeded = false
    try {
      const fd   = new FormData()
      const hasV = mediaItems.some(m => m.isVideo)
      const type = mediaItems.length === 0 ? 'text'
        : mediaItems.length > 1 ? 'carousel'
         : hasV ? 'reel' : 'photo'

      fd.append('data', JSON.stringify({
        type,
        content: caption.trim(),
        ...(DEMO_MODE ? { community_id: new URLSearchParams(routeLocation.search).get('community_id') || undefined } : {}),
        tags: enteredTags,
        visibility,
        location: location.trim() || undefined,
        filter: filterId !== 'normal' ? filterId : undefined,
      }))
      // Save an Instagram-compatible ratio while retaining square, portrait,
      // and landscape sources when the student has not pinched to crop.
      const preparedMedia = await Promise.all(mediaItems.map(async item => ({
        ...item,
        file: item.isVideo ? item.file : await cropImageForInstagramPost(
          item.file, cropsByUrl[item.url] || DEFAULT_POST_CROP, activeFilter.css,
          adjustmentsByUrl[item.url] || DEFAULT_POST_IMAGE_ADJUSTMENTS,
        ),
      })))
      for (const item of preparedMedia) {
        const error = await mediaUploadError(item.file, item.isVideo ? 'video' : 'image')
        if (error) throw new Error(error)
      }
      preparedMedia.forEach(m => fd.append('media', m.file))
      debugUpload('post-submit', {
        files: preparedMedia.map(item => describeUploadFile(item.file)),
        formDataKeys: Array.from(fd.keys()),
      })

      setProgress(45)
      const res = await postsApi.createPost(fd, {
        onUploadProgress: event => {
          if (!event.total) return
          setProgress(Math.max(45, Math.round((event.loaded / event.total) * 70)))
        },
      })
      setPublishState('publishing')
      debugUpload('post-response', {
        status: res.status,
        success: res.data?.success,
        hasCreatedPost: Boolean(res.data?.data?.id),
      })
      setProgress(85)

      if (res.data.data) prependPost(res.data.data)

      setProgress(100)
      setPublishState('success')
      succeeded = true
      toast.success('Posted!')
      navigateToAppRoot(navigate, routeLocation.pathname, '/app/feed')
    } catch (err: any) {
      setPublishState('error')
      debugUpload('post-error', {
        status: err?.response?.status,
        message: err?.response?.data?.error || err?.message || 'Post failed',
      })
      toast.error(err?.response?.data?.error || 'Post failed')
    } finally {
      if (!succeeded && publishState !== 'error') setPublishState('error')
      setProgress(0)
    }
  }

  /* ─── Render ────────────────────────────────────── */
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--color-bg)', display: 'flex', flexDirection: 'column',
    }}>
      {/* Upload progress bar */}
      {uploading && (
        <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'linear-gradient(90deg,#18181B,#C44DCC)',
            transition: 'width 300ms', borderRadius: '9999px',
          }} />
        </div>
      )}

      {step === 'picker'  && <PickerStep  mediaItems={mediaItems} activeIdx={activeIdx} setActiveIdx={setActiveIdx} fileInputRef={fileInputRef} removeMedia={removeMedia} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} dragOver={dragOver} dragFrom={dragFrom} navigate={navigate} nativeGalleryAvailable={nativeGalleryAvailable} nativePhotos={nativePhotos} nativeGalleryLoading={nativeGalleryLoading} nativeGalleryError={nativeGalleryError} readingNativePhotoId={readingNativePhotoId} onNativePhotoPick={handleNativePhotoPick} onNext={() => { if (mediaItems.length === 0) { toast.error('Select at least one photo or video'); return } setStep('filter') }} />}
      {step === 'filter'  && <FilterStep  mediaItems={mediaItems} activeIdx={activeIdx} setActiveIdx={setActiveIdx} filterId={filterId} setFilterId={setFilterId} cropsByUrl={cropsByUrl} setCropsByUrl={setCropsByUrl} adjustmentsByUrl={adjustmentsByUrl} setAdjustmentsByUrl={setAdjustmentsByUrl} activeFilter={activeFilter} isMulti={isMulti} onBack={requestAppBack} onNext={() => setStep('caption')} />}
      {step === 'caption' && <CaptionStep mediaItems={mediaItems} activeFilter={activeFilter} user={user} caption={caption} setCaption={setCaption} location={location} setLocation={setLocation} tagText={tagText} setTagText={setTagText} visibility={visibility} setVisibility={setVisibility} onBack={requestAppBack} onShare={handleShare} uploading={uploading} publishState={publishState} />}

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={e => { const files = e.currentTarget.files; void handleFilePick(files); e.currentTarget.value = '' }} />
      <AlertDialog message={selectionError} title="File could not be added" onClose={() => setSelectionError(null)} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   STEP 1 — PICKER
═══════════════════════════════════════════════════════ */
function PickerStep({ mediaItems, activeIdx, setActiveIdx, fileInputRef, removeMedia, onDragStart, onDragOver, onDrop, onDragEnd, dragOver, dragFrom, nativeGalleryAvailable, nativePhotos, nativeGalleryLoading, nativeGalleryError, readingNativePhotoId, onNativePhotoPick, onNext }: any) {
  const active = mediaItems[activeIdx]
  const [videoMuted, setVideoMuted] = useState(true)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))', paddingBottom: '14px',
        paddingLeft: '16px', paddingRight: '16px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button onClick={requestAppBack} style={iconBtnStyle}>
          <X size={22} color="var(--color-text-primary)" />
        </button>
        <span style={headerTitleStyle}>New post</span>
        <button
          onClick={onNext}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-lime)', fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)', padding: '4px 8px', WebkitTapHighlightColor: 'transparent' }}
        >
          Next
        </button>
      </div>

      {/* Large preview */}
      <div style={{
        width: '100%', aspectRatio: '1/1',
        background: active ? '#111' : 'var(--color-surface)', overflow: 'hidden', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {active ? (
          active.isVideo ? (
            <>
              <video src={active.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted={videoMuted} autoPlay loop playsInline />
              <button
                type="button"
                aria-label={videoMuted ? 'Turn video sound on' : 'Mute video'}
                onClick={() => setVideoMuted(muted => !muted)}
                style={{ position: 'absolute', right: 12, bottom: 12, width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: '50%', color: '#fff', background: 'rgba(0,0,0,.58)', border: '1px solid rgba(255,255,255,.35)', cursor: 'pointer' }}
              >
                {videoMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </>
          ) : (
            <img src={active.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)',
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={28} color="var(--color-lime)" />
            </div>
            <span style={{ fontSize: '15px', fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>Select from gallery</span>
            <span style={{ fontSize: '13px', fontFamily: 'var(--font-body)', color: 'var(--color-text-secondary)' }}>Tap to choose photos or videos</span>
          </button>
        )}

        {/* Multi-select indicator */}
        {mediaItems.length > 1 && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(0,0,0,0.55)', borderRadius: '9999px',
            padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px',
            backdropFilter: 'blur(6px)',
          }}>
            <Layers size={13} color="#fff" />
            <span style={{ fontSize: '12px', color: '#fff', fontFamily: 'var(--font-body)' }}>{mediaItems.length}</span>
          </div>
        )}
        {active && (
          <button
            type="button"
            onClick={() => removeMedia(activeIdx)}
            aria-label="Remove selected media"
            style={{
              position: 'absolute', top: 12, left: 12, width: 34, height: 34,
              borderRadius: '50%', border: 0, background: 'rgba(0,0,0,.62)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', backdropFilter: 'blur(6px)',
            }}
          >
            <X size={17} />
          </button>
        )}
      </div>

      {/* Toolbar row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
          RECENTS
        </span>
        {mediaItems.length < 10 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'var(--color-lime-dim)', borderRadius: '9999px',
              border: '1px solid var(--color-lime)',
              padding: '5px 12px', cursor: 'pointer',
              color: 'var(--color-lime)', fontSize: '13px', fontFamily: 'var(--font-body)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Plus size={13} /> Add more
          </button>
        )}
      </div>

      {/* Thumbnail grid */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
        {nativeGalleryAvailable ? (
          <NativePostGallery
            photos={nativePhotos}
            mediaItems={mediaItems}
            loading={nativeGalleryLoading}
            error={nativeGalleryError}
            readingPhotoId={readingNativePhotoId}
            onPhotoPick={onNativePhotoPick}
            onOpenSystemGallery={() => fileInputRef.current?.click()}
          />
        ) : mediaItems.length === 0 ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%', padding: '32px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontSize: '14px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Copy size={32} color="var(--color-text-muted)" />
            Tap above to open your gallery
          </button>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', padding: '2px' }}>
            {mediaItems.map((item: MediaItem, i: number) => (
              <div
                key={i}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => onDragOver(e, i)}
                onDrop={e => onDrop(e, i)}
                onDragEnd={onDragEnd}
                onClick={() => setActiveIdx(i)}
                style={{
                  position: 'relative', aspectRatio: '1/1', cursor: 'pointer', overflow: 'hidden',
                  outline: dragOver === i ? '2px solid var(--color-lime)' : activeIdx === i ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                  opacity: dragFrom === i ? 0.45 : 1,
                  transition: 'opacity 150ms',
                }}
              >
                {item.isVideo ? (
                  <video src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                ) : (
                  <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {/* Selection number */}
                <div style={{
                  position: 'absolute', top: 5, right: 5,
                  width: 22, height: 22, borderRadius: '50%',
                  background: activeIdx === i ? 'var(--color-lime)' : 'rgba(255,255,255,0.9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700, color: '#000',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                }}>
                  {i + 1}
                </div>
                {/* Remove */}
                <button
                  onClick={e => { e.stopPropagation(); removeMedia(i) }}
                  style={{
                    position: 'absolute', top: 4, left: 4,
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.65)', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                  }}
                >
                  <X size={11} />
                </button>
                {item.isVideo && (
                  <div style={{
                    position: 'absolute', bottom: 4, left: 4,
                    background: 'rgba(0,0,0,0.55)', borderRadius: '4px', padding: '2px 5px',
                    fontSize: '10px', color: '#fff', fontFamily: 'var(--font-body)',
                  }}>
                    VIDEO
                  </div>
                )}
              </div>
            ))}
            {/* Add more slot */}
            {mediaItems.length < 10 && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  aspectRatio: '1/1', background: 'var(--color-surface)',
                  border: '1.5px dashed var(--color-border-strong)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', borderRadius: '4px',
                }}
              >
                <Plus size={20} color="var(--color-text-muted)" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function NativePostGallery({ photos, mediaItems, loading, error, readingPhotoId, onPhotoPick, onOpenSystemGallery }: {
  photos: NativeGalleryPhoto[]
  mediaItems: MediaItem[]
  loading: boolean
  error: string | null
  readingPhotoId: string | null
  onPhotoPick: (photo: NativeGalleryPhoto) => void | Promise<void>
  onOpenSystemGallery: () => void
}) {
  if (loading) {
    return <MediaGridSkeleton count={8} />
  }

  if (photos.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenSystemGallery}
        style={{
          width: '100%', padding: 32, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12, background: 'none', border: 'none',
          cursor: 'pointer', color: error ? '#b33a4b' : 'var(--color-text-muted)',
          fontFamily: 'var(--font-body)', fontSize: 14, WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Copy size={32} color="currentColor" />
        {error || 'No recent photos found. Tap to open the system gallery.'}
      </button>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, padding: 2 }}>
      {photos.map(photo => {
        const selectedIndex = mediaItems.findIndex(item => item.nativeId === photo.id)
        const selected = selectedIndex >= 0
        const reading = readingPhotoId === photo.id
        return (
          <button
            key={photo.id}
            type="button"
            onClick={() => void onPhotoPick(photo)}
            disabled={!!readingPhotoId && !reading}
            aria-label={`${selected ? 'Remove' : 'Select'} ${photo.name || 'photo'}`}
            style={{
              position: 'relative', aspectRatio: '1/1', padding: 0, overflow: 'hidden',
              border: selected ? '3px solid var(--color-lime)' : 0,
              background: 'var(--color-surface)', cursor: 'pointer',
              opacity: readingPhotoId && !reading ? .72 : 1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {photo.thumbnail ? (
              <img src={photo.thumbnail} alt="" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
            ) : (
              <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Copy size={25} color="var(--color-text-muted)" />
              </span>
            )}
            {(selected || reading) && (
              <span style={{
                position: 'absolute', top: 5, right: 5, width: 23, height: 23,
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: reading ? 'rgba(0,0,0,.72)' : 'var(--color-lime)',
                color: reading ? '#fff' : '#000', fontSize: 11, fontWeight: 800,
                boxShadow: '0 1px 5px rgba(0,0,0,.35)',
              }}>
                {reading ? <Loader2 size={13} className="spin" /> : selectedIndex + 1}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   STEP 2 — FILTER / EDIT
═══════════════════════════════════════════════════════ */
function FilterStep({ mediaItems, activeIdx, setActiveIdx, filterId, setFilterId, cropsByUrl, setCropsByUrl, adjustmentsByUrl, setAdjustmentsByUrl, activeFilter, isMulti, onBack, onNext }: any) {
  const active = mediaItems[activeIdx]
  const [filterMode, setFilterMode] = useState<'filters'|'adjust'>('filters')
  const [videoMuted, setVideoMuted] = useState(true)
  const pinchPointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartDistanceRef = useRef(0)
  const pinchStartZoomRef = useRef(DEFAULT_POST_CROP.zoom)

  const activeCrop = active ? (cropsByUrl[active.url] || DEFAULT_POST_CROP) : DEFAULT_POST_CROP
  const adjustments = active ? (adjustmentsByUrl[active.url] || DEFAULT_POST_IMAGE_ADJUSTMENTS) : DEFAULT_POST_IMAGE_ADJUSTMENTS
  const setAdjustments = (next: PostImageAdjustments | ((previous: PostImageAdjustments) => PostImageAdjustments)) => {
    if (!active || active.isVideo) return
    setAdjustmentsByUrl((previous: Record<string, PostImageAdjustments>) => {
      const current = previous[active.url] || DEFAULT_POST_IMAGE_ADJUSTMENTS
      return {
        ...previous,
        [active.url]: typeof next === 'function' ? next(current) : next,
      }
    })
  }
  const combinedFilter = [
    activeFilter.css !== 'none' ? activeFilter.css : '',
    `brightness(${1 + adjustments.brightness / 100})`,
    `contrast(${1 + adjustments.contrast / 100})`,
    `saturate(${1 + adjustments.saturation / 100})`,
  ].filter(Boolean).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))', paddingBottom: '14px',
        paddingLeft: '16px', paddingRight: '16px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button onClick={onBack} style={iconBtnStyle}>
          <ChevronLeft size={24} color="var(--color-text-primary)" />
        </button>
        <span style={headerTitleStyle}>Edit</span>
        <button
          onClick={onNext}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-lime)', fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)', padding: '4px 8px', WebkitTapHighlightColor: 'transparent' }}
        >
          Next
        </button>
      </div>

      {/* Preview */}
      <div style={{
        width: '100%', height: 'min(46vh, 380px)', background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0, position: 'relative',
      }}>
        {active && (
          <div
            onPointerDown={event => {
              if (!active || active.isVideo || event.pointerType !== 'touch') return
              pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
              if (pinchPointersRef.current.size !== 2) return
              const points = [...pinchPointersRef.current.values()]
              pinchStartDistanceRef.current = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y))
              pinchStartZoomRef.current = activeCrop.zoom
              for (const pointerId of pinchPointersRef.current.keys()) {
                try { event.currentTarget.setPointerCapture(pointerId) } catch {}
              }
            }}
            onPointerMove={event => {
              if (!active || active.isVideo || !pinchPointersRef.current.has(event.pointerId) || pinchPointersRef.current.size < 2) return
              pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
              const points = [...pinchPointersRef.current.values()]
              const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
              setCropsByUrl((previous: Record<string, PostCrop>) => ({
                ...previous,
                [active.url]: clampPostCrop({
                  ...activeCrop,
                  zoom: pinchStartZoomRef.current * distance / pinchStartDistanceRef.current,
                }),
              }))
            }}
            onPointerUp={event => { pinchPointersRef.current.delete(event.pointerId); if (pinchPointersRef.current.size < 2) pinchStartDistanceRef.current = 0 }}
            onPointerCancel={event => { pinchPointersRef.current.delete(event.pointerId); if (pinchPointersRef.current.size < 2) pinchStartDistanceRef.current = 0 }}
            style={{
            height: '100%', maxWidth: '100%', aspectRatio: active?.aspectRatio || '4 / 5',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: active?.isVideo ? 'auto' : 'none',
            cursor: 'default',
          }}>
            {active.isVideo ? (
              <>
                <video src={active.url} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: combinedFilter }} muted={videoMuted} autoPlay loop playsInline />
                <button type="button" aria-label={videoMuted ? 'Turn video sound on' : 'Mute video'} onClick={() => setVideoMuted(muted => !muted)} style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 2, width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: '50%', color: '#fff', background: 'rgba(0,0,0,.58)', border: '1px solid rgba(255,255,255,.35)', cursor: 'pointer' }}>
                  {videoMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </>
            ) : (
              <img
                src={active.url}
                alt=""
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: combinedFilter, transform: `scale(${activeCrop.zoom})`, transition: 'transform 120ms ease', pointerEvents: 'none' }}
              />
            )}
          </div>
        )}
        {/* Carousel dots */}
        {isMulti && (
          <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: '5px',
          }}>
            {mediaItems.map((_: any, i: number) => (
              <div
                key={i}
                onClick={() => setActiveIdx(i)}
                style={{
                  width: i === activeIdx ? 18 : 6, height: 6, borderRadius: '9999px',
                  background: i === activeIdx ? 'var(--color-lime)' : 'rgba(255,255,255,0.5)',
                  transition: 'all 200ms', cursor: 'pointer',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {!active?.isVideo && (
        <div style={{ padding: '10px 16px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 650 }}>Original ratio · Instagram compatible</span>
            <button type="button" onClick={() => active && setCropsByUrl((previous: Record<string, PostCrop>) => ({ ...previous, [active.url]: DEFAULT_POST_CROP }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: 'var(--color-lime)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              <RotateCcw size={13} /> Reset
            </button>
          </div>
          <p style={{ margin: '3px 0 0', color: 'var(--color-text-muted)', fontSize: 11 }}>Pinch with two fingers to zoom in or out</p>
        </div>
      )}

      {/* Mode tabs */}
      <div style={{ display: 'flex', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
        {(['filters', 'adjust'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setFilterMode(mode)}
            style={{
              flex: 1, height: '38px', background: 'none', border: 'none', cursor: 'pointer',
              color: filterMode === mode ? 'var(--color-lime)' : 'var(--color-text-muted)',
              borderBottom: filterMode === mode ? '2px solid var(--color-lime)' : '2px solid transparent',
              fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)',
              transition: 'all 150ms', WebkitTapHighlightColor: 'transparent',
              textTransform: 'capitalize',
            }}
          >
            {mode === 'filters' ? 'Filters' : 'Adjust'}
          </button>
        ))}
      </div>

      {/* Filters / Adjust strip */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
        {filterMode === 'filters' ? (
          <div style={{
            display: 'flex', gap: '12px', padding: '14px 16px',
            overflowX: 'auto',
          }}>
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilterId(f.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px',
                  background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  width: 68, height: 68, borderRadius: '10px', overflow: 'hidden',
                  outline: filterId === f.id ? '2.5px solid var(--color-lime)' : '2.5px solid transparent',
                  transition: 'outline 150ms',
                }}>
                  {active && !active.isVideo ? (
                    <img
                      src={active.url}
                      alt={f.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', filter: f.css }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'rgba(24,24,27,0.25)' }} />
                  )}
                </div>
                <span style={{
                  fontSize: '11px', fontFamily: 'var(--font-body)',
                  color: filterId === f.id ? 'var(--color-lime)' : 'var(--color-text-secondary)',
                  fontWeight: filterId === f.id ? 600 : 400,
                }}>
                  {f.label}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {([
              { label: 'Brightness', id: 'brightness' as const },
              { label: 'Contrast',   id: 'contrast' as const },
              { label: 'Saturation', id: 'saturation' as const },
            ]).map(adj => (
              <div key={adj.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)' }}>{adj.label}</span>
                  <span style={{ fontSize: '13px', color: 'var(--color-lime)', fontFamily: 'var(--font-body)' }}>{adjustments[adj.id]}</span>
                </div>
                <input
                  type="range" min="-100" max="100" value={adjustments[adj.id]}
                  onChange={e => setAdjustments(prev => ({ ...prev, [adj.id]: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: 'var(--color-lime)', cursor: 'pointer' }}
                />
              </div>
            ))}
            {(adjustments.brightness !== 0 || adjustments.contrast !== 0 || adjustments.saturation !== 0) && (
              <button
                onClick={() => setAdjustments({ brightness: 0, contrast: 0, saturation: 0 })}
                style={{ alignSelf: 'center', background: 'none', border: 'none', color: 'var(--color-lime)', fontSize: '12px', fontFamily: 'var(--font-body)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
              >
                Reset adjustments
              </button>
            )}
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', textAlign: 'center', marginTop: '8px' }}>
              Your adjustments are saved in the final post
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   STEP 3 — CAPTION / SHARE
═══════════════════════════════════════════════════════ */
function CaptionStep({ mediaItems, activeFilter, user, caption, setCaption, location, setLocation, tagText, setTagText, visibility, setVisibility, onBack, onShare, uploading, publishState }: any) {
  const thumb = mediaItems[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))', paddingBottom: '14px',
        paddingLeft: '16px', paddingRight: '16px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button onClick={onBack} style={iconBtnStyle}>
          <ChevronLeft size={24} color="var(--color-text-primary)" />
        </button>
        <span style={headerTitleStyle}>New post</span>
        <button
          onClick={onShare}
          disabled={uploading}
          style={{
            background: uploading ? 'var(--color-lime-dim)' : 'var(--color-lime)',
            border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
            color: 'var(--color-bg)', fontSize: '15px', fontWeight: 700,
            fontFamily: 'var(--font-display)', padding: '7px 18px',
            borderRadius: '9999px', WebkitTapHighlightColor: 'transparent',
            transition: 'opacity 150ms',
          }}
        >
          {publishState === 'error' ? 'Retry' : publishState === 'publishing' ? 'Publishing…' : uploading ? 'Uploading…' : 'Share'}
        </button>
      </div>
      {publishState === 'error' && (
        <div role="status" aria-live="polite" style={{ padding: '8px 16px', color: '#ff5c5c', fontSize: 12, textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
          Upload failed. Your selected media is still available — try again.
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Author + caption row */}
        <div style={{ display: 'flex', gap: '12px', padding: '14px 16px', alignItems: 'flex-start' }}>
          {thumb ? (
            <div style={{ width: 60, height: 60, borderRadius: '8px', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
              {thumb.isVideo ? (
                <video src={thumb.url} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: activeFilter.css }} muted />
              ) : (
                <img src={thumb.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: activeFilter.css }} />
              )}
              {mediaItems.length > 1 && (
                <div style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.6)', borderRadius: '9999px', padding: '2px 5px', fontSize: '10px', color: '#fff', fontFamily: 'var(--font-body)' }}>
                  1/{mediaItems.length}
                </div>
              )}
            </div>
          ) : (
            <Avatar src={user?.avatar_url} name={user?.full_name} size={44} />
          )}
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', display: 'block', marginBottom: '6px' }}>
              {user?.full_name}
            </span>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Write a caption…"
              rows={4}
              autoFocus
              style={{
                width: '100%', background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--color-text-primary)', fontSize: '15px', fontFamily: 'var(--font-body)',
                lineHeight: 1.55, resize: 'none', caretColor: 'var(--color-lime)',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
                {caption.length}/2200
              </span>
            </div>
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--color-border)', margin: '0 16px' }} />

        {/* Location */}
        <OptionRow
          icon={<MapPin size={18} color="var(--color-text-muted)" />}
          label={location || 'Add location'}
          muted={!location}
          onClick={() => {}}
          input={
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Add location"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: 'var(--color-text-primary)', fontSize: '15px', fontFamily: 'var(--font-body)',
                textAlign: 'right', caretColor: 'var(--color-lime)',
              }}
            />
          }
        />

        {/* Tag people */}
        <OptionRow
          icon={<Tag size={18} color="var(--color-text-muted)" />}
          label={tagText || 'Tag people'}
          muted={!tagText}
          input={
            <input
              value={tagText}
              onChange={e => setTagText(e.target.value)}
               placeholder="Tag people using @username"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: 'var(--color-text-primary)', fontSize: '15px', fontFamily: 'var(--font-body)',
                textAlign: 'right', caretColor: 'var(--color-lime)',
              }}
            />
          }
        />

        {/* Visibility */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {visibility === 'public'  && <Globe  size={18} color="var(--color-text-muted)" />}
            {visibility === 'college' && <Users  size={18} color="var(--color-text-muted)" />}
            {visibility === 'friends' && <Lock   size={18} color="var(--color-text-muted)" />}
            <span style={{ fontSize: '15px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)' }}>Audience</span>
          </div>
          <select
            value={visibility}
            onChange={e => setVisibility(e.target.value as any)}
            style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)',
              borderRadius: '9999px', padding: '5px 12px',
              color: 'var(--color-lime)', fontSize: '13px', fontFamily: 'var(--font-body)',
              outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="public">Everyone</option>
            <option value="college">My college</option>
            <option value="friends">Friends</option>
          </select>
        </div>

        {/* Reminder */}
        <p style={{
          padding: '16px', fontSize: '12px',
          color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)',
          lineHeight: 1.6, textAlign: 'center', margin: 0,
        }}>
          Posts are visible to your selected audience on Campnect.
        </p>
      </div>
    </div>
  )
}

type GlimpsePublishState = 'idle' | 'preparing' | 'uploading' | 'processing' | 'publishing' | 'published' | 'failed'

// Kept unmounted so existing client-side media data remains reversible; no student route renders it.
export function GlimpseEditor({ navigate, prependPost, prependReel, initialFile, initialCaption }: {
  navigate: any
  prependPost: (post: any) => void
  prependReel: (post: any) => void
  initialFile?: File
  initialCaption?: string
}) {
  const routeLocation = useLocation()
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [current, setCurrent] = useState(0)
  const [caption, setCaption] = useState(initialCaption || '')
  const [filter, setFilter] = useState('none')
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [publishState, setPublishState] = useState<GlimpsePublishState>('idle')
  const [progress, setProgress] = useState(0)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [coverTime, setCoverTime] = useState(0)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const initialFileLoaded = useRef(false)
  const trimDrag = useRef<'start' | 'end' | null>(null)
  const durationRetryTimer = useRef<number | null>(null)
  const previewFallbackAttempted = useRef(false)

  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  useEffect(() => () => {
    if (durationRetryTimer.current !== null) window.clearTimeout(durationRetryTimer.current)
  }, [])

  useEffect(() => {
    if (initialFile && !initialFileLoaded.current) {
      initialFileLoaded.current = true
      void chooseVideo(initialFile)
    }
  }, [initialFile])

  useEffect(() => {
    if (!url || !Number.isFinite(duration) || duration <= 0) {
      setThumbnails([])
      return
    }

    let cancelled = false
    const frameVideo = document.createElement('video')
    const canvas = document.createElement('canvas')
    canvas.width = 180
    canvas.height = 110
    frameVideo.preload = 'auto'
    frameVideo.muted = true
    frameVideo.playsInline = true
    frameVideo.src = url

    const seek = (time: number) => new Promise<void>(resolve => {
      if (cancelled) return resolve()
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        frameVideo.removeEventListener('seeked', finish)
        window.clearTimeout(timeout)
        resolve()
      }
      const timeout = window.setTimeout(finish, 1200)
      frameVideo.addEventListener('seeked', finish, { once: true })
      try { frameVideo.currentTime = time } catch { finish() }
    })

    const buildFrames = async () => {
      try {
        await new Promise<void>(resolve => {
          if (frameVideo.readyState >= 2) return resolve()
          const onReady = () => {
            frameVideo.removeEventListener('loadeddata', onReady)
            resolve()
          }
          frameVideo.addEventListener('loadeddata', onReady, { once: true })
          window.setTimeout(resolve, 2500)
        })
        const context = canvas.getContext('2d')
        if (!context) return
        const frames: string[] = []
        const count = 9
        for (let index = 0; index < count && !cancelled; index += 1) {
          await seek(Math.min(duration - 0.01, (duration * index) / (count - 1)))
          if (cancelled) return
          context.drawImage(frameVideo, 0, 0, canvas.width, canvas.height)
          frames.push(canvas.toDataURL('image/jpeg', 0.72))
        }
        if (!cancelled) setThumbnails(frames)
      } catch {
        if (!cancelled) setThumbnails([])
      }
    }

    void buildFrames()
    return () => {
      cancelled = true
      frameVideo.pause()
      frameVideo.removeAttribute('src')
      frameVideo.load()
    }
  }, [url, duration])

  async function chooseVideo(next: File | null) {
    const isVideo = !!next && (next.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|ogv|avi)$/i.test(next.name))
    if (!next || !isVideo) {
      if (next) setSelectionError('Choose an MP4, MOV, or WebM video for Glimpse.')
      return
    }
    const validationError = await mediaUploadError(next, 'video')
    if (validationError) {
      setSelectionError(validationError)
      return
    }
    if (url) URL.revokeObjectURL(url)
    const nextUrl = URL.createObjectURL(next)
    setFile(next); setUrl(nextUrl); setDuration(0); setStart(0); setEnd(0); setCurrent(0); setCoverTime(0)
    previewFallbackAttempted.current = false
    if (durationRetryTimer.current !== null) {
      window.clearTimeout(durationRetryTimer.current)
      durationRetryTimer.current = null
    }
    setPublishState('idle')
    setProgress(0)
  }

  async function prepareGlimpsePreview() {
    if (!file || previewFallbackAttempted.current) return
    previewFallbackAttempted.current = true
    setPublishState('preparing')
    debugUpload('preview-fallback-start', { file: describeUploadFile(file) })
    try {
      const sourceError = await mediaUploadError(file, 'video')
      if (sourceError) throw new Error(sourceError)
      const response = await postsApi.prepareGlimpseVideo(file)
      const blob = response.data
      if (!(blob instanceof Blob) || blob.size <= 0 || !blob.type.startsWith('video/')) {
        throw new Error('The video preview response was empty or invalid.')
      }
      const normalized = new File([blob], 'glimpse-preview.mp4', { type: 'video/mp4' })
      const normalizedError = await mediaUploadError(normalized, 'video')
      if (normalizedError) throw new Error(normalizedError)
      const normalizedUrl = URL.createObjectURL(normalized)
      if (url) URL.revokeObjectURL(url)
      setFile(normalized)
      setUrl(normalizedUrl)
      setDuration(0)
      setStart(0)
      setEnd(0)
      setCurrent(0)
      setCoverTime(0)
      setPublishState('idle')
      debugUpload('preview-fallback-success', {
        file: describeUploadFile(normalized),
        durationHeader: response.headers?.['x-video-duration'],
      })
    } catch (err: any) {
      let detail = err?.response?.data?.error || err?.message || 'Video preparation failed'
      if (err?.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await err.response.data.text())
          detail = payload?.error || detail
        } catch {
          // Keep the Axios message when the error body is not JSON.
        }
      }
      setPublishState('idle')
      debugUpload('preview-fallback-error', {
        status: err?.response?.status,
        message: detail,
      })
      toast.error(detail)
    }
  }

  function onLoadedMetadata() {
    const video = videoRef.current
    const d = video?.duration || 0
    if (Number.isFinite(d) && d > 0) {
      if (d > VIDEO_MAX_DURATION_SECONDS) {
        setSelectionError(`Video must be ${VIDEO_MAX_DURATION_SECONDS} seconds or shorter.`)
        setFile(null)
        setUrl('')
        setDuration(0)
        setStart(0)
        setEnd(0)
        return
      }
      if (duration <= 0) {
        setDuration(d)
        setEnd(d)
        setStart(0)
        setCoverTime(0)
      }
      return
    }
    if (durationRetryTimer.current === null && !previewFallbackAttempted.current) {
      durationRetryTimer.current = window.setTimeout(() => {
        durationRetryTimer.current = null
        const retryDuration = videoRef.current?.duration || 0
        if (!Number.isFinite(retryDuration) || retryDuration <= 0) {
          void prepareGlimpsePreview()
        } else {
          onLoadedMetadata()
        }
      }, 400)
    }
  }

  function onVideoError() {
    setPlaying(false)
    debugUpload('preview-error', {
      file: describeUploadFile(file),
      mediaErrorCode: videoRef.current?.error?.code,
      mediaErrorMessage: videoRef.current?.error?.message,
    })
    if (!previewFallbackAttempted.current) {
      void prepareGlimpsePreview()
    } else {
      toast.error('This video could not be previewed after normalization.')
    }
  }

  function updateCurrent() {
    const value = videoRef.current?.currentTime || 0
    setCurrent(value)
    if (value >= end && playing) {
      if (videoRef.current) videoRef.current.currentTime = start
      videoRef.current?.play().catch(() => {})
    }
  }

  function togglePreview() {
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
      setPlaying(false)
    } else {
      if (videoRef.current.currentTime < start || videoRef.current.currentTime >= end) videoRef.current.currentTime = start
      videoRef.current.playbackRate = speed
      videoRef.current.play().catch(() => {})
      setPlaying(true)
    }
  }

  function trimValueFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const value = Math.max(0, Math.min(duration || 1, ((event.clientX - rect.left) / rect.width) * (duration || 1)))
    const minimumGap = Math.min(0.05, Math.max(0.01, (duration || 1) / 2))
    if (trimDrag.current === 'start') {
      setStart(Math.min(value, Math.max(0, end - minimumGap)))
    } else if (trimDrag.current === 'end') {
      setEnd(Math.max(value, Math.min(duration || 1, start + minimumGap)))
    }
  }

  function beginTrimDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const value = Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration))
    trimDrag.current = Math.abs(value - start) <= Math.abs(value - end) ? 'start' : 'end'
    event.currentTarget.setPointerCapture(event.pointerId)
    trimValueFromPointer(event)
  }

  async function exportTrimmedVideo(): Promise<{ file: File; duration: number }> {
    if (!file || !videoRef.current || end <= start) throw new Error('Choose a valid trim range')
    const source = videoRef.current
    const captureStream = (
      source as HTMLVideoElement & {
        captureStream?: () => MediaStream
        webkitCaptureStream?: () => MediaStream
      }
    ).captureStream?.() || (
      source as HTMLVideoElement & { webkitCaptureStream?: () => MediaStream }
    ).webkitCaptureStream?.()

    if (!captureStream || typeof MediaRecorder === 'undefined') {
      throw new Error('This browser cannot create a trimmed video. Try the latest Chrome, Edge, or Safari.')
    }

    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ]
    const mimeType = mimeCandidates.find(type =>
      typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type)
    )
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(captureStream, mimeType ? { mimeType } : undefined)
    } catch {
      try { recorder = new MediaRecorder(captureStream) }
      catch { throw new Error('This browser could not prepare the trimmed video.') }
    }

    const originalTime = source.currentTime
    const originalRate = source.playbackRate
    const originalMuted = source.muted
    const trackList = captureStream.getTracks()
    let pollTimer: number | null = null
    let seekTimer: number | null = null
    let recorderResult: Promise<Blob>

    try {
      recorderResult = new Promise<Blob>((resolve, reject) => {
        const chunks: Blob[] = []
        recorder.ondataavailable = event => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onerror = () => reject(new Error('The browser failed while trimming the video.'))
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' })
          if (blob.size === 0) reject(new Error('The trimmed video was empty.'))
          else resolve(blob)
        }
      })

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error) => {
          if (settled) return
          settled = true
          if (seekTimer !== null) window.clearTimeout(seekTimer)
          source.removeEventListener('seeked', onSeeked)
          error ? reject(error) : resolve()
        }
        const onSeeked = () => finish()
        source.addEventListener('seeked', onSeeked, { once: true })
        seekTimer = window.setTimeout(() => finish(new Error('The video could not seek to the selected start time.')), 5000)
        try {
          source.currentTime = start
          if (Math.abs(source.currentTime - start) < 0.02) finish()
        } catch {
          finish(new Error('The video could not seek to the selected start time.'))
        }
      })

      source.pause()
      source.playbackRate = speed
      recorder.start(100)
      await source.play()

      const outputDuration = (end - start) / speed
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + Math.max(10_000, outputDuration * 1000 + 10_000)
        const check = () => {
          if (source.currentTime >= end - 0.01 || source.ended) {
            resolve()
          } else if (Date.now() >= deadline) {
            reject(new Error('Trimming timed out. Try a shorter video range.'))
          } else {
            pollTimer = window.setTimeout(check, 50)
          }
        }
        check()
      })

      source.pause()
      if (recorder.state !== 'inactive') recorder.stop()
      const blob = await recorderResult
      const isWebm = (blob.type || mimeType || '').includes('webm')
      const outputMime = (blob.type || mimeType || 'video/webm').split(';', 1)[0]
      const trimmedFile = new File([blob], `glimpse.${isWebm ? 'webm' : 'mp4'}`, {
        type: outputMime,
      })
      if (!isRealUploadFile(trimmedFile)) {
        throw new Error('The trimmed video format is not supported for upload.')
      }
      return { file: trimmedFile, duration: outputDuration }
    } finally {
      if (pollTimer !== null) window.clearTimeout(pollTimer)
      if (seekTimer !== null) window.clearTimeout(seekTimer)
      if (recorder.state !== 'inactive') {
        try { recorder.stop() } catch {}
      }
      trackList.forEach(track => track.stop())
      source.pause()
      source.currentTime = Math.min(originalTime, duration)
      source.playbackRate = originalRate
      source.muted = originalMuted
      setPlaying(false)
    }
  }

  async function publish() {
    if (!file) { toast.error('Select a video first'); return }
    const sourceError = await mediaUploadError(file, 'video')
    if (sourceError) { toast.error(sourceError); return }
    if (!Number.isFinite(duration) || duration <= 0 || end <= start || end - start < 0.05) {
      toast.error('Choose a valid trim range')
      return
    }
    if (end - start > VIDEO_MAX_DURATION_SECONDS + 0.001) {
      toast.error(`Glimpse videos can be up to ${VIDEO_MAX_DURATION_SECONDS} seconds`)
      return
    }
    if (publishState !== 'idle' && publishState !== 'failed') return
    setPublishState('preparing')
    setProgress(0)
    let succeeded = false
    try {
      setPublishState('processing')
      const trimmed = await exportTrimmedVideo()
      if (trimmed.duration > VIDEO_MAX_DURATION_SECONDS) {
        throw new Error(`Video must be ${VIDEO_MAX_DURATION_SECONDS} seconds or shorter.`)
      }
      const trimmedError = await mediaUploadError(trimmed.file, 'video')
      if (trimmedError) throw new Error(trimmedError)
      debugUpload('glimpse-final-file', {
        file: describeUploadFile(trimmed.file),
        selectedRange: { start, end },
        outputDuration: trimmed.duration,
      })
      const fd = new FormData()
      fd.append('data', JSON.stringify({
        type: 'reel',
        content: caption.trim(),
        tags: [],
        visibility: 'public',
        filter,
        trim_start: Number(start.toFixed(3)),
        trim_end: Number(end.toFixed(3)),
        playback_speed: speed,
        cover_time: Number(Math.max(start, Math.min(coverTime, end - 0.01)).toFixed(3)),
        client_processed: true,
        source_duration: Number(duration.toFixed(3)),
      }))
      fd.append('media', trimmed.file)
      debugUpload('glimpse-submit', {
        formDataKeys: Array.from(fd.keys()),
        finalFile: describeUploadFile(trimmed.file),
      })
      setPublishState('uploading')
      const res = await postsApi.createPost(fd, {
        onUploadProgress: event => {
          if (!event.total) return
          const nextProgress = Math.round((event.loaded / event.total) * 100)
          setProgress(nextProgress)
        },
      })
      setPublishState('publishing')
      debugUpload('glimpse-response', {
        status: res.status,
        success: res.data?.success,
        hasCreatedGlimpse: Boolean(res.data?.data?.id),
      })
      if (res.data.data) {
        prependPost(res.data.data)
        prependReel(res.data.data)
      }
      setPublishState('published')
      succeeded = true
      toast.success('Glimpse shared!')
      navigateToAppRoot(navigate, routeLocation.pathname, '/app/glimpse')
    } catch (err: any) {
      setPublishState('failed')
      toast.error(err?.response?.data?.error || err?.message || 'Could not share Glimpse')
    } finally {
      setProgress(succeeded ? 100 : 0)
      if (!succeeded) setPublishState('failed')
    }
  }

  const trimLength = Math.max(0, end - start)
  const format = (value: number) => {
    const hundredths = Math.max(0, Math.round(value * 100))
    const minutes = Math.floor(hundredths / 6000)
    const seconds = Math.floor(hundredths / 100) % 60
    const fraction = hundredths % 100
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`
  }
  const filters = [
    { label: 'Original', value: 'none', css: 'none' },
    { label: 'Vivid', value: 'vivid', css: 'saturate(1.45) contrast(1.12)' },
    { label: 'Warm', value: 'warm', css: 'sepia(.25) saturate(1.2)' },
    { label: 'Mono', value: 'mono', css: 'grayscale(1) contrast(1.1)' },
  ]
  const activeFilter = filters.find(item => item.value === filter) || filters[0]
  const busy = !['idle', 'failed', 'published'].includes(publishState)
  const shareReady = Boolean(file && duration > 0 && end > start && !busy)
  const statusLabel: Record<GlimpsePublishState, string> = {
    idle: '', preparing: 'Preparing…', uploading: `Uploading… ${progress}%`,
    processing: 'Processing video…', publishing: 'Publishing…', published: 'Published', failed: 'Retry share',
  }

  return (
    <div data-theme="dark" style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#07060B', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(12px + env(safe-area-inset-top)) 16px 12px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
        <button onClick={requestAppBack} style={iconBtnStyle}><X size={22} color="#fff" /></button>
        <span style={headerTitleStyle}>New Glimpse</span>
        <button onClick={publish} disabled={!shareReady} style={{ border: 0, borderRadius: 999, padding: '8px 16px', background: shareReady ? 'var(--color-lime)' : 'rgba(187,255,0,.35)', color: '#0D0B12', fontWeight: 800, cursor: shareReady ? 'pointer' : 'not-allowed' }}>
          {publishState === 'failed' ? 'Retry' : busy ? statusLabel[publishState] : 'Share'}
        </button>
      </div>
      {publishState !== 'idle' && (
        <div role="status" aria-live="polite" style={{ padding: '8px 16px', color: publishState === 'failed' ? '#ff9f9f' : 'var(--color-lime)', fontSize: 12, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          {statusLabel[publishState]}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 28 }}>
        {!url ? (
          <button onClick={() => inputRef.current?.click()} style={{ margin: '22px auto', width: 'calc(100% - 32px)', maxWidth: 430, height: 430, borderRadius: 24, border: '1px dashed rgba(187,255,0,.45)', background: 'linear-gradient(145deg, rgba(24,24,27,.35), rgba(255,255,255,.04))', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer' }}>
            <FilmIcon />
            <strong style={{ fontSize: 20, fontFamily: 'var(--font-display)' }}>Choose a video</strong>
            <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 13 }}>Create a vertical Glimpse up to {VIDEO_MAX_DURATION_SECONDS} seconds</span>
          </button>
        ) : (
          <>
            <div style={{ position: 'relative', width: 'min(calc(100% - 32px), 430px)', aspectRatio: '9/16', maxHeight: '58dvh', margin: '18px auto', borderRadius: 22, overflow: 'hidden', background: '#000', boxShadow: '0 18px 45px rgba(0,0,0,.45)' }}>
              <video ref={videoRef} src={url} preload="metadata" onLoadedMetadata={onLoadedMetadata} onDurationChange={onLoadedMetadata} onCanPlay={onLoadedMetadata} onError={onVideoError} onTimeUpdate={updateCurrent} onEnded={() => setPlaying(false)} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', filter: activeFilter.css }} />
              <button onClick={togglePreview} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 58, height: 58, borderRadius: '50%', border: '1px solid rgba(255,255,255,.5)', background: 'rgba(0,0,0,.48)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {playing ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
              </button>
              <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 12, textShadow: '0 1px 4px #000' }}>
                <span>{format(current)}</span><span>{format(duration)}</span>
              </div>
            </div>
            <section style={{ ...panelStyle, padding: 16, background: 'linear-gradient(145deg, rgba(255,255,255,.075), rgba(255,255,255,.035))', boxShadow: '0 12px 30px rgba(0,0,0,.18)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={sectionTitle}><Scissors size={16} color="var(--color-lime)" /> Trim video</div>
                  <div style={{ marginTop: 5, color: 'rgba(255,255,255,.48)', fontSize: 12 }}>Drag either handle to choose the part to share</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <strong style={{ display: 'block', color: 'var(--color-lime)', fontSize: 19, letterSpacing: '.02em' }}>{format(trimLength)}</strong>
                  <span style={{ color: 'rgba(255,255,255,.42)', fontSize: 11 }}>selected of {format(duration)}</span>
                </div>
              </div>
              <div
                onPointerDown={beginTrimDrag}
                onPointerMove={trimValueFromPointer}
                onPointerUp={() => { trimDrag.current = null }}
                onPointerCancel={() => { trimDrag.current = null }}
                style={{ position: 'relative', height: 74, margin: '16px 0 0', padding: 5, boxSizing: 'border-box', background: 'rgba(7,6,11,.72)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, overflow: 'hidden', touchAction: 'none', userSelect: 'none', cursor: 'ew-resize' }}
              >
                <div style={{ position: 'absolute', inset: 5, display: 'flex', gap: 2, overflow: 'hidden', borderRadius: 9, pointerEvents: 'none' }}>
                  {(thumbnails.length ? thumbnails : Array.from({ length: 9 }, () => '')).map((thumbnail, index) => (
                    <div key={index} style={{ flex: 1, minWidth: 0, background: thumbnail ? `url(${thumbnail}) center / cover` : 'linear-gradient(135deg, rgba(24,24,27,.42), rgba(255,255,255,.08))', opacity: thumbnail ? 0.9 : 0.65 }} />
                  ))}
                </div>
                <div style={{ position: 'absolute', inset: 5, left: 0, width: `${(start / (duration || 1)) * 100}%`, background: 'rgba(4,3,8,.62)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', inset: 5, left: `${(end / (duration || 1)) * 100}%`, right: 0, background: 'rgba(4,3,8,.62)', pointerEvents: 'none' }} />
                <div aria-hidden style={{ position: 'absolute', top: 2, bottom: 2, left: `${(start / (duration || 1)) * 100}%`, width: 4, transform: 'translateX(-2px)', borderRadius: 5, background: 'var(--color-lime)', boxShadow: '0 0 14px rgba(187,255,0,.75)', pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', width: 24, height: 42, transform: 'translate(-50%, -50%)', border: '2px solid var(--color-lime)', borderRadius: 9, background: 'rgba(13,11,18,.5)', boxShadow: '0 3px 12px rgba(0,0,0,.35)' }} />
                </div>
                <div aria-hidden style={{ position: 'absolute', top: 2, bottom: 2, left: `${(end / (duration || 1)) * 100}%`, width: 4, transform: 'translateX(-2px)', borderRadius: 5, background: 'var(--color-lime)', boxShadow: '0 0 14px rgba(187,255,0,.75)', pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', width: 24, height: 42, transform: 'translate(-50%, -50%)', border: '2px solid var(--color-lime)', borderRadius: 9, background: 'rgba(13,11,18,.5)', boxShadow: '0 3px 12px rgba(0,0,0,.35)' }} />
                </div>
                <input className="glimpse-range" aria-label="Trim start" type="range" min={0} max={duration || 1} step=".05" value={start} onChange={e => setStart(Math.max(0, Math.min(Number(e.target.value), Math.max(0, end - .05))))} style={{ ...rangeStyle, pointerEvents: 'none' }} />
                <input className="glimpse-range" aria-label="Trim end" type="range" min={0} max={duration || 1} step=".05" value={end} onChange={e => setEnd(Math.min(duration || 1, Math.max(Number(e.target.value), Math.min(duration || 1, start + .05))))} style={{ ...rangeStyle, pointerEvents: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                {[
                  ['Start', format(start)],
                  ['End', format(end)],
                  ['Duration', format(trimLength)],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '8px 9px', borderRadius: 10, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.08)' }}>
                    <span style={{ display: 'block', color: 'rgba(255,255,255,.42)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
                    <strong style={{ display: 'block', marginTop: 3, color: '#fff', fontSize: 13 }}>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section style={panelStyle}>
              <div style={sectionTitle}><Wand2 size={16} color="var(--color-lime)" /> Filters</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 10 }}>
                {filters.map(item => <button key={item.label} onClick={() => setFilter(item.value)} style={{ border: filter === item.value ? '2px solid var(--color-lime)' : '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '8px 12px', background: 'rgba(255,255,255,.06)', color: '#fff', whiteSpace: 'nowrap' }}>{item.label}</button>)}
              </div>
            </section>
            <section style={panelStyle}>
              <div style={sectionTitle}>Playback speed</div>
              <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
                {[.5, 1, 1.5, 2].map(value => <button key={value} onClick={() => { setSpeed(value); if (videoRef.current) videoRef.current.playbackRate = value }} style={{ flex: 1, border: speed === value ? '1px solid var(--color-lime)' : '1px solid rgba(255,255,255,.14)', borderRadius: 10, padding: 8, background: speed === value ? 'rgba(187,255,0,.12)' : 'rgba(255,255,255,.05)', color: speed === value ? 'var(--color-lime)' : '#fff' }}>{value}×</button>)}
              </div>
            </section>
          </>
        )}
        <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { void chooseVideo(e.currentTarget.files?.[0] || null); e.currentTarget.value = '' }} />
        {url && <div style={{ padding: '0 16px' }}><textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} placeholder="Write a caption for your Glimpse…" style={{ width: '100%', boxSizing: 'border-box', resize: 'none', borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#fff', padding: 14, outline: 'none', fontFamily: 'var(--font-body)' }} /><button onClick={() => setCoverTime(current)} style={{ marginTop: 10, border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '8px 14px', background: 'rgba(255,255,255,.06)', color: '#fff' }}>Use current frame as cover</button><span style={{ marginLeft: 10, color: 'rgba(255,255,255,.45)', fontSize: 12 }}>{format(coverTime)}</span></div>}
      </div>
      <AlertDialog message={selectionError} onClose={() => setSelectionError(null)} />
    </div>
  )
}

function FilmIcon() {
  return <div style={{ width: 68, height: 68, borderRadius: 22, background: 'rgba(187,255,0,.12)', color: 'var(--color-lime)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Layers size={32} /></div>
}

const panelStyle: React.CSSProperties = { margin: '12px 16px', padding: 14, borderRadius: 16, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.1)' }
const sectionTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)' }
const rangeStyle: React.CSSProperties = { position: 'absolute', left: 0, right: 0, top: 12, width: '100%', accentColor: 'var(--color-lime)', pointerEvents: 'auto' }

/* ── Shared sub-components ── */
function OptionRow({ icon, label, muted, onClick, input }: any) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '14px 16px', borderBottom: '1px solid var(--color-border)',
      cursor: onClick ? 'pointer' : 'default',
    }}
      onClick={onClick}
    >
      {icon}
      {input ?? (
        <span style={{ flex: 1, fontSize: '15px', color: muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)', fontFamily: 'var(--font-body)' }}>
          {label}
        </span>
      )}
      {!input && <span style={{ fontSize: '20px', color: 'var(--color-text-muted)' }}>›</span>}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '11px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  WebkitTapHighlightColor: 'transparent',
  minWidth: 44, minHeight: 44,
}

const headerTitleStyle: React.CSSProperties = {
  fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)',
}
