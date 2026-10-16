import { DEMO_MODE } from '../../demo/config'
import { DemoCallPreview } from '../../demo/components'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, X, Volume2, VolumeX, ChevronDown, ChevronUp } from 'lucide-react'
import { Avatar } from '../../components/shared/Avatar'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { getSocket, useSocket } from '../../hooks/useSocket'
import { useCallStore, ActiveCall } from '../../stores/callStore'
import { CallAudio } from '../../capacitor/plugins'
import { requestCallMedia } from '../../utils/permissions'
import { requestAppBack } from '../../navigation/appBackRequest'

type CallStatus = 'calling' | 'ringing' | 'connected' | 'ended'
type PeerMap = Record<string, RTCPeerConnection>

const ICE_SERVERS: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export function CallScreen({ overlay = false, session, bottomNavVisible = false }: { overlay?: boolean; session?: ActiveCall; bottomNavVisible?: boolean }) {
  return DEMO_MODE ? <DemoCallPreview session={session} /> : <ProductionCallScreen overlay={overlay} session={session} bottomNavVisible={bottomNavVisible} />
}

function ProductionCallScreen({ overlay = false, session, bottomNavVisible = false }: { overlay?: boolean; session?: ActiveCall; bottomNavVisible?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: convId } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const { isConnected } = useSocket()
  const socket = getSocket()
  const conversations = useChatStore((s) => s.conversations)
  const user = useAuthStore((s) => s.user)
  const storedCall = useCallStore((s) => s.activeCall)
  const activeSession = session || storedCall
  const effectiveConvId = convId || activeSession?.conversationId
  const conv = conversations.find((c) => c.id === effectiveConvId)
  const callType = (params.get('type') || activeSession?.type) === 'video' ? 'video' : 'voice'
  const incoming = params.get('incoming') === '1' || Boolean(activeSession?.incoming)
  const callId = params.get('callId') || activeSession?.callId || useRef(crypto.randomUUID()).current
  const callInfo = (location.state || {}) as any
  const [status, setStatus] = useState<CallStatus>(incoming ? 'ringing' : 'calling')
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(callType !== 'video')
  const [speakerOn, setSpeakerOn] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const [accepted, setAccepted] = useState(!incoming)
  const peers = useRef<PeerMap>({})
  const localStream = useRef<MediaStream | null>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const mutedRef = useRef(false)
  const cameraOffRef = useRef(callType !== 'video')
  const startedInvite = useRef(false)
  const remoteUserId = callInfo.fromUserId || activeSession?.fromUserId
  const fromName = callInfo.fromName || activeSession?.fromName
  const fromAvatar = callInfo.fromAvatar || activeSession?.fromAvatar
  const ringtoneContext = useRef<AudioContext | null>(null)
  const ringtoneTimer = useRef<number | null>(null)

  const name = conv?.type === 'group' ? (conv.name || 'Group') : (fromName || conv?.members?.find((m) => m.id !== user?.id)?.full_name || 'Contact')
  const avatar = conv?.type === 'group' ? conv.avatar_url : (fromAvatar || conv?.members?.find((m) => m.id !== user?.id)?.avatar_url)

  const endCall = useCallback(() => {
    socket?.emit('call:end', { conversationId: effectiveConvId, callId, type: callType })
    Object.values(peers.current).forEach((peer) => peer.close())
    peers.current = {}
    localStream.current?.getTracks().forEach((track) => track.stop())
    void CallAudio.reset().catch(() => {})
    setStatus('ended')
    useCallStore.getState().clearActiveCall()
    if (!overlay) setTimeout(requestAppBack, 500)
  }, [socket, effectiveConvId, callId, callType, navigate, overlay])

  // A short Web Audio ringtone works in browsers and in Capacitor WebView.
  // It is stopped on accept/decline/unmount so it cannot continue below the UI.
  useEffect(() => {
    const shouldRing = (incoming && !accepted && status === 'ringing') ||
      (!incoming && (status === 'calling' || status === 'ringing'))
    if (!shouldRing) return
    let stopped = false
    const ring = () => {
      if (stopped) return
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioCtx) return
        const ctx = ringtoneContext.current || new AudioCtx()
        ringtoneContext.current = ctx
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.48)
      } catch {}
      ringtoneTimer.current = window.setTimeout(ring, 1200)
    }
    ring()
    return () => {
      stopped = true
      if (ringtoneTimer.current) window.clearTimeout(ringtoneTimer.current)
      ringtoneTimer.current = null
      void ringtoneContext.current?.close().catch(() => {})
      ringtoneContext.current = null
    }
  }, [incoming, accepted, status])

  const createPeer = useCallback((remoteUserId: string) => {
    if (!socket || !effectiveConvId || peers.current[remoteUserId]) return peers.current[remoteUserId]
    const peer = new RTCPeerConnection(ICE_SERVERS)
    localStream.current?.getTracks().forEach((track) => peer.addTrack(track, localStream.current!))
    peer.onicecandidate = (event) => {
      if (event.candidate) socket.emit('call:signal', { conversationId: effectiveConvId, callId, targetUserId: remoteUserId, signalType: 'ice', signal: event.candidate })
    }
    peer.ontrack = (event) => setRemoteStreams((current) => ({ ...current, [remoteUserId]: event.streams[0] }))
    peer.onconnectionstatechange = () => {
      if (['connected', 'completed'].includes(peer.connectionState)) setStatus('connected')
    }
    peers.current[remoteUserId] = peer
    return peer
  }, [socket, effectiveConvId, callId])

  const startLocalMedia = useCallback(async () => {
    if (localStream.current) return localStream.current
    try {
      const media = await requestCallMedia(callType)
      if (!media.stream) {
        setError(media.message || `${callType === 'video' ? 'Camera and microphone' : 'Microphone'} access is required for calls.`)
        return null
      }
      localStream.current = media.stream
      localStream.current.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current })
      localStream.current.getVideoTracks().forEach((track) => { track.enabled = !cameraOffRef.current })
      if (localVideo.current) localVideo.current.srcObject = localStream.current
      return localStream.current
    } catch (error: any) {
      setError(error?.message || `${callType === 'video' ? 'Camera and microphone' : 'Microphone'} access is required for calls.`)
      return null
    }
  }, [callType])

  const sendOffer = useCallback(async (remoteUserId: string) => {
    const stream = await startLocalMedia()
    if (!stream || !socket || !effectiveConvId) return
    const peer = createPeer(remoteUserId)
    if (!peer) return
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    socket.emit('call:signal', { conversationId: effectiveConvId, callId, targetUserId: remoteUserId, signalType: 'offer', signal: offer })
    setStatus('calling')
  }, [startLocalMedia, socket, effectiveConvId, callId, createPeer])

  useEffect(() => {
    if (!socket || !effectiveConvId || !isConnected || (incoming && !accepted)) return
    socket.emit('join:conversation', effectiveConvId)
    const onAccepted = (data: any) => {
      if (data.callId !== callId || data.fromUserId === user?.id) return
      void sendOffer(data.fromUserId)
    }
    const onDelivery = (data: any) => {
      if (data.callId === callId && !incoming) setStatus(data.reachable ? 'ringing' : 'calling')
    }
    const onSignal = async (data: any) => {
      if (data.callId !== callId || data.targetUserId !== user?.id) return
       // Add local tracks before creating the peer. Creating it first meant
       // the callee answered without camera/microphone senders.
       await startLocalMedia()
       const peer = createPeer(data.fromUserId)
      if (!peer) return
      if (data.signalType === 'offer') {
        await peer.setRemoteDescription(data.signal)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        socket.emit('call:signal', { conversationId: effectiveConvId, callId, targetUserId: data.fromUserId, signalType: 'answer', signal: answer })
        setStatus('connected')
      } else if (data.signalType === 'answer') {
        await peer.setRemoteDescription(data.signal)
        setStatus('connected')
      } else if (data.signalType === 'ice') {
        try { await peer.addIceCandidate(data.signal) } catch {}
      }
    }
    const onEnded = (data: any) => {
      if (data.callId === callId) endCall()
    }
    socket.on('call:accepted', onAccepted)
    socket.on('call:delivery', onDelivery)
    socket.on('call:signal', onSignal)
    socket.on('call:ended', onEnded)
    if (!incoming && !startedInvite.current) {
      startedInvite.current = true
      void startLocalMedia().then(() => {
         socket.emit('call:invite', { conversationId: effectiveConvId, callId, type: callType })
        if (conv?.type === 'private') {
          // The callee accepts from the incoming route; offers are sent then.
          setStatus('calling')
        }
      })
    }
    return () => {
      socket.emit('leave:conversation', effectiveConvId)
      socket.off('call:accepted', onAccepted)
      socket.off('call:delivery', onDelivery)
      socket.off('call:signal', onSignal)
      socket.off('call:ended', onEnded)
    }
  }, [socket, effectiveConvId, callId, callType, incoming, accepted, isConnected, user?.id, conv?.type, sendOffer, startLocalMedia, createPeer, endCall])

  function acceptIncomingCall() {
    if (!socket || !effectiveConvId || !remoteUserId) return
    setAccepted(true)
    setStatus('calling')
    socket.emit('call:accept', { conversationId: effectiveConvId, callId, targetUserId: remoteUserId })
    void startLocalMedia()
  }

  useEffect(() => {
    if (status !== 'connected') return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [status])

  function toggleMute() {
    const next = !muted
    mutedRef.current = next
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
  }

  function toggleCamera() {
    const next = !cameraOff
    cameraOffRef.current = next
    localStream.current?.getVideoTracks().forEach((track) => { track.enabled = !next })
    setCameraOff(next)
  }

  function toggleSpeaker() {
    const next = !speakerOn
    setSpeakerOn(next)
    void CallAudio.setSpeaker({ enabled: next }).catch(() => {})
    document.querySelectorAll<HTMLElement>('[data-call-remote-audio], [data-call-remote-video]').forEach((element) => {
      const media = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }
      if (media.setSinkId) {
        void media.setSinkId(next ? 'default' : 'communications').catch(() => {})
      }
    })
  }

  const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
  const phoneWidth = '100%'
  const expandedOverlay = overlay && !minimized
  const bottomNavigationSpace = 'calc(80px + env(safe-area-inset-bottom, 0px))'
  // BottomNav is 64px high and sits 16px above the safe-area edge. Keep a
  // 12px touch-safe gap between it and the minimized call surface.
  const minimizedBottom = bottomNavVisible
    ? 'calc(92px + env(safe-area-inset-bottom, 0px))'
    : 'calc(12px + env(safe-area-inset-bottom, 0px))'
  const callView = (
  <div style={{
    position: 'fixed',
    left: '50%',
    bottom: overlay && minimized ? minimizedBottom : expandedOverlay ? bottomNavigationSpace : undefined,
    top: overlay && minimized ? undefined : 0,
    transform: 'translateX(-50%)',
    width: overlay && minimized ? 'min(calc(100% - 24px), 520px)' : phoneWidth,
    height: overlay && minimized ? 64 : expandedOverlay ? `calc(var(--visual-viewport-height, 100dvh) - ${bottomNavigationSpace})` : '100%',
    maxHeight: overlay && minimized ? undefined : expandedOverlay ? `calc(var(--visual-viewport-height, 100dvh) - ${bottomNavigationSpace})` : '100%',
    borderRadius: overlay && minimized ? 24 : 0,
    zIndex: 600,
     background: status === 'connected'
       ? 'radial-gradient(ellipse 100% 70% at 50% 0%, rgba(28,92,62,.40) 0%, #10151A 72%)'
       : '#15181E',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    padding: overlay && minimized ? '10px 12px' : 'calc(18px + env(safe-area-inset-top, 0px)) 18px calc(30px + env(safe-area-inset-bottom, 0px))',
    boxShadow: overlay && minimized
      ? '0 12px 40px rgba(0,0,0,.55)'
      : '0 0 0 100vmax rgba(5, 3, 14, 0.78)',
    overflow: 'hidden',
  }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         {overlay ? (
           <button onClick={() => setMinimized((value) => !value)} aria-label={minimized ? 'Expand call' : 'Send call to background'} style={{ border: 'none', background: 'rgba(255,255,255,.08)', color: '#fff', borderRadius: 999, padding: 8, display: 'flex' }}>
             {minimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
           </button>
         ) : (
           <button onClick={endCall} aria-label="End call" style={{ border: 'none', background: 'rgba(255,255,255,.08)', color: '#fff', borderRadius: 999, padding: 10, display: 'flex' }}><X size={18} /></button>
         )}
          <span style={{ color: 'rgba(255,255,255,.72)', fontSize: 13, fontWeight: 600 }}>{callType === 'video' ? 'Video call' : 'Audio call'} · {status === 'connected' ? time : status === 'ringing' ? 'Ringing' : 'Calling'}</span>
         {overlay && minimized ? (
           <button onClick={endCall} aria-label="End call" style={{ border: 'none', background: 'rgba(239,68,68,.20)', color: '#FCA5A5', borderRadius: 999, padding: 8, display: 'flex' }}><PhoneOff size={16} /></button>
         ) : <span style={{ width: 34 }} />}
      </div>
       {minimized && overlay && (
         <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, color: 'rgba(255,255,255,.55)', fontSize: 11 }}>
           <span style={{ width: 7, height: 7, borderRadius: '50%', background: status === 'connected' ? '#BBFF00' : '#3F3F46', boxShadow: '0 0 8px currentColor' }} />
           <span>{status === 'connected' ? 'Call in progress' : status === 'ringing' ? 'Ringing…' : 'Calling…'}</span>
         </div>
       )}
       {!minimized && (
       <>
      {callType === 'video' && (
        <div style={{ flex: 1, position: 'relative', margin: '20px 0', minHeight: 260 }}>
           {Object.entries(remoteStreams).map(([peerId, stream]) => <RemoteVideo key={peerId} stream={stream} speakerOn={speakerOn} />)}
          <video ref={localVideo} autoPlay muted playsInline style={{ position: 'absolute', right: 10, top: 10, width: 110, height: 150, objectFit: 'cover', borderRadius: 16, background: '#111' }} />
        </div>
      )}
      {callType === 'voice' && Object.entries(remoteStreams).map(([peerId, stream]) => (
        <RemoteAudio key={peerId} stream={stream} speakerOn={speakerOn} />
      ))}
      {callType === 'voice' && (
         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
           <div style={{ padding: 6, borderRadius: '50%', background: status === 'connected' ? 'rgba(34,197,94,.25)' : 'rgba(255,255,255,.08)' }}>
             <Avatar src={avatar} name={name} size={128} />
           </div>
           <h2 style={{ margin: 0, fontSize: 28, letterSpacing: '-.02em' }}>{name}</h2>
           <span style={{ color: 'rgba(255,255,255,.68)', fontSize: 18, fontWeight: 600 }}>{status === 'connected' ? time : status === 'ringing' ? 'Incoming audio call' : 'Calling…'}</span>
        </div>
      )}
      {error && <p style={{ textAlign: 'center', color: '#FCA5A5', fontSize: 13 }}>{error}</p>}
      {incoming && !accepted && status === 'ringing' && (
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: 36, marginBottom: 18, padding: '0 26px' }}>
           <CallButton icon={<PhoneOff size={28} />} label="Decline" color="#EF4444" onClick={endCall} />
           <CallButton icon={<Phone size={28} />} label="Accept" color="#2563EB" onClick={acceptIncomingCall} />
        </div>
      )}
       {(!incoming || accepted) && (
         <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
           <CallButton icon={muted ? <MicOff size={22} /> : <Mic size={22} />} label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} />
           {callType === 'video' && <CallButton icon={cameraOff ? <VideoOff size={22} /> : <Video size={22} />} label={cameraOff ? 'Camera on' : 'Camera off'} onClick={toggleCamera} />}
           <CallButton icon={speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />} label={speakerOn ? 'Speaker' : 'Earpiece'} onClick={toggleSpeaker} />
           <CallButton icon={<PhoneOff size={22} />} label="End" color="#EF4444" onClick={endCall} />
         </div>
       )}
       </>
       )}
     </div>
  )
  return createPortal(callView, document.body)
}

