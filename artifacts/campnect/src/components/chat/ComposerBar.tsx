import React, { useRef, useState, useEffect } from 'react'
import { Send, Mic, X, Square, Plus, Smile } from 'lucide-react'
import type { Message } from '../../stores/chatStore'
import { requestCallMedia } from '../../utils/permissions'
import type { RuntimePermissionSnapshot } from '../../capacitor/plugins'
import { ChatMediaPickerSheet } from './ChatMediaPickerSheet'
import { preserveTextareaFocusOnTextSendPointerDown } from './composerTextSendPointer'
import { SharedPostReplyPreview } from './SharedPostReplyPreview'
import { parseSharedPostPayload } from './sharedPostPayload'
import { GiphyPicker } from './GiphyPicker'
import type { GiphyKind, GiphySelection } from '../../features/giphy/provider'

interface ComposerBarProps {
  onSend: (text: string, replyToId?: string) => void
  onSendGiphy?: (selection: GiphySelection, kind: GiphyKind) => void
  /** Called when user is typing (debounced in parent) */
  onTypingChange?: (isTyping: boolean) => void
  /** Legacy alias — use onTypingChange */
  onTyping?: () => void
  replyTo?: Message | null
  onClearReply?: () => void
  /** Legacy alias — use onClearReply */
  onCancelReply?: () => void
  /** Optional handler for media attachment — receives the file and its type */
  onSendMedia?: (file: File, type: 'image' | 'video' | 'audio') => Promise<void> | void
  disabled?: boolean
  containerRef?: React.Ref<HTMLDivElement>
}

