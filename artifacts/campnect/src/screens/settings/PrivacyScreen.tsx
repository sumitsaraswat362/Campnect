import { useState, useEffect } from 'react'
import { ArrowLeft, UserX } from 'lucide-react'
import client from '../../api/client'
import { Avatar } from '../../components/shared/Avatar'
import { SettingsRowsSkeleton } from '../../components/shared/AppSkeletons'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { colors, radii, motion } from '../../styles/tokens'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'

type Visibility = 'everyone' | 'friends' | 'nobody'
type MessagePerm = 'everyone' | 'followers' | 'none'

interface PrivacySettings {
  messageMe: Visibility
  callMe: Visibility
  profileVisibility: Visibility
  storiesVisibility: Visibility
  showFollowers: boolean
  showFollowing: boolean
  showLastSeen: boolean
  showOnlineStatus: boolean
  readReceipts: boolean
  allowFriendRequests: boolean
}

const DEFAULT: PrivacySettings = {
  messageMe: 'everyone', callMe: 'friends', profileVisibility: 'everyone',
  storiesVisibility: 'everyone', showFollowers: true, showFollowing: true,
  showLastSeen: true, showOnlineStatus: true, readReceipts: true, allowFriendRequests: true,
}

const RADIO_OPTIONS: Visibility[] = ['everyone', 'friends', 'nobody']
const MSG_OPTIONS: { value: MessagePerm; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers only' },
  { value: 'none', label: 'No one' },
]

