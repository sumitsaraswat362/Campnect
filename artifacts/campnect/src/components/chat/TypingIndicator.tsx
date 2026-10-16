import { Avatar } from '../shared/Avatar'

interface TypingIndicatorProps {
  names: string[]
  avatarUrl?: string
}

export function TypingIndicator({ names, avatarUrl }: TypingIndicatorProps) {
  if (names.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', padding: '4px 12px 8px' }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: avatarUrl ? 'transparent' : 'rgba(255,255,255,0.12)',
        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {avatarUrl
          ? <Avatar src={avatarUrl} name={names[0]} size={28} />
          : <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>
              {names[0]?.[0]?.toUpperCase() || '?'}
            </span>
        }
      </div>
      {/* Bubble with animated dots */}
      <div style={{
        padding: '10px 16px',
        borderRadius: '18px 18px 18px 4px',
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.16)',
        display: 'flex', gap: '4px', alignItems: 'center',
      }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'rgba(255,255,255,0.10)',
            display: 'block',
            animation: `igTyping 1.4s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes igTyping {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
