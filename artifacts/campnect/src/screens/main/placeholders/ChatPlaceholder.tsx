import { MessageCircle } from 'lucide-react'

export function ChatPlaceholder() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', gap: '14px', textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'rgba(24,24,27,0.14)',
        border: '1.5px solid rgba(24,24,27,0.35)',
        boxShadow: '0 0 24px rgba(24,24,27,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'iconPop 400ms var(--ease-spring)',
      }}>
        <MessageCircle size={30} color="var(--color-lime)" strokeWidth={1.6} />
      </div>
      <p style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', margin: 0 }}>Messages</p>
      <p style={{ fontSize: '14px', fontFamily: 'var(--font-body)', color: 'var(--color-text-muted)', margin: 0, maxWidth: '240px', lineHeight: 1.55 }}>
        Real-time DMs and group chats — coming soon.
      </p>
    </div>
  )
}
