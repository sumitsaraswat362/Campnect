import { DEMO_MODE } from '../../demo/config'
import client from '../../api/client'
import toast from 'react-hot-toast'
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Users, Calendar, Image, Shield, Lock, FileText, CalendarDays, Globe, Settings } from 'lucide-react'
import { useCommunityStore } from '../../stores/communityStore'
import { useEventStore } from '../../stores/eventStore'
import { useFeedStore, Post } from '../../stores/feedStore'
import { communitiesApi } from '../../api/communities'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { PostCard } from '../../components/feed/PostCard'
import { CommentSheet } from '../../components/feed/CommentSheet'
import { DetailPageSkeleton, EventCardsSkeleton, PeopleRowsSkeleton } from '../../components/shared/AppSkeletons'
import { FeedLoadingSkeletons } from '../../components/feed/PostLoadingState'
import { radii, motion } from '../../styles/tokens'
import { parseApiDate } from '../../utils/dateTime'
import { requestAppBack } from '../../navigation/appBackRequest'

type CommunityTab = 'posts' | 'chat' | 'events' | 'members'

const CATEGORY_GRADIENTS: Record<string, string> = {
  Technology: 'linear-gradient(135deg, #1D4ED8, #0891B2)',
  Design: 'linear-gradient(135deg, #27272A, #DB2777)',
  Entrepreneurship: 'linear-gradient(135deg, #D97706, #DC2626)',
  Sports: 'linear-gradient(135deg, #059669, #0D9488)',
  Music: 'linear-gradient(135deg, #27272A, #18181B)',
  Gaming: 'linear-gradient(135deg, #DC2626, #18181B)',
  Photography: 'linear-gradient(135deg, #B45309, #D97706)',
  Academic: 'linear-gradient(135deg, #1D4ED8, #27272A)',
  Arts: 'linear-gradient(135deg, #DB2777, #F59E0B)',
  Wellness: 'linear-gradient(135deg, #059669, #10B981)',
  Social: 'linear-gradient(135deg, #18181B, #C44DCC)',
  Other: 'linear-gradient(135deg, #374151, #6B7280)',
}

