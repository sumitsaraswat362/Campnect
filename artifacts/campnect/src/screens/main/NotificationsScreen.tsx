import { DEMO_MODE } from '../../demo/config'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Heart, UserPlus, MessageCircle, AtSign, Users, CheckCheck, Inbox, Check, X } from 'lucide-react'
import { useNotificationStore, Notification } from '../../stores/notificationStore'
import { Avatar } from '../../components/shared/Avatar'
import { TimeAgo } from '../../components/shared/TimeAgo'
import { NotificationRowsSkeleton } from '../../components/shared/AppSkeletons'
import { colors, radii, motion } from '../../styles/tokens'
import { usersApi, type FollowRequest } from '../../api/users'

type TabType = 'all' | 'mentions' | 'follows' | 'likes' | 'groups'

const TABS: { id: TabType; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'follows',  label: 'Follows' },
  { id: 'likes',    label: 'Likes' },
  { id: 'groups',   label: 'Groups' },
]

const TAB_TYPE_MAP: Record<TabType, string | undefined> = {
  all:      undefined,
  mentions: 'mention',
  follows:  'follow',
  likes:    'like',
  groups:   'community',
}

function notifIcon(type: string) {
  const s = 18
  if (type === 'like')       return <Heart size={s} color="#EF4444" fill="#EF4444" />
  if (type === 'follow' || type === 'follow_request') return <UserPlus size={s} color="rgba(210,210,215,0.90)" />
  if (type === 'comment')    return <MessageCircle size={s} color="#52525B" />
  if (type === 'mention')    return <AtSign size={s} color="#F59E0B" />
  if (type === 'community')  return <Users size={s} color="#22C55E" />
  if (type === 'message_reaction' || type.startsWith('message_request')) return <Inbox size={s} color="#38BDF8" />
  return <Bell size={s} color={colors.textMuted} />
}

function notifIconBg(type: string) {
  if (type === 'like')       return 'rgba(239,68,68,0.15)'
  if (type === 'follow' || type === 'follow_request') return 'rgba(24,24,27,0.15)'
  if (type === 'comment')    return 'rgba(63,63,70,0.15)'
  if (type === 'mention')    return 'rgba(245,158,11,0.15)'
  if (type === 'community')  return 'rgba(34,197,94,0.15)'
  if (type === 'message_reaction' || type.startsWith('message_request')) return 'rgba(56,189,248,0.15)'
  return 'var(--color-surface)'
}

function notifText(n: Notification): string {
  const actor = n.actor_name || 'Someone'
  const contentLabel = n.entity_type === 'glimpse' ? 'Glimpse' : n.entity_type === 'clip' ? 'Clip' : 'post'
  switch (n.type) {
    case 'like':      return `${actor} liked your ${contentLabel}`
    case 'follow':    return `${actor} started following you`
    case 'follow_request': return `${actor} requested to follow you`
    case 'comment':   return `${actor} commented on your ${contentLabel}`
    case 'mention':   return `${actor} mentioned you in a ${contentLabel}`
    case 'community': return `${actor} invited you to a community`
    case 'system':    return n.content || 'System notification'
    case 'message_reaction': return `${actor} liked your message`
    case 'message_request': return `${actor} sent you a message request`
    case 'message_request_accepted': return `${actor} accepted your message request`
    case 'message_request_declined': return `${actor} declined your message request`
    default:          return n.content || `${actor} interacted with you`
  }
}

