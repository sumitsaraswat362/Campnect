import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import client from '../../api/client'
import { SettingsRowsSkeleton } from '../../components/shared/AppSkeletons'
import { colors, radii } from '../../styles/tokens'
import { openNativeAppSettings, requestNotificationPermission } from '../../utils/permissions'

interface NotifPrefs {
  likes: boolean
  comments: boolean
  follows: boolean
  mentions: boolean
  group_activity: boolean
  community_activity: boolean
  college_notices: boolean
  marketing: boolean
}

const DEFAULT: NotifPrefs = {
  likes: true, comments: true, follows: true, mentions: true,
  group_activity: true, community_activity: true,
  college_notices: true, marketing: false,
}

function normalizePrefs(raw: unknown): NotifPrefs {
  let parsed: Record<string, unknown> = {}
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>
  } catch {}

  const booleanValue = (canonical: keyof NotifPrefs, legacy?: string) => {
    const value = parsed[canonical] ?? (legacy ? parsed[legacy] : undefined)
    return typeof value === 'boolean' ? value : DEFAULT[canonical]
  }

  return {
    likes: booleanValue('likes'),
    comments: booleanValue('comments'),
    follows: booleanValue('follows'),
    mentions: booleanValue('mentions'),
    group_activity: booleanValue('group_activity', 'groupActivity'),
    community_activity: booleanValue('community_activity', 'communityActivity'),
    college_notices: booleanValue('college_notices', 'collegeNotices'),
    marketing: booleanValue('marketing'),
  }
}

const LABELS: Record<keyof NotifPrefs, { label: string; sublabel: string }> = {
  likes:              { label: 'Likes', sublabel: 'When someone likes your post' },
  comments:           { label: 'Comments', sublabel: 'When someone comments on your post' },
  follows:            { label: 'New Followers', sublabel: 'When someone follows you' },
  mentions:           { label: 'Mentions', sublabel: 'When someone @mentions you' },
  group_activity:     { label: 'Group Activity', sublabel: 'Messages and events in your groups' },
  community_activity: { label: 'Community Activity', sublabel: 'Posts and announcements in your communities' },
  college_notices:    { label: 'College Notices', sublabel: 'Announcements from your college' },
  marketing:          { label: 'Marketing', sublabel: 'News, tips, and offers from Campnect' },
}

export function NotificationPrefsScreen() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [permissionNotice, setPermissionNotice] = useState('')
  const [showSettingsAction, setShowSettingsAction] = useState(false)
  const [savingKey, setSavingKey] = useState<keyof NotifPrefs | null>(null)

  useEffect(() => {
    client.get('/users/me').then((res) => {
      const raw = res.data.data?.notification_prefs
      setPrefs(normalizePrefs(raw))
    }).catch(() => {
      toast.error('Could not load notification settings.')
    }).finally(() => setLoading(false))
  }, [])

  const toggle = async (key: keyof NotifPrefs) => {
    if (savingKey) return
    const next = { ...prefs, [key]: !prefs[key] }
    if (next[key]) {
      const permission = await requestNotificationPermission()
      if (!permission.granted) {
        setPermissionNotice(permission.message || 'Notifications are unavailable. Campnect will continue without device alerts.')
        setShowSettingsAction(permission.state === 'denied')
        return
      }
      setPermissionNotice('')
      setShowSettingsAction(false)
    }
    setPrefs(next)
    setSavingKey(key)
    try {
      const response = await client.patch('/users/me/notification-prefs', next)
      setPrefs(normalizePrefs(response.data?.data))
    } catch {
      setPrefs(prefs)
      toast.error('Could not save notification settings.')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <div style={{ minHeight: '100%', background: colors.bg, padding: '24px 0 32px' }}><SettingsRowsSkeleton count={8} /></div>

  const groups = [
    { title: 'Social', keys: ['likes', 'comments', 'follows', 'mentions'] as (keyof NotifPrefs)[] },
    { title: 'Content', keys: ['group_activity', 'community_activity'] as (keyof NotifPrefs)[] },
    { title: 'Campus', keys: ['college_notices'] as (keyof NotifPrefs)[] },
    { title: 'From Campnect', keys: ['marketing'] as (keyof NotifPrefs)[] },
  ]

  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: '32px' }}>
      {permissionNotice && (
        <div role="status" style={{ margin: '16px', padding: '12px 14px', borderRadius: '14px', border: '1px solid rgba(251,191,36,.28)', background: 'rgba(251,191,36,.10)', color: '#FDE68A', fontSize: '12px', lineHeight: 1.5 }}>
          {permissionNotice}
          {showSettingsAction && (
            <button
              type="button"
              onClick={() => { void openNativeAppSettings() }}
              style={{ display: 'block', marginTop: 10, border: 0, borderRadius: 999, padding: '7px 12px', background: '#FFFFFF', color: '#18181B', fontWeight: 700, cursor: 'pointer' }}
            >
              Open Android Settings
            </button>
          )}
        </div>
      )}
      {groups.map((group) => (
        <div key={group.title} style={{ marginTop: '24px' }}>
          <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{group.title}</p>
          <div style={{ background: 'var(--color-surface)', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
            {group.keys.map((key, i) => (
              <div
                key={key}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: i < group.keys.length - 1 ? `1px solid ${colors.border}` : 'none' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: colors.textPrimary }}>{LABELS[key].label}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted }}>{LABELS[key].sublabel}</p>
                </div>
                <Toggle value={prefs[key]} disabled={savingKey !== null} label={LABELS[key].label} onChange={() => toggle(key)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Toggle({ value, disabled, label, onChange }: { value: boolean; disabled: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: radii.pill, cursor: 'pointer', position: 'relative',
        background: value ? '#18181B' : 'var(--color-border-strong)', transition: 'background 200ms', flexShrink: 0,
        border: value ? 'none' : '1px solid var(--color-border)', boxSizing: 'border-box', padding: 0,
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }} />
    </button>
  )
}
