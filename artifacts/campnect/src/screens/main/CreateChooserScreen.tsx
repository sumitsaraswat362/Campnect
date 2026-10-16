import { Image, X, Sparkles, Clapperboard } from 'lucide-react'
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { requestAppBack } from '../../navigation/appBackRequest'

const options = [
  { id: 'post', label: 'Post', description: 'Share photos, videos, or a carousel', icon: Image, path: '/app/create/post', color: '#C44DCC' },
  { id: 'glimpse', label: 'Glimpse', description: 'Capture one fresh moment from campus', icon: Sparkles, path: '/app/glimpse/create', color: '#BBFF00' },
  { id: 'clip', label: 'Clip', description: 'Share a short video with your campus', icon: Clapperboard, path: '/app/clips/create', color: '#C44DCC' },
]

export function CreateChooserScreen() {
  const navigate = useNavigate()
  const glimpseCaptureRef = useRef<HTMLInputElement>(null)
  const openGlimpseCamera = () => {
    // Use Campnect's CameraX screen on Android so photo capture is always
    // available; the generic combined media picker can open video-only.
    if (Capacitor.isNativePlatform()) {
      navigate('/app/glimpse/create')
      return
    }
    glimpseCaptureRef.current?.click()
  }
  const receiveGlimpseCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const capture = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (capture) navigate('/app/glimpse/create', { state: { capture } })
  }
  return (
    <div style={{
      minHeight: '100%', padding: 'calc(20px + env(safe-area-inset-top, 0px)) 18px 120px',
      background: 'radial-gradient(circle at 50% 0%, rgba(24,24,27,.10), transparent 42%), var(--color-bg)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={requestAppBack} aria-label="Close" style={roundButton}><X size={20} /></button>
      </div>
      <div style={{ margin: '30px 4px 24px' }}>
        <p style={{ margin: '0 0 8px', color: 'var(--color-lime)', fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Create</p>
        <h1 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 30, fontFamily: 'var(--font-display)' }}>What do you want to share?</h1>
        <p style={{ margin: '10px 0 0', color: 'var(--color-text-secondary)', fontSize: 14 }}>Choose a format first, then add your media.</p>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        {options.map(({ id, label, description, icon: Icon, path, color }) => (
          <button key={id} onClick={id === 'glimpse' ? openGlimpseCamera : () => navigate(path)} style={{
            display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '18px 16px',
            textAlign: 'left', borderRadius: 22, border: '1px solid var(--color-border)',
            background: 'var(--color-surface)', color: 'var(--color-text-primary)', cursor: 'pointer',
            boxShadow: '0 3px 12px rgba(0,0,0,.05)', WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ width: 54, height: 54, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}22`, color, flexShrink: 0 }}>
              <Icon size={25} />
            </span>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-text-primary)' }}>{label}</strong>
              <span style={{ display: 'block', marginTop: 4, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)', fontSize: 13 }}>{description}</span>
            </span>
          </button>
        ))}
      </div>
      <input ref={glimpseCaptureRef} type="file" accept="image/*,video/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={receiveGlimpseCapture} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
    </div>
  )
}

const roundButton = {
  width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,0,0,.06)',
}