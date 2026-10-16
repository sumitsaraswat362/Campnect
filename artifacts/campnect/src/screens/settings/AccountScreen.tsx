import React, { useState } from 'react'
import toast from 'react-hot-toast'
import client from '../../api/client'
import { useAuthStore } from '../../stores/authStore'
import { useNavigate } from 'react-router-dom'
import { colors, radii, typography } from '../../styles/tokens'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

export function AccountScreen() {
  const navigate = useNavigate()
  const { user, logout, refreshUser } = useAuthStore()

  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [emailChangeSent, setEmailChangeSent] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  useBackDismiss(showDelete, () => { setShowDelete(false); setDeleteConfirm('') }, 200)

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--color-surface)', border: `1px solid ${colors.border}`,
    borderRadius: radii.md, padding: '12px 14px', color: colors.textPrimary,
    fontSize: '15px', fontFamily: typography.fontFamily, outline: 'none', boxSizing: 'border-box',
  }

  const requestEmailChange = async () => {
    if (!newEmail.trim()) { toast.error('Enter your new institution email'); return }
    setEmailLoading(true)
    try {
      await client.post('/users/me/change-email/request', { email: newEmail.trim() })
      setEmailChangeSent(true)
      toast.success('Confirmation code sent to your new email')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not send confirmation code')
    } finally { setEmailLoading(false) }
  }

  const verifyEmailChange = async () => {
    if (!/^\d{6}$/.test(emailOtp)) { toast.error('Enter the 6-digit confirmation code'); return }
    setEmailLoading(true)
    try {
      await client.post('/users/me/change-email/verify', { email: newEmail.trim(), otp: emailOtp })
      await refreshUser()
      setNewEmail('')
      setEmailOtp('')
      setEmailChangeSent(false)
      toast.success('Institution email updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not update email')
    } finally { setEmailLoading(false) }
  }

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { toast.error('Type DELETE to confirm'); return }
    try {
      await client.delete('/users/me')
      logout()
      navigate('/login', { replace: true })
      toast.success('Account scheduled for deletion in 30 days')
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to delete account')
    }
  }

  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: '32px' }}>
      {/* Current account info */}
      <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border}` }}>
        <p style={{ margin: 0, fontSize: '13px', color: colors.textMuted }}>Signed in as</p>
        <p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 600, color: colors.textPrimary }}>{user?.email}</p>
      </div>

      {(user?.user_role === 'teacher' || user?.user_role === 'faculty') && (
        <Section title="Institution Email">
          <p style={{ margin: '0 0 12px', color: colors.textSecondary, fontSize: '13px', lineHeight: 1.5 }}>
            Update this when you join another institution. We’ll verify the new institutional address before switching it.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="email"
              placeholder="new.name@institution.edu"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={emailChangeSent || emailLoading}
              style={inputStyle}
            />
            {!emailChangeSent ? (
              <button onClick={requestEmailChange} disabled={emailLoading} style={{ padding: '11px 16px', borderRadius: radii.pill, border: 'none', background: 'var(--color-lime)', color: '#0D0B12', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: emailLoading ? 0.7 : 1 }}>
                {emailLoading ? 'Sending code…' : 'Send confirmation code'}
              </button>
            ) : (
              <>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ ...inputStyle, letterSpacing: '0.25em' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={verifyEmailChange} disabled={emailLoading} style={{ flex: 1, padding: '11px 16px', borderRadius: radii.pill, border: 'none', background: 'var(--color-lime)', color: '#0D0B12', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: emailLoading ? 0.7 : 1 }}>
                    {emailLoading ? 'Updating…' : 'Confirm new email'}
                  </button>
                  <button onClick={() => { setEmailChangeSent(false); setEmailOtp('') }} disabled={emailLoading} style={{ padding: '11px 16px', borderRadius: radii.pill, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textSecondary, fontSize: '13px', cursor: 'pointer' }}>
                    Change
                  </button>
                </div>
              </>
            )}
          </div>
        </Section>
      )}

      {/* Danger zone */}
      <Section title="Danger Zone">
        <ActionRow
          label="Delete account"
          sublabel="Permanently delete your account and all data (30-day grace period)"
          onClick={() => setShowDelete(true)}
          danger
        />
      </Section>

      {/* Delete confirmation modal */}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: 'var(--color-surface)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: radii.xl, padding: '24px', maxWidth: '360px', width: '100%' }}>
            <h3 style={{ margin: '0 0 8px', color: '#EF4444', fontSize: '18px', fontWeight: 700 }}>Delete Account</h3>
            <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '14px', lineHeight: 1.5 }}>
              This will permanently delete your account, posts, and data after a 30-day grace period. Type <strong style={{ color: '#EF4444' }}>DELETE</strong> to confirm.
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE here"
              style={{ ...inputStyle, marginBottom: '14px', borderColor: 'rgba(239,68,68,0.3)' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setShowDelete(false); setDeleteConfirm('') }} style={{ flex: 1, padding: '12px', borderRadius: radii.pill, border: `1px solid ${colors.border}`, background: 'transparent', color: 'var(--color-text-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={deleteAccount} style={{ flex: 1, padding: '12px', borderRadius: radii.pill, border: 'none', background: '#DC2626', color: 'var(--color-text-primary)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Delete Account</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '24px' }}>
      <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</p>
      <div style={{ background: 'var(--color-surface)', border: `1px solid ${colors.border}`, marginLeft: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  )
}

function ActionRow({ label, sublabel, onClick, danger, icon }: { label: string; sublabel?: string; onClick: () => void; danger?: boolean; icon?: React.ReactNode }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'flex-start', gap: icon ? '10px' : 0 }}>
      {icon && <div style={{ marginTop: '2px', flexShrink: 0 }}>{icon}</div>}
      <div>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: danger ? '#EF4444' : colors.textPrimary }}>{label}</p>
        {sublabel && <p style={{ margin: '2px 0 0', fontSize: '12px', color: colors.textMuted }}>{sublabel}</p>}
      </div>
    </div>
  )
}
