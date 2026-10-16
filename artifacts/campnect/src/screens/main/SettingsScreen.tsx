import { DEMO_MODE } from '../../demo/config'
import { DemoControls } from '../../demo/components'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { User, Lock, Globe, Bell, Shield, Info, ChevronRight, LogOut, Moon, Sun, Bookmark, Clock3, LifeBuoy, Scale, MessageSquareWarning } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/shared/Avatar'
import { colors, radii, motion } from '../../styles/tokens'
import { useThemeStore, ThemeMode } from '../../stores/themeStore'
import client from '../../api/client'
import { navigateToAppRoot } from '../../navigation/appSectionNavigation'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { useAppVersionLabel } from '../../hooks/useAppVersionLabel'

interface SettingsGroup {
  title: string
  items: SettingsItem[]
}

interface SettingsItem {
  icon: React.ReactNode
  label: string
  sublabel?: string
  path?: string
  action?: () => void
  danger?: boolean
  badge?: string
}

export function SettingsScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const versionLabel = useAppVersionLabel()
  const { user, logout, setUser } = useAuthStore()
  const { mode, setMode } = useThemeStore()
  const [isPrivate, setIsPrivate] = useState(Boolean(user?.is_private))
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const confirmLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    setIsPrivate(Boolean(user?.is_private))
  }, [user?.is_private])

  const updateProfileVisibility = async (value: boolean) => {
    const previous = isPrivate
    setIsPrivate(value)
    setSavingPrivacy(true)
    try {
      const response = await client.patch('/users/me', { is_private: value ? 1 : 0 })
      setUser(response.data.data)
    } catch {
      setIsPrivate(previous)
    } finally {
      setSavingPrivacy(false)
    }
  }

  const groups: SettingsGroup[] = [
    {
      title: 'Account',
      items: [
        { icon: <User size={18} />, label: 'Account Settings', sublabel: 'Email, password, deactivate', path: '/app/settings/account' },
        { icon: <Lock size={18} />, label: 'Privacy', sublabel: 'Messaging controls, blocked users', path: '/app/settings/privacy' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: <Bookmark size={18} />, label: 'Saved', sublabel: 'Posts you saved', path: '/app/settings/saved' },
        { icon: <Clock3 size={18} />, label: 'Your activity', sublabel: 'Likes, comments and watched content', path: '/app/settings/activity' },
        { icon: <MessageSquareWarning size={18} />, label: 'Content appeals', sublabel: 'Review or appeal moderated content', path: '/app/settings/content-appeals' },
        { icon: <Bell size={18} />, label: 'Notifications', sublabel: 'What alerts you receive', path: '/app/settings/notifications' },
        { icon: <Shield size={18} />, label: 'Security', sublabel: '2FA, sessions, login activity', path: '/app/settings/security' },
      ],
    },
    {
      title: 'About',
      items: [
        { icon: <LifeBuoy size={18} />, label: 'Help & Support', sublabel: 'Answers, safety, and support', path: '/app/settings/help' },
        { icon: <Scale size={18} />, label: 'Legal', sublabel: 'Policies and community guidelines', path: '/app/settings/legal' },
        { icon: <Info size={18} />, label: 'About Campnect', sublabel: versionLabel, path: '/app/settings/about' },
      ],
    },
  ]

  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: '32px' }}>
      {DEMO_MODE && <DemoControls />}
      {/* Profile summary */}
      <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: `1px solid ${colors.border}` }}>
        <Avatar src={user?.avatar_url} name={user?.full_name} size={56} onClick={() => navigateToAppRoot(navigate, location.pathname, '/app/profile')} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '17px', color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name}</p>
          <p style={{ margin: 0, fontSize: '13px', color: colors.textMuted }}>@{user?.username?.toLowerCase()}</p>
          {user?.college_name && <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted }}>{user.college_name}</p>}
        </div>
        <button
          onClick={() => navigate('/app/edit-profile')}
          style={{ padding: '8px 16px', borderRadius: radii.pill, border: `1px solid ${colors.border}`, background: 'transparent', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          Edit
        </button>
      </div>

      {/* Profile visibility — intentionally kept outside the settings groups */}
      <div style={{ marginTop: '24px' }}>
        <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Profile visibility</p>
        <div style={{ background: 'var(--color-surface)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: radii.md, background: 'var(--color-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.blueLight, flexShrink: 0 }}>
                {isPrivate ? <Lock size={18} /> : <Globe size={18} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: colors.textPrimary }}>{isPrivate ? 'Private profile' : 'Public profile'}</p>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: colors.textMuted }}>
                  {isPrivate ? 'Only approved followers can see your posts' : 'Anyone can see your posts and profile'}
                </p>
              </div>
            </div>
            <Toggle value={isPrivate} disabled={savingPrivacy} onChange={updateProfileVisibility} />
          </div>
        </div>
      </div>

      {/* Appearance — theme toggle */}
      <div style={{ marginTop: '24px' }}>
        <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Appearance</p>
        <div style={{ background: 'var(--color-surface)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: 36, height: 36, borderRadius: radii.md, background: 'var(--color-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {mode === 'dark' ? <Moon size={18} color={colors.lime} /> : <Sun size={18} color={colors.lime} />}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: 'var(--color-text-primary)' }}>Theme</p>
                <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted }}>
                  {mode === 'dark' ? 'Always dark' : 'Always lite'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--color-surface-hover)', borderRadius: '10px', padding: '4px', flexShrink: 0 }}>
              {(['light', 'dark'] as ThemeMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '6px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                    background: mode === m ? 'var(--color-lime)' : 'transparent',
                    color: mode === m ? 'var(--color-bg)' : colors.textMuted,
                    fontSize: '12px', fontWeight: 600,
                    transition: `all ${motion.fast}`,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {m === 'light' ? 'Lite' : 'Dark'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Settings groups */}
      {groups.map((group) => (
        <div key={group.title} style={{ marginTop: '24px' }}>
          <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{group.title}</p>
          <div style={{ background: 'var(--color-surface)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
            {group.items.map((item, i) => (
              <SettingsRow
                key={item.label}
                item={item}
                isLast={i === group.items.length - 1}
                onClick={() => {
                  if (item.action) item.action()
                  else if (item.path) navigate(item.path)
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Logout */}
      <div style={{ margin: '24px 16px 0' }}>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          style={{
            width: '100%', padding: '14px', borderRadius: radii.xl,
            border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)',
            color: '#EF4444', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <LogOut size={18} /> Sign out
        </button>
      </div>
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sign out of Campnect?"
        message="You’ll need to sign in again to access your account."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  )
}

function SettingsRow({ item, isLast, onClick }: { item: SettingsItem; isLast: boolean; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '14px 16px',
        borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
        cursor: 'pointer',
        transition: `background ${motion.fast}`,
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: radii.md, background: 'var(--color-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.danger ? '#EF4444' : colors.blueLight, flexShrink: 0 }}>
        {item.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: item.danger ? '#EF4444' : colors.textPrimary }}>{item.label}</p>
        {item.sublabel && <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted }}>{item.sublabel}</p>}
      </div>
      {item.badge && (
        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: radii.pill, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 700 }}>{item.badge}</span>
      )}
      <ChevronRight size={16} color={colors.textMuted} />
    </div>
  )
}

function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      role="switch"
      aria-checked={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => { if (!disabled) onChange(!value) }}
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onChange(!value)
        }
      }}
      style={{
        width: 44, height: 24, borderRadius: radii.pill, cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative',
        background: value ? '#18181B' : 'var(--color-border-strong)', transition: 'background 200ms',
        border: value ? 'none' : '1px solid var(--color-border)', boxSizing: 'border-box',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20,
        borderRadius: '50%', background: '#fff', transition: 'left 200ms',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
      }} />
    </div>
  )
}
