import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import type { AppUpdateNotice as AppUpdateNoticeData } from '../../api/appUpdate'
import { AppUpdate } from '../../capacitor/plugins'

export function AppUpdateNotice({ notice, onLater }: { notice: AppUpdateNoticeData; onLater: () => void }) {
  const mandatory = notice.mode === 'force'

  const openStore = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await AppUpdate.openStore({ url: notice.storeUrl })
        return
      } catch (error) {
        console.warn('Campnect could not open the Play Store app.', error)
      }
    }

    try {
      window.open(notice.storeUrl, '_blank', 'noopener,noreferrer')
    } catch {
      window.location.assign(notice.storeUrl)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-notice-title"
      onClick={mandatory ? undefined : onLater}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(0,0,0,.52)', backdropFilter: 'blur(3px)' }}
    >
      <section onClick={(event) => event.stopPropagation()} style={{ width: 'min(100%, 320px)', padding: '22px 20px 18px', borderRadius: 16, background: '#FFFFFF', border: '1px solid #E5E5E5', boxShadow: '0 18px 48px rgba(0,0,0,.24)', textAlign: 'center' }}>
        <h2 id="app-update-notice-title" style={{ margin: 0, color: '#111111', fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 750, letterSpacing: '-.02em', lineHeight: 1.25 }}>{notice.title}</h2>
        <p style={{ margin: '8px 0 0', color: '#5F5F5F', fontSize: 13, lineHeight: 1.45 }}>{notice.message}</p>
        <button type="button" onClick={() => void openStore()} style={{ width: '100%', minHeight: 42, marginTop: 20, border: '1px solid #111111', borderRadius: 10, background: '#111111', color: '#FFFFFF', fontSize: 13, fontWeight: 750, cursor: 'pointer' }}>
          Update now
        </button>
        {!mandatory && <button type="button" onClick={onLater} style={{ width: '100%', minHeight: 36, marginTop: 5, border: 0, borderRadius: 8, background: 'transparent', color: '#333333', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>Not now</button>}
      </section>
    </div>,
    document.body,
  )
}