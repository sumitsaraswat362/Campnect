import { useState } from 'react'
import { useAuthStore } from '../../../stores/authStore'
import { GlassCard } from '../../../components/ui/GlassCard'
import { Button } from '../../../components/ui/Button'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../../../components/shared/ConfirmDialog'

export function FeedPlaceholder() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Welcome banner */}
      <GlassCard glow padding="20px">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '9999px',
            background: 'linear-gradient(135deg, #18181B, #C44DCC)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)', flexShrink: 0,
          }}>
            {user?.full_name?.[0] || user?.username?.[0] || '?'}
          </div>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Welcome back, {user?.full_name?.split(' ')[0]}!
            </p>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              @{user?.username?.toLowerCase()} · {user?.college_name || 'College student'}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Auth status */}
      <GlassCard padding="16px">
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '10px' }}>Account status</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <StatusRow label="Email verified" ok={Boolean(user?.is_email_verified)} />
          <StatusRow label="College verified" ok={Boolean(user?.is_college_verified)}
            extra={!user?.is_college_verified ? user?.verification_status === 'pending' ? 'Under review' : undefined : undefined}
          />
          <StatusRow label="Admin" ok={Boolean(user?.is_admin)} />
        </div>
      </GlassCard>

      {/* Upcoming screens notice */}
      <GlassCard padding="16px">
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
          Full feed loading…
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Follow people and join communities to see their posts here.
        </p>
      </GlassCard>

      <Button variant="ghost" onClick={() => setShowLogoutConfirm(true)}>
        Sign out
      </Button>
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sign out of Campnect?"
        message="You’ll need to sign in again to access your account."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          logout()
          navigate('/login', { replace: true })
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  )
}

function StatusRow({ label, ok, extra }: { label: string; ok: boolean; extra?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '12px', color: ok ? '#22C55E' : '#F59E0B', fontWeight: 600 }}>
        {extra || (ok ? 'Yes' : 'No')}
      </span>
    </div>
  )
}