export function NotificationsScreen() {
  const navigate = useNavigate()
  const { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead } = useNotificationStore()
  const [tab, setTab] = useState<TabType>('all')
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([])
  const [requestBusy, setRequestBusy] = useState<string | null>(null)

  useEffect(() => {
    fetchNotifications(TAB_TYPE_MAP[tab])
  }, [tab, fetchNotifications])

  useEffect(() => {
    usersApi.getFollowRequests()
      .then(response => setFollowRequests(response.data.data || []))
      .catch(() => setFollowRequests([]))
  }, [])

  async function resolveFollowRequest(request: FollowRequest, action: 'accept' | 'delete') {
    if (requestBusy) return
    setRequestBusy(request.id)
    try {
      if (action === 'accept') await usersApi.acceptFollowRequest(request.id)
      else await usersApi.deleteFollowRequest(request.id)
      setFollowRequests(current => current.filter(item => item.id !== request.id))
      if (action === 'accept') await fetchNotifications('follow')
    } finally {
      setRequestBusy(null)
    }
  }

  const handleNotifPress = (n: Notification) => {
    if (!n.is_read) markRead(n.id)
    if (n.type === 'follow' && n.actor_username) {
      navigate(`/app/profile/${n.actor_username}`)
    } else if ((n.type === 'like' || n.type === 'comment' || n.type === 'mention') && n.entity_id) {
      if (n.entity_type === 'glimpse') navigate(`/app/glimpse/${n.entity_id}`)
      else if (n.entity_type === 'clip') navigate(`/app/clips/${n.entity_id}`)
      else navigate(`/app/post/${n.entity_id}`)
    } else if (n.entity_type === 'event' && n.entity_id) { navigate(`/app/events/${n.entity_id}`)
    } else if (n.entity_type === 'community' && n.entity_id && DEMO_MODE) { navigate(`/app/community/${n.entity_id}`)
    } else if (n.type === 'follow_accepted' && n.actor_username) { navigate(`/app/profile/${n.actor_username}`)
    } else if (n.type.startsWith('message_request')) {
      navigate('/app/chat')
    }
  }

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: colors.textPrimary }}>
            Notifications
            {unreadCount > 0 && (
              <span style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 600, background: "rgba(24,24,27,0.85)", color: "#fff", padding: '2px 8px', borderRadius: radii.pill }}>
                {unreadCount}
              </span>
            )}
          </h2>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.blueLight, fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <CheckCheck size={15} /> Mark all read
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '7px 14px', borderRadius: radii.pill, border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: tab === t.id ? 600 : 400, whiteSpace: 'nowrap',
                background: tab === t.id ? 'rgba(24,24,27,0.85)' : 'var(--color-surface)',
                color: tab === t.id ? '#fff' : 'var(--color-text-secondary)',
                transition: `all ${motion.fast} ${motion.easeSmooth}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: '8px' }}>
        {(tab === 'all' || tab === 'follows') && followRequests.length > 0 && (
          <FollowRequestsSection
            requests={followRequests}
            busyId={requestBusy}
            onResolve={resolveFollowRequest}
          />
        )}
        {loading && <NotificationRowsSkeleton count={7} />}

        {!loading && notifications.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <Bell size={44} color={colors.textMuted} style={{ marginBottom: '12px' }} />
            <p style={{ color: colors.textMuted, fontSize: '15px', margin: 0 }}>No notifications yet</p>
          </div>
        )}

        {!loading && notifications.map((n) => (
          <NotifItem key={n.id} notif={n} onPress={() => handleNotifPress(n)} />
        ))}
      </div>
    </div>
  )
}

function FollowRequestsSection({
  requests,
  busyId,
  onResolve,
}: {
  requests: FollowRequest[]
  busyId: string | null
  onResolve: (request: FollowRequest, action: 'accept' | 'delete') => void
}) {
  return (
    <section aria-label="Follow requests" style={{ padding: '8px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0, color: colors.textPrimary, fontSize: 16, fontWeight: 800 }}>Follow requests</h3>
        <span style={{ color: colors.textMuted, fontSize: 12 }}>{requests.length}</span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {requests.map(request => {
          const busy = busyId === request.id
          return (
            <div key={request.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              border: `1px solid ${colors.border}`,
              borderRadius: radii.md,
              background: colors.surface,
            }}>
              <Avatar src={request.avatar_url} name={request.full_name} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 1.35 }}>
                  <strong>{request.username}</strong> requested to follow you
                </div>
                <TimeAgo date={request.created_at} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  aria-label={`Confirm ${request.username}`}
                  disabled={Boolean(busyId)}
                  onClick={() => onResolve(request, 'accept')}
                  style={{
                    display: 'grid', placeItems: 'center', width: 34, height: 34,
                    border: 0, borderRadius: radii.sm, background: colors.lime, color: colors.onLime,
                    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.55 : 1,
                  }}
                >
                  <Check size={17} />
                </button>
                <button
                  aria-label={`Delete ${request.username}'s follow request`}
                  disabled={Boolean(busyId)}
                  onClick={() => onResolve(request, 'delete')}
                  style={{
                    display: 'grid', placeItems: 'center', width: 34, height: 34,
                    border: `1px solid ${colors.border}`, borderRadius: radii.sm, background: 'transparent',
                    color: colors.textSecondary, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.55 : 1,
                  }}
                >
                  <X size={17} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function NotifItem({ notif, onPress }: { notif: Notification; onPress: () => void }) {
  const isUnread = !notif.is_read
  return (
    <div
      onClick={onPress}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', cursor: 'pointer',
        background: isUnread ? 'rgba(24,24,27,0.08)' : 'transparent',
        borderLeft: isUnread ? '3px solid rgba(24,24,27,0.80)' : '3px solid transparent',
        borderBottom: `1px solid ${colors.border}`,
        transition: `background ${motion.fast}`,
      }}
    >
      {/* Actor avatar or icon */}
      {notif.actor_avatar || notif.actor_name ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar src={notif.actor_avatar} name={notif.actor_name} size={44} />
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 20, height: 20, borderRadius: '50%',
            background: notifIconBg(notif.type),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${'var(--color-bg)'}`,
          }}>
            {notifIcon(notif.type)}
          </div>
        </div>
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: notifIconBg(notif.type),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {notifIcon(notif.type)}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 2px', fontSize: '14px', color: isUnread ? colors.textPrimary : 'var(--color-text-secondary)', lineHeight: 1.4, fontWeight: isUnread ? 500 : 400 }}>
          {notifText(notif)}
        </p>
        <TimeAgo date={notif.created_at} />
      </div>

      {isUnread && (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(24,24,27,0.85)', flexShrink: 0 }} />
      )}
    </div>
  )
}