function RemoteVideo({ stream, speakerOn }: { stream: MediaStream; speakerOn: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
    void ref.current.play().catch(() => {})
  }, [stream])
  useEffect(() => {
    const media = ref.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (media?.setSinkId) void media.setSinkId(speakerOn ? 'default' : 'communications').catch(() => {})
  }, [speakerOn])
  return <video ref={ref} data-call-remote-video autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 18, background: '#111' }} />
}

function RemoteAudio({ stream, speakerOn }: { stream: MediaStream; speakerOn: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream
      void ref.current.play().catch(() => {})
    }
  }, [stream])
  useEffect(() => {
    const audio = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (audio?.setSinkId) void audio.setSinkId(speakerOn ? 'default' : 'communications').catch(() => {})
  }, [speakerOn])
  return <audio ref={ref} data-call-remote-audio autoPlay playsInline style={{ display: 'none' }} />
}

function CallButton({ icon, label, onClick, color = 'rgba(255,255,255,.72)' }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string }) {
  return <button onClick={onClick} style={{ background: 'none', border: 'none', color, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
    <span style={{ width: 56, height: 56, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: color === '#EF4444' ? 'rgba(239,68,68,.2)' : 'rgba(255,255,255,.1)' }}>{icon}</span>
    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{label}</span>
  </button>
}