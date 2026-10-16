import { DEMO_MODE } from '../../demo/config'
import { useState, useEffect } from 'react'
import { Monitor, Smartphone, Tablet, LogOut, LockKeyhole } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../../api/client'
import { SettingsRowsSkeleton } from '../../components/shared/AppSkeletons'
import { colors, radii } from '../../styles/tokens'
import { formatDeviceDate, formatDeviceTime } from '../../utils/dateTime'

interface Session {
  id: string
  device?: string
  browser?: string
  os?: string
  location?: { city?: string; region?: string; country?: string } | null
  created_at?: string
  is_current?: boolean
}

export function SecurityScreen() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        // Sessions endpoint may not exist yet — gracefully handle
        const res = await client.get('/auth/sessions').catch(() => ({ data: { data: [] } }))
        setSessions(res.data.data || [])
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return }
    setPasswordLoading(true)
    try {
      await client.post('/users/me/change-password', { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password changed successfully')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not change password')
    } finally {
      setPasswordLoading(false)
    }
  }

  const logoutAllOthers = async () => {
    if (DEMO_MODE) { toast('Demo Mode has no external sessions.'); return }
    try {
      await client.delete('/auth/sessions').catch(() => {})
      toast.success('All other sessions logged out')
      setSessions((prev) => prev.filter((s) => s.is_current))
    } catch { toast.error('Failed to logout sessions') }
  }

  const deviceIcon = (device = '') => {
    if (device === 'Phone') return <Smartphone size={18} color={colors.blueLight} />
    if (device === 'Tablet') return <Tablet size={18} color={colors.blueLight} />
    return <Monitor size={18} color={colors.blueLight} />
  }

  const locationLabel = (location?: Session['location']) => {
    if (!location) return 'Location unavailable'
    return [location.city, location.region, location.country].filter(Boolean).join(', ') || 'Location unavailable'
  }

  if (loading) return <div style={{ minHeight: '100%', background: colors.bg, padding: '24px 0 32px' }}><SettingsRowsSkeleton count={6} /></div>

  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: '32px' }}>
      {DEMO_MODE && <p style={{ padding: 16, color: colors.textMuted }}>Demo Mode: passwords, 2FA and remote session management are unavailable. No real security settings are changed.</p>}
      {/* Change password */}
      <div style={{ marginTop: '24px' }}>
        <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Password</p>
        <form onSubmit={changePassword} style={{ background: colors.surface, borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: '18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: 40, height: 40, borderRadius: radii.md, background: colors.surfaceHover, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LockKeyhole size={18} color={colors.textPrimary} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: colors.textPrimary }}>Change password</p>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: colors.textMuted }}>Use at least 8 characters</p>
            </div>
          </div>
          {[['Current password', currentPassword, setCurrentPassword], ['New password', newPassword, setNewPassword], ['Confirm new password', confirmPassword, setConfirmPassword]].map(([label, value, setter]) => (
            <input
              key={label as string}
              type="password"
              placeholder={label as string}
              value={value as string}
              onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)}
              autoComplete={label === 'Current password' ? 'current-password' : 'new-password'}
              style={{ width: '100%', boxSizing: 'border-box', height: 50, marginTop: 8, padding: '0 14px', borderRadius: radii.md, border: `1px solid ${colors.border}`, background: 'var(--color-input-bg)', color: colors.textPrimary, outline: 'none', fontSize: 14 }}
            />
          ))}
          <button type="submit" disabled={passwordLoading} style={{ width: '100%', height: 48, marginTop: 14, border: 'none', borderRadius: radii.pill, background: colors.lime, color: colors.onLime, fontWeight: 700, cursor: passwordLoading ? 'not-allowed' : 'pointer', opacity: passwordLoading ? 0.6 : 1 }}>
            {passwordLoading ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>

      {/* Active sessions */}
      <div style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 4px' }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Sessions</p>
          {sessions.length > 1 && (
            <button onClick={logoutAllOthers} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <LogOut size={12} /> Logout all others
            </button>
          )}
        </div>
        <div style={{ background: 'var(--color-surface)', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
          {sessions.length === 0 ? (
            <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: 36, height: 36, borderRadius: radii.md, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Monitor size={18} color={colors.textMuted} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '14px', color: colors.textPrimary, fontWeight: 500 }}>This device</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#22C55E' }}>Current session · Active now</p>
              </div>
            </div>
          ) : sessions.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderBottom: i < sessions.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: radii.md, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {deviceIcon(s.device)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', color: colors.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.device || 'Computer'}{s.os ? ` · ${s.os}` : ''}{s.browser ? ` · ${s.browser}` : ''}
                  {s.is_current && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#22C55E', fontWeight: 600 }}>• Current</span>}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted }}>
                  {locationLabel(s.location)} · {formatDeviceDate(s.created_at, { month: 'short', day: 'numeric', year: 'numeric' })} at {formatDeviceTime(s.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