export function ComposerBar({ onSend, onSendGiphy, onTyping, onTypingChange, replyTo, onCancelReply, onClearReply, onSendMedia, disabled, containerRef }: ComposerBarProps) {
  const [text, setText] = useState('')
  const [pressed, setPressed] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingError, setRecordingError] = useState('')
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [pickerMode, setPickerMode] = useState<'emoji' | 'sticker' | 'gif' | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<number | null>(null)
  const cancelRecordingRef = useRef(false)

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [text])

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, replyTo?.id)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    ;(onClearReply ?? onCancelReply)?.()
  }

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
      const recorder = recorderRef.current
      if (!recorder) return
      cancelRecordingRef.current = true
      if (recorder.state !== 'inactive') recorder.stop()
      recorder.stream.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    const handlePermissionChange = (event: Event) => {
      const permissions = (event as CustomEvent<RuntimePermissionSnapshot>).detail
      if (permissions?.microphone === 'granted') setRecordingError('')
    }
    window.addEventListener('campnect:permissions-changed', handlePermissionChange)
    return () => window.removeEventListener('campnect:permissions-changed', handlePermissionChange)
  }, [])

  async function handleMicPress() {
    if (!onSendMedia || disabled) return
    if (recording) {
      cancelRecordingRef.current = false
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError('Voice recording is not supported on this device.')
      return
    }
    let requestedStream: MediaStream | null = null
    try {
      const microphone = await requestCallMedia('voice')
      if (!microphone.stream) {
        setRecordingError(microphone.message || 'Microphone permission is required for voice notes.')
        return
      }
      const stream = microphone.stream
      requestedStream = stream
      const preferredMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find((mime) => MediaRecorder.isTypeSupported(mime))
      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream)
      chunksRef.current = []
      cancelRecordingRef.current = false
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const wasCancelled = cancelRecordingRef.current
        cancelRecordingRef.current = false
        // Some Android WebViews report `audio/webm;codecs=opus` as the
        // recorder MIME. Keep the codec in the bytes, but send the base MIME
        // to multer so the upload is accepted and the response is playable.
        const rawMime = recorder.mimeType || preferredMime || 'audio/webm'
        const mime = rawMime.split(';')[0] || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mime })
        const extension = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
        if (!wasCancelled && blob.size > 0 && onSendMedia) {
          const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: mime })
          void Promise.resolve(onSendMedia(file, 'audio')).catch(() => {
            setRecordingError('Voice note could not be sent. Try again.')
          })
        } else if (!wasCancelled && blob.size === 0) {
          setRecordingError('No audio was captured. Check microphone access and try again.')
        }
        stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        chunksRef.current = []
        setRecording(false)
        setRecordingSeconds(0)
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
      // A short timeslice makes WebView recordings flush reliable chunks
      // instead of depending on a single final dataavailable event.
      recorder.start(250)
      setRecording(true)
      setRecordingError('')
      setRecordingSeconds(0)
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000)
    } catch {
      requestedStream?.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      chunksRef.current = []
      setRecording(false)
      setRecordingSeconds(0)
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
      setRecordingError('Allow microphone access to record a voice note.')
    }
  }

  function cancelRecording() {
    const recorder = recorderRef.current
    if (!recorder) return
    cancelRecordingRef.current = true
    if (recorder.state === 'inactive') {
      recorder.stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      chunksRef.current = []
      setRecording(false)
      setRecordingSeconds(0)
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
      cancelRecordingRef.current = false
      return
    }
    recorder.stop()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function openPicker() {
    // Dismiss the native keyboard before mounting the picker. On Android a
    // focused textarea otherwise leaves the IME over the picker controls.
    textareaRef.current?.blur()
    setPickerMode('emoji')
  }

  function returnToComposer() {
    setPickerMode(null)
    // Wait for the picker to unmount before reopening the IME.
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const hasText = text.trim().length > 0
  const sharedPostReply = parseSharedPostPayload(replyTo?.content)

  return (
    <div style={{
      position:       'relative',
      width:          '100%',
      maxWidth:       '100vw',
      minWidth:       0,
      boxSizing:      'border-box',
      flexShrink:     0,
      zIndex:         2,
      background:     'transparent',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      borderTop:      'none',
      boxShadow:      'none',
       paddingTop:     '8px',
       paddingLeft:    'var(--sal)',
       paddingRight:   'var(--sar)',
       paddingBottom:  'max(var(--sab), 8px)',
    }} className="chat-composer" ref={containerRef}>
      {/* Reply preview */}
      {replyTo && (
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '10px',
          padding:    '8px 14px 4px',
          borderBottom: '1px solid var(--chat-divider)',
        }}>
          <div style={{
            flex:         1,
            minWidth:     0,
            padding:      '6px 10px',
            background:   'var(--chat-soft-surface)',
            border:       '1px solid var(--chat-divider)',
            borderRadius: '8px',
            borderLeft:   '3px solid var(--chat-accent)',
          }}>
            {sharedPostReply ? (
              <SharedPostReplyPreview content={replyTo.content} fallbackAuthor={replyTo.full_name} />
            ) : (
              <>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--chat-accent)', marginBottom: '2px' }}>
                  {replyTo.full_name}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--chat-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {replyTo.content ?? '📎 Attachment'}
                </p>
              </>
            )}
          </div>
          <button onClick={onClearReply ?? onCancelReply} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#737987', display: 'flex', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {recordingError && (
          <div style={{ padding: '8px 14px 0', color: '#b52d49', fontSize: '12px', textAlign: 'center' }}>
          {recordingError}
        </div>
      )}

      {recording && (
        <div className="chat-composer-recording-banner" data-swipe-ignore style={{
          display: 'flex', alignItems: 'center', gap: '10px', margin: '2px 12px 0',
          padding: '11px 12px', minHeight: 48, boxSizing: 'border-box', borderRadius: '16px',
           background: '#fff7f8',
           border: '1px solid #f2c1ca',
           boxShadow: '0 6px 18px rgba(176,43,69,0.08)',
        }}>
           <span className="chat-composer-recording-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: '#e1442d', boxShadow: '0 0 0 5px rgba(225,68,45,0.12), 0 0 14px rgba(225,68,45,0.22)', flexShrink: 0 }} />
           <span className="chat-composer-recording-copy" style={{ flex: 1, minWidth: 0, color: '#5b2130', fontSize: '13px', fontWeight: 800 }}>
             <span style={{ display: 'block', color: '#171a22' }}>Recording voice note</span>
             <span style={{ display: 'block', marginTop: 2, color: '#b52d49', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>{recordingSeconds}s · stop to send</span>
          </span>
           <div className="chat-composer-recording-actions">
             <button type="button" onClick={cancelRecording} aria-label="Cancel voice note" style={{ minWidth: 54, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px solid #e2e5ea', borderRadius: 11, padding: '0 9px', background: '#ffffff', color: '#626a78', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>
               <X size={12} />
               <span>Cancel</span>
             </button>
             <button type="button" onClick={handleMicPress} aria-label="Stop and send voice note" style={{ minWidth: 52, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, border: 'none', borderRadius: 11, padding: '0 10px', background: 'var(--chat-accent)', color: '#fff', fontSize: '11px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 12px var(--chat-accent-soft)' }}>
               <Square size={12} fill="currentColor" />
               <span>Send</span>
             </button>
           </div>
        </div>
      )}

      {/* Input row */}
       <div className="chat-composer-input-row" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '10px 12px 10px' }}>
        {/* Textarea wrapper */}
         <div className="chat-composer-input-shell" style={{
          flex:           1,
          display:        'flex',
          alignItems:     'center',
            background: 'var(--chat-input-bg)',
           backdropFilter: 'blur(8px)',
            border:         '1.5px solid var(--chat-input-border)',
          borderRadius:   '9999px',
          padding:        '0 16px',
          transition:     'border-color 200ms ease, box-shadow 200ms ease',
            boxShadow:      hasText ? '0 0 0 2px var(--chat-input-ring)' : 'none',
            borderColor:    hasText ? 'var(--chat-input-focus)' : 'var(--chat-input-border)',
        }}>
          <textarea
            ref={textareaRef}
            className="chat-composer-textarea"
            value={text}
            onChange={(e) => { setText(e.target.value); onTyping?.(); onTypingChange?.(e.target.value.trim().length > 0) }}
            onKeyDown={handleKeyDown}
            placeholder="Send message…"
            rows={1}
            disabled={disabled}
            style={{
              flex:       1,
              background: 'transparent',
              border:     'none',
              outline:    'none',
              resize:     'none',
               color:      'var(--chat-text)',
              fontSize:   '15px',
              fontFamily: 'var(--font-body)',
              lineHeight: '1.45',
              padding:    '10px 0',
              minHeight:  '40px',
              maxHeight:  '120px',
              overflowY:  'auto',
              scrollbarWidth: 'none',
            }}
          />
          <button
            type="button"
            aria-label="Open emoji, sticker, and GIF picker"
            aria-expanded={Boolean(pickerMode)}
            disabled={disabled}
            onClick={openPicker}
            style={{ border: 0, background: 'transparent', color: 'var(--chat-text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}
          >
            <Smile size={19} />
          </button>
        </div>

        {/* Attachment button */}
        {onSendMedia && (
          <button
             className="chat-composer-attach-button"
            type="button"
            aria-label="Open photo and video gallery"
            onClick={() => setShowMediaPicker(true)}
            style={{
              width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
               background: 'transparent', border: '1.5px solid var(--chat-accent)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
               color: 'var(--chat-accent)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Plus size={18} />
          </button>
        )}

         {/* Send / voice-note button */}
         <button
            className="chat-composer-send-button"
           type="button"
           onClick={hasText ? handleSend : handleMicPress}
           aria-label={hasText ? 'Send message' : recording ? 'Stop and send voice note' : 'Record voice note'}
          disabled={disabled || (!hasText && !onSendMedia)}
           onPointerDown={(event) => {
             preserveTextareaFocusOnTextSendPointerDown(event.nativeEvent, hasText && !disabled)
             setPressed(true)
           }}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          style={{
            width:        '42px',
            height:       '42px',
            borderRadius: '50%',
             background:   hasText
                ? 'var(--chat-own-bubble)'
               : recording
               ? 'rgba(220,38,38,0.88)'
               : 'transparent',
            border:       (hasText || onSendMedia)
              ? 'none'
              : 'none',
            cursor:       (hasText || onSendMedia) && !disabled ? 'pointer' : 'default',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
              color:        (hasText || recording) ? '#fff' : 'var(--chat-accent)',
            transform:    pressed && (hasText || onSendMedia) ? 'scale(0.88)' : 'scale(1)',
            transition:   'all 180ms cubic-bezier(0.34,1.56,0.64,1)',
             boxShadow:    hasText
                ? 'var(--chat-own-shadow)'
               : recording
               ? '0 0 0 3px rgba(220,38,38,0.30)'
               : 'none',
            flexShrink:   0,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
           {hasText ? <Send size={18} /> : recording ? <span style={{ fontSize: '11px', fontWeight: 800 }}>{recordingSeconds}s</span> : <Mic size={18} />}
        </button>
      </div>
      {onSendMedia && (
        <ChatMediaPickerSheet
          open={showMediaPicker}
          disabled={disabled}
          onClose={() => setShowMediaPicker(false)}
          onSendMedia={onSendMedia}
        />
      )}
      {pickerMode && (
        <GiphyPicker
          initialMode={pickerMode}
          onClose={() => setPickerMode(null)}
          onEmojiSelect={(emoji) => {
            setText((current) => `${current}${emoji}`)
            returnToComposer()
          }}
           onGiphySelect={(selection, kind) => {
             onSendGiphy?.(selection, kind)
            returnToComposer()
          }}
        />
      )}
    </div>
  )
}