export function PrivacyScreen() {
  const { user, setUser } = useAuthStore()
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT)
  const [whoCanMessage, setWhoCanMessage] = useState<MessagePerm>((user?.who_can_message as MessagePerm) || 'everyone')
  const [blockedUsers, setBlockedUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<'main' | 'blocked'>('main')
  const [savingAccount, setSavingAccount] = useState(false)
  useBackDismiss(section === 'blocked', () => setSection('main'), 150)

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, blockedRes] = await Promise.all([
          client.get('/users/me'),
          client.get('/users/me/blocked').catch(() => ({ data: { data: [] } })),
        ])
        const me = meRes.data.data
        const raw = me?.privacy_settings
        if (raw) {
          try { setSettings({ ...DEFAULT, ...JSON.parse(raw) }) } catch {}
        }
        setWhoCanMessage((me?.who_can_message as MessagePerm) || 'everyone')
        setBlockedUsers(blockedRes.data.data || [])
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const saveAccountPrivacy = async (patch: { is_private?: number; who_can_message?: MessagePerm }) => {
    setSavingAccount(true)
    try {
      const res = await client.patch('/users/me', patch)
      setUser(res.data.data)
    } catch {} finally { setSavingAccount(false) }
  }

  const save = async (patch: Partial<PrivacySettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    try { await client.patch('/users/me/privacy', next) } catch {}
  }

  const unblock = async (userId: string) => {
    try {
      await client.delete(`/users/block/${userId}`)
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId))
      await useChatStore.getState().fetchConversations()
    } catch {}
  }

  if (loading) return <div style={{ minHeight: '100%', background: colors.bg, padding: '24px 0 32px' }}><SettingsRowsSkeleton count={8} /></div>

  if (section === 'blocked') {
    return (
      <div style={{ minHeight: '100%', background: colors.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
          <button onClick={requestAppBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, display: 'flex' }}><ArrowLeft size={22} /></button>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: colors.textPrimary }}>Blocked Users</h2>
        </div>
        {blockedUsers.length === 0
          ? <div style={{ textAlign: 'center', padding: '60px 24px' }}><UserX size={40} color={colors.textMuted} /><p style={{ color: colors.textMuted, margin: '12px 0 0' }}>No blocked users</p></div>
          : blockedUsers.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: `1px solid ${colors.border}` }}>
                <Avatar src={u.avatar_url} name={u.full_name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: colors.textPrimary, fontSize: '14px' }}>{u.full_name}</p>
                  <p style={{ margin: 0, color: colors.textMuted, fontSize: '12px' }}>@{u.username?.toLowerCase()}</p>
                </div>
                <button
                  onClick={() => unblock(u.id)}
                  style={{ padding: '7px 14px', borderRadius: radii.pill, border: `1px solid ${colors.border}`, background: 'transparent', color: '#EF4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Unblock
                </button>
              </div>
            ))
        }
      </div>
    )
  }

  const sections = [
    {
      title: 'Who can contact me',
      items: [
        { label: 'Message me', key: 'messageMe' as keyof PrivacySettings, type: 'radio' },
        { label: 'Call me', key: 'callMe' as keyof PrivacySettings, type: 'radio' },
      ],
    },
    {
      title: 'Who can see my info',
      items: [
        { label: 'Profile visibility', key: 'profileVisibility' as keyof PrivacySettings, type: 'radio' },
        { label: 'View my Stories', key: 'storiesVisibility' as keyof PrivacySettings, type: 'radio' },
      ],
    },
    {
      title: 'Activity',
      items: [
        { label: 'Show followers list', key: 'showFollowers' as keyof PrivacySettings, type: 'toggle' },
        { label: 'Show following list', key: 'showFollowing' as keyof PrivacySettings, type: 'toggle' },
        { label: 'Show last seen', key: 'showLastSeen' as keyof PrivacySettings, type: 'toggle' },
        { label: 'Show online status', key: 'showOnlineStatus' as keyof PrivacySettings, type: 'toggle', hint: 'Off hides the "Active now" indicator — chats show "last seen" instead' },
        { label: 'Read receipts', key: 'readReceipts' as keyof PrivacySettings, type: 'toggle' },
        { label: 'Allow friend requests', key: 'allowFriendRequests' as keyof PrivacySettings, type: 'toggle' },
      ],
    },
  ]

  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: '32px' }}>

      {/* Messaging controls — profile visibility lives on the main Settings screen */}
      <div style={{ marginTop: '24px' }}>
        <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Messaging</p>
        <div style={{ background: 'var(--color-surface)', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ padding: '14px 16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 500, color: colors.textPrimary }}>Who can message me</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {MSG_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setWhoCanMessage(opt.value)
                    saveAccountPrivacy({ who_can_message: opt.value })
                  }}
                  style={{
                    padding: '7px 16px', borderRadius: radii.pill, fontSize: '13px', cursor: 'pointer', fontWeight: whoCanMessage === opt.value ? 600 : 400, transition: `all ${motion.fast}`,
                    border: `1px solid ${whoCanMessage === opt.value ? '#18181B' : 'var(--color-border)'}`,
                    background: whoCanMessage === opt.value ? '#18181B' : 'transparent',
                    color: whoCanMessage === opt.value ? '#FFFFFF' : 'var(--color-text-secondary)',
                    opacity: savingAccount ? 0.6 : 1,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {sections.map((sec) => (
        <div key={sec.title} style={{ marginTop: '24px' }}>
          <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{sec.title}</p>
          <div style={{ background: 'var(--color-surface)', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
            {sec.items.map((item, i) => (
              <div key={item.key} style={{ padding: '14px 16px', borderBottom: i < sec.items.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                <p style={{ margin: '0 0 8px', fontSize: '15px', color: colors.textPrimary, fontWeight: 500 }}>{item.label}</p>
                {'hint' in item && item.hint && (
                  <p style={{ margin: '-4px 0 8px', fontSize: '12px', color: colors.textMuted }}>{item.hint}</p>
                )}
                {item.type === 'radio' ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {RADIO_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => save({ [item.key]: opt })}
                        style={{
                          padding: '6px 14px', borderRadius: radii.pill, border: `1px solid`,
                          borderColor: (settings[item.key] as string) === opt ? '#18181B' : 'var(--color-border)',
                          background: (settings[item.key] as string) === opt ? '#18181B' : 'transparent',
                          color: (settings[item.key] as string) === opt ? '#FFFFFF' : 'var(--color-text-secondary)',
                          fontSize: '13px', cursor: 'pointer', fontWeight: (settings[item.key] as string) === opt ? 600 : 400,
                          textTransform: 'capitalize',
                          transition: `all ${motion.fast} ${motion.easeSmooth}`,
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Toggle
                    value={settings[item.key] as boolean}
                    onChange={(v) => save({ [item.key]: v })}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Blocked users */}
      <div style={{ marginTop: '24px' }}>
        <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Blocked</p>
        <div style={{ background: 'var(--color-surface)', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
          <div onClick={() => setSection('blocked')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <UserX size={18} color={colors.textMuted} />
              <span style={{ color: colors.textPrimary, fontSize: '15px', fontWeight: 500 }}>Blocked users</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {blockedUsers.length > 0 && <span style={{ fontSize: '13px', color: colors.textMuted }}>{blockedUsers.length}</span>}
              <ArrowLeft size={16} color={colors.textMuted} style={{ transform: 'rotate(180deg)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: radii.pill, cursor: 'pointer', position: 'relative',
        background: value ? '#18181B' : 'var(--color-border-strong)', transition: 'background 200ms',
        border: value ? 'none' : '1px solid var(--color-border)', boxSizing: 'border-box',
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