export function CommunityScreen() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { currentCommunity, currentMembers, loading, fetchCommunity, fetchMembers, joinCommunity, leaveCommunity } = useCommunityStore()
  const { events, loading: eventsLoading, fetchEvents } = useEventStore()
  const { likePost, unlikePost, savePost, unsavePost } = useFeedStore()
  const [tab, setTab] = useState<CommunityTab>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [membersLoading, setMembersLoading] = useState(false)
  const [commentPostId, setCommentPostId] = useState<string | null>(null)

  useEffect(() => {
    if (slug) fetchCommunity(slug)
  }, [slug, fetchCommunity])

  useEffect(() => {
    if (!currentCommunity) return
    if (tab === 'posts') loadPosts()
    else if (tab === 'members') {
      setMembersLoading(true)
      void fetchMembers(currentCommunity.id).finally(() => setMembersLoading(false))
    }
    else if (tab === 'events') fetchEvents({ community_id: currentCommunity.id })
  }, [tab, currentCommunity?.id])

  const loadPosts = async () => {
    if (!currentCommunity) return
    setPostsLoading(true)
    try {
      const res = await communitiesApi.getPosts(currentCommunity.id)
      setPosts(res.data.data || [])
    } catch {} finally { setPostsLoading(false) }
  }

  if (loading || !currentCommunity) {
    return <div style={{ minHeight: '100%', background: 'var(--color-bg)' }}><DetailPageSkeleton kind="community" /></div>
  }

  const community = currentCommunity
  const gradient = CATEGORY_GRADIENTS[community.category] || CATEGORY_GRADIENTS.Other

  const TABS: { id: CommunityTab; label: string; icon: React.ReactNode }[] = [
    { id: 'posts',   label: 'Posts',   icon: <Image size={15} /> },
    { id: 'chat',    label: 'Chat',    icon: <MessageCircle size={15} /> },
    { id: 'events',  label: 'Events',  icon: <Calendar size={15} /> },
    { id: 'members', label: 'Members', icon: <Users size={15} /> },
  ]

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', overflowY: 'auto' }}>
      {/* Hero cover */}
      <div style={{ position: 'relative', height: 'calc(176px + var(--sat))', background: gradient, flexShrink: 0, overflow: 'hidden' }}>
        {community.cover_url && <AuthenticatedImage src={community.cover_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.38))' }} />
        <div style={{ position: 'absolute', top: 'calc(12px + var(--sat))', left: '12px', right: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <button
            onClick={requestAppBack}
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(12px)', WebkitTapHighlightColor: 'transparent' }}
          >
            <ArrowLeft size={18} color="#fff" />
          </button>
          {['owner', 'admin'].includes(community.member_role || '') ? (
            <button
              aria-label="Edit community"
              onClick={() => navigate(`/app/community/${community.slug}/edit`)}
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '50%', width: 36, height: 36, display: 'grid', placeItems: 'center', cursor: 'pointer', backdropFilter: 'blur(12px)' }}
            >
              <Settings size={17} color="#fff" />
            </button>
          ) : community.is_private ? (
            <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(12px)' }}>
              <Lock size={16} color="#fff" />
            </div>
          ) : null}
        </div>
      </div>

      {DEMO_MODE && community.is_member && <button onClick={() => navigate(`/app/create/post?community_id=${community.id}`)} style={{ margin: 16, padding: 12, borderRadius: radii.pill, border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', cursor: 'pointer' }}>Create community post</button>}
      {/* Community info */}
      <div style={{ padding: '0 16px 16px', borderBottom: `1px solid var(--color-border)`, flexShrink: 0, position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '-32px', marginBottom: '16px' }}>
          <div style={{ width: 80, height: 80, borderRadius: radii.xl, background: gradient, border: `4px solid var(--color-bg)`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            {community.avatar_url
              ? <AuthenticatedImage src={community.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Globe size={32} color="rgba(255,255,255,0.85)" strokeWidth={1.5} />
            }
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: '0 0 4px', fontWeight: 800, fontSize: '22px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1.2, wordBreak: 'break-word' }}>{community.name}</h2>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{community.category} · {community.members_count?.toLocaleString()} {community.members_count === 1 ? 'member' : 'members'}</p>
          </div>
        </div>

        {community.description && (
          <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: 1.5, opacity: 0.9 }}>{community.description}</p>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          {['owner', 'admin'].includes(community.member_role || '') ? (
            <button
              onClick={() => navigate(`/app/community/${community.slug}/edit`)}
              style={{ flex: 1, padding: '12px', borderRadius: radii.pill, border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 14, cursor: 'pointer' }}
            >
              Edit community
            </button>
          ) : (
          <button
            onClick={() => community.is_member ? leaveCommunity(community.id) : joinCommunity(community.id)}
            style={{
              flex: 1, padding: '12px', borderRadius: radii.pill, border: community.is_member ? `1px solid var(--color-border-strong)` : 'none',
              background: community.is_member ? 'var(--color-surface-hover)' : 'var(--color-lime)',
              color: community.is_member ? 'var(--color-text-primary)' : 'var(--color-accent-contrast)', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '14px', cursor: 'pointer',
              transition: `all ${motion.base} ${motion.easeSmooth}`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {community.is_member ? 'Joined' : 'Join Community'}
          </button>
          )}
          {community.is_member && (
            <button
              onClick={() => { if (tab !== 'chat') setTab('chat') }}
              style={{ padding: '12px 24px', borderRadius: radii.pill, border: `1px solid var(--color-border-strong)`, background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', WebkitTapHighlightColor: 'transparent' }}
            >
              <MessageCircle size={18} strokeWidth={2} /> Chat
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid var(--color-border)`, flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '12px 4px', border: 'none', background: 'none', cursor: 'pointer',
              color: tab === t.id ? 'var(--color-lime)' : 'var(--color-text-muted)',
              borderBottom: tab === t.id ? '2px solid var(--color-lime)' : '2px solid transparent',
              fontSize: '12px', fontWeight: tab === t.id ? 600 : 400,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              transition: `all ${motion.fast} ${motion.easeSmooth}`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'posts' && (
          postsLoading
            ? <FeedLoadingSkeletons count={2} />
            : posts.length === 0
              ? <EmptyTab icon={<FileText size={26} color="var(--color-lime)" strokeWidth={1.6} />} label="No posts yet. Be the first!" />
              : posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onLike={() => likePost(p.id)}
                    onUnlike={() => unlikePost(p.id)}
                    onSave={() => savePost(p.id)}
                    onUnsave={() => unsavePost(p.id)}
                    onCommentPress={() => setCommentPostId(p.id)}
                  />
                ))
        )}

        {tab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '12px' }}>
            {DEMO_MODE && community.is_member && <button onClick={async () => { try { const response = await client.get(`/communities/${community.id}/chat`); navigate(`/app/chat/${response.data.data.id}`) } catch (e: any) { toast.error(e.message) } }} style={{ padding: 12, borderRadius: radii.pill, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>Open community chat</button>}
            <MessageCircle size={40} color="var(--color-lime)" />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px', margin: 0, textAlign: 'center', padding: '0 32px' }}>
              {community.is_member ? (DEMO_MODE ? 'Plan your next session with the community.' : 'Group chat for this community — coming soon!') : 'Join this community to access the group chat.'}
            </p>
          </div>
        )}

        {tab === 'events' && (
          eventsLoading
            ? <div style={{ padding: '12px 16px' }}><EventCardsSkeleton count={3} /></div>
            : events.length === 0
            ? <EmptyTab icon={<CalendarDays size={26} color="var(--color-lime)" strokeWidth={1.6} />} label="No events scheduled" />
            : events.map((e) => (
                <EventRow key={e.id} event={e} onClick={() => navigate(`/app/events/${e.id}`)} />
              ))
        )}

        {tab === 'members' && (
          membersLoading
            ? <PeopleRowsSkeleton count={5} />
            : currentMembers.length === 0
            ? <EmptyTab icon={<Users size={26} color="var(--color-lime)" strokeWidth={1.6} />} label="No members yet" />
            : currentMembers.map((m) => (
                <MemberRow key={m.id} member={m} onPress={() => navigate(`/app/profile/${m.username}`)} />
              ))
        )}
      </div>

      {commentPostId && <CommentSheet postId={commentPostId} commentsCount={0} onClose={() => setCommentPostId(null)} onCommentAdded={() => {}} />}
    </div>
  )
}

function EventRow({ event, onClick }: { event: any; onClick: () => void }) {
  const date = parseApiDate(event.starts_at)
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px', cursor: 'pointer', borderBottom: `1px solid var(--color-border)`, WebkitTapHighlightColor: 'transparent' }}>
      <div style={{ width: 44, height: 44, borderRadius: radii.md, background: 'var(--color-surface-hover)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', color: 'var(--color-lime)', fontWeight: 700 }}>{date.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
        <span style={{ fontSize: '16px', color: 'var(--color-text-primary)', fontWeight: 800, lineHeight: 1 }}>{date.getDate()}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>{event.location || (event.is_online ? 'Online' : 'TBD')} · {event.attendees_count} going</p>
      </div>
    </div>
  )
}

function MemberRow({ member, onPress }: { member: any; onPress: () => void }) {
  return (
    <div onClick={onPress} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: '12px', cursor: 'pointer', borderBottom: `1px solid var(--color-border)`, WebkitTapHighlightColor: 'transparent' }}>
      <Avatar src={member.avatar_url} name={member.full_name} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name}</p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>@{member.username?.toLowerCase()}{member.college_name ? ` · ${member.college_name}` : ''}</p>
      </div>
      {member.role !== 'member' && (
        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: radii.pill, background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', color: member.role === 'owner' ? '#F59E0B' : 'var(--color-text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, textTransform: 'capitalize' }}>
          {member.role === 'owner' && <Shield size={10} />}{member.role}
        </span>
      )}
    </div>
  )
}

function EmptyTab({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', animation: 'fadeIn 300ms var(--ease-smooth)' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
        boxShadow: '0 0 24px rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'iconPop 400ms var(--ease-spring)',
      }}>
        {icon}
      </div>
      <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontSize: '15px', margin: 0 }}>{label}</p>
    </div>
  )
}
