import { DEMO_MODE } from '../../demo/config'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, CircleUserRound, Edit3, Grid2X2, Heart, Link as LinkIcon, Lock, MessageCircle, MoreHorizontal, MoreVertical, Settings, UserCheck, UserPlus, Ban, Flag, UserMinus, Clapperboard } from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../../components/shared/Avatar'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { AuthenticatedVideo } from '../../components/shared/AuthenticatedVideo'
import { ProfileVideoThumbnail } from '../../components/profile/ProfileVideoThumbnail'
import { VerifiedBadge } from '../../components/shared/VerifiedBadge'
import { requestAppBack } from '../../navigation/appBackRequest'
import { useBackDismiss } from '../../navigation/overlayDismissRegistry'
import { EmptyState } from '../../components/shared/EmptyState'
import { ProfileLoadingSkeleton, ProfilePostsLoadingSkeleton } from '../../components/feed/PostLoadingState'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PromptDialog } from '../../components/shared/PromptDialog'
import { Button } from '../../components/ui/Button'
import { usersApi } from '../../api/users'
import { useAuthStore } from '../../stores/authStore'
import { Post } from '../../stores/feedStore'
import { useChatStore } from '../../stores/chatStore'
import { mediaUrl } from '../../utils/mediaUrl'
import { glimpsesApi, type Glimpse } from '../../api/glimpses'
import { clipsApi, type Clip } from '../../api/clips'

interface ProfileUser {
  id: string
  username: string
  full_name: string
  avatar_url?: string
  cover_url?: string
  bio?: string
  college_name?: string
  department?: string
  is_college_verified?: boolean
  year?: number | string
  semester?: number | string
  posts_count?: number
  followers_count?: number
  following_count?: number
  is_following?: boolean
  follow_status?: 'active' | 'pending' | null
  is_private?: boolean
  is_restricted?: boolean
  /** Returned by server as account_type — present when fetched */
  account_type?: string
  skills?: string
  social_links?: string
  relationship_status?: 'single' | 'mingle' | 'hidden' | string
  is_blocked?: boolean
}

interface ProfileLink {
  label: string
  url: string
}

function parseProfileList(value: unknown): string[] {
  if (!value) return []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : []
  } catch {
    return []
  }
}

function parseProfileLinks(value: unknown): ProfileLink[] {
  if (!value) return []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    const links = Array.isArray(parsed) ? parsed : parsed?.custom
    if (!Array.isArray(links)) return []
    return links
      .filter((item) => item && typeof item.url === 'string' && item.url.trim())
      .slice(0, 2)
      .map((item) => ({ label: String(item.label || 'Link'), url: item.url.trim() }))
  } catch {
    return []
  }
}

function profileLinkHref(url: string) {
  const candidate = /^https:\/\//i.test(url) ? url : `https://${url}`
  try {
    return new URL(candidate).protocol === 'https:' ? candidate : undefined
  } catch {
    return undefined
  }
}

export function ProfileScreen() {
  const { username }   = useParams<{ username: string }>()
  const navigate       = useNavigate()
  const { user: me, updateUserMedia } = useAuthStore()

  const targetUsername = username || me?.username || ''
  const isMe           = !username || username === me?.username

  const [profile,     setProfile]     = useState<ProfileUser | null>(null)
  const [posts,       setPosts]       = useState<Post[]>([])
  const [taggedPosts, setTaggedPosts] = useState<Post[]>([])
  const [loading,     setLoading]     = useState(true)
  const [postsLoading,setPostsLoading]= useState(false)
  const [glimpses, setGlimpses] = useState<Glimpse[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [followStatus, setFollowStatus] = useState<'none' | 'pending' | 'active'>('none')
  const [mutualFollowers, setMutualFollowers] = useState<any[]>([])
  const [actionsOpen, setActionsOpen] = useState(false)
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'reels' | 'tagged'>('grid')
  const [showAllSkills, setShowAllSkills] = useState(false)
  const profileRequestGeneration = useRef(0)
  const postsRequestGeneration = useRef(0)
  const glimpsesRequestGeneration = useRef(0)
  const clipsRequestGeneration = useRef(0)
  useBackDismiss(actionsOpen, () => setActionsOpen(false), 200)

  useEffect(() => {
    const generation = ++profileRequestGeneration.current
    if (!targetUsername) {
      setLoading(false)
      setProfile(null)
      return
    }
    setLoading(true)
    usersApi.getProfile(targetUsername)
      .then((res) => {
        if (generation !== profileRequestGeneration.current) return
        const p = res.data.data
        setProfile(p)
        setFollowStatus(p.follow_status || (p.is_following ? 'active' : 'none'))
        if (p.id === me?.id) {
          updateUserMedia({ avatar_url: p.avatar_url, cover_url: p.cover_url })
        }
        if (p.id !== me?.id && !p.is_blocked) {
          usersApi.getMutualFollowers(p.id)
            .then(res => {
              if (generation === profileRequestGeneration.current) {
                setMutualFollowers(res.data.data || [])
              }
            })
            .catch(() => {
              if (generation === profileRequestGeneration.current) setMutualFollowers([])
            })
        } else {
          setMutualFollowers([])
        }
      })
      .catch(() => {
        if (generation === profileRequestGeneration.current) setProfile(null)
      })
      .finally(() => {
        if (generation === profileRequestGeneration.current) setLoading(false)
      })
    return () => {
      if (generation === profileRequestGeneration.current) profileRequestGeneration.current += 1
    }
  }, [targetUsername, me?.id, updateUserMedia])

  useEffect(() => {
    const generation = ++postsRequestGeneration.current
    if (!profile) {
      setPosts([])
      setTaggedPosts([])
      setPostsLoading(false)
      return
    }
    if (profile.is_blocked) {
      setPosts([])
      setTaggedPosts([])
      setPostsLoading(false)
      return
    }
    setPostsLoading(true)
    Promise.all([
      usersApi.getUserPosts(profile.id).catch(() => null),
      usersApi.getUserPosts(profile.id, 1, 'tagged').catch(() => null),
    ])
      .then(([postsResponse, taggedResponse]) => {
        if (generation !== postsRequestGeneration.current) return
        const visibleProfilePosts = (postsResponse?.data?.data || [])
          .filter((post: Post) => post.type !== 'glimpse')
        const visibleTaggedPosts = (taggedResponse?.data?.data || [])
          .filter((post: Post) => post.type !== 'reel' && post.type !== 'glimpse')
        setPosts(visibleProfilePosts)
        setTaggedPosts(visibleTaggedPosts)
      })
      .finally(() => {
        if (generation === postsRequestGeneration.current) setPostsLoading(false)
      })
    return () => {
      if (generation === postsRequestGeneration.current) postsRequestGeneration.current += 1
    }
  }, [profile?.id, profile?.is_blocked])

  useEffect(() => {
    const generation = ++glimpsesRequestGeneration.current
    if (!profile) {
      setGlimpses([])
      return
    }
    if (profile.is_blocked || (Boolean(profile.is_private) && !isMe && followStatus !== 'active')) {
      setGlimpses([])
      return
    }
    setGlimpses([])
    const params = isMe
      ? { mode: 'my' as const }
      : { mode: 'feed' as const, creator_id: profile.id }
    glimpsesApi.getFeed(1, 20, params)
      .then((res) => {
        if (generation !== glimpsesRequestGeneration.current) return
        const profileGlimpses = (res.data.data || []).filter(item => item.user_id === profile.id)
        setGlimpses(profileGlimpses)
      })
      .catch(() => {
        if (generation === glimpsesRequestGeneration.current) setGlimpses([])
      })
    return () => {
      if (generation === glimpsesRequestGeneration.current) glimpsesRequestGeneration.current += 1
    }
  }, [profile?.id, profile?.username, profile?.is_private, isMe, followStatus])
  useEffect(() => {
    const generation = ++clipsRequestGeneration.current
    if (!profile || profile.is_blocked) {
      setClips([])
      return
    }
    clipsApi.getUserClips(profile.username)
      .then(r => {
        if (generation === clipsRequestGeneration.current) setClips(r.data.data || [])
      })
      .catch(() => {
        if (generation === clipsRequestGeneration.current) setClips([])
      })
    return () => {
      if (generation === clipsRequestGeneration.current) clipsRequestGeneration.current += 1
    }
  }, [profile?.id, profile?.username])

  useEffect(() => {
    if (glimpses.length === 0) return
    const expiresAt = Math.min(...glimpses.map(item => new Date(item.created_at).getTime() + (24 * 60 * 60 * 1000)))
    const delay = Math.max(0, expiresAt - Date.now() + 25)
    const timer = window.setTimeout(() => {
      const now = Date.now()
      setGlimpses(current => current.filter(item => new Date(item.created_at).getTime() + (24 * 60 * 60 * 1000) > now))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [glimpses])

  async function toggleFollow() {
    if (!profile) return
    try {
      if (followStatus === 'active' || followStatus === 'pending') {
        const wasActive = followStatus === 'active'
        await usersApi.unfollow(profile.id)
        setFollowStatus('none')
        if (wasActive) {
          setProfile((p) => p ? { ...p, followers_count: Math.max(0, (p.followers_count || 1) - 1) } : p)
        }
      } else {
        const response = await usersApi.follow(profile.id)
        const status = response.data?.data?.status === 'pending' ? 'pending' : 'active'
        setFollowStatus(status)
        if (status === 'active') {
          setProfile((p) => p ? { ...p, followers_count: (p.followers_count || 0) + 1 } : p)
        }
      }
    } catch {}
  }

  async function handleMessage() {
    if (!profile) return
    try {
      const { createConversation } = useChatStore.getState()
      const res = await createConversation([profile.id])
      const convId = (res as any)?.id || (res as any)?.data?.id
      if (convId) navigate(`/app/chat/${convId}`)
    } catch {}
  }

  async function handleBlock() {
    if (!profile) return
    setActionsOpen(false)
    setBlockConfirmOpen(true)
  }

  async function confirmBlock() {
    if (!profile || blockConfirmOpen === false) return
    try {
      if (profile.is_blocked) {
        await usersApi.unblock(profile.id)
        setProfile((current) => current ? { ...current, is_blocked: false } : current)
        toast.success('Profile unblocked')
      } else {
        await usersApi.block(profile.id)
        setProfile((current) => current ? { ...current, is_blocked: true } : current)
        toast.success('Profile blocked')
        // Keep the user on this profile and make the blocked shell the
        // canonical route state instead of sending them back to Home.
        navigate(`/app/profile/${encodeURIComponent(profile.username)}`, { replace: true })
      }
      setBlockConfirmOpen(false)
    } catch { toast.error('Could not block user') }
  }

  async function handleReport(reason: string, description?: string) {
    if (!profile || !reason.trim()) return
    setReportBusy(true)
    try {
      await usersApi.report(profile.id, reason.trim(), description)
      toast.success(DEMO_MODE ? 'Report saved to local demo intake. No moderation team is contacted.' : 'Report submitted')
      setReportOpen(false)
      setActionsOpen(false)
    } catch { toast.error('Could not submit report') }
    finally { setReportBusy(false) }
  }

  function copyProfileLink() {
    if (!profile) return
    const url = `${window.location.origin}/app/profile/${encodeURIComponent(profile.username)}`
    navigator.clipboard?.writeText(url).catch(() => {})
    toast.success('Profile link copied')
    setActionsOpen(false)
  }

  if (loading) return <div className="profile-screen"><ProfileHeader isMe={isMe} onSettings={() => navigate('/app/settings')} onBack={requestAppBack} /><ProfileLoadingSkeleton /></div>
  if (!profile) return <div className="profile-screen"><ProfileHeader isMe={isMe} onSettings={() => navigate('/app/settings')} onBack={requestAppBack} /><EmptyState icon={<Camera size={28} color="var(--color-lime)" strokeWidth={1.6} />} title="Profile not found" /></div>

  const displayPosts = posts
  const activePosts = viewMode === 'tagged' ? taggedPosts : displayPosts
  const isPrivate    = profile.is_private && !isMe && followStatus !== 'active'
  const publicBio = profile.bio?.startsWith('DOB:') ? '' : profile.bio
  const cleanDepartment = profile.department?.replace(/\s*·\s*\d+\s+Years?$/i, '')
  const currentYear = profile.year ?? profile.semester
  const yearLabel = currentYear
    ? ({ 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year', 5: '5th Year', 6: 'Postgraduate' } as Record<string, string>)[String(currentYear)] || `Year ${currentYear}`
    : ''
  const skills = parseProfileList(profile.skills)
  const profileLinks = parseProfileLinks(profile.social_links)
  const relationshipStatus = ['single', 'mingle', 'hidden'].includes(profile.relationship_status || '') ? profile.relationship_status : 'hidden'
  const relationshipLabel = relationshipStatus === 'single' ? 'Single' : relationshipStatus === 'mingle' ? 'Mingle' : 'Hidden'
  const blockedProfile = Boolean(profile.is_blocked && !isMe)
  const firstUnviewedGlimpse = glimpses.find(item => !item.is_viewed)
  const firstProfileGlimpse = firstUnviewedGlimpse || glimpses[0]
  const hasUnviewedGlimpse = Boolean(firstUnviewedGlimpse)

  return (
    <div className="profile-screen">
      <ProfileHeader isMe={isMe} onSettings={() => navigate('/app/settings')} onBack={requestAppBack} onActions={() => setActionsOpen(v => !v)} />
      {!isMe && actionsOpen && (
        <div className="profile-actions-menu">
          <button onClick={copyProfileLink} style={menuActionStyle}><LinkIcon size={15} /> Copy profile link</button>
           <button onClick={() => { setActionsOpen(false); setReportOpen(true) }} style={menuActionStyle}><Flag size={15} /> Report profile</button>
           <button onClick={handleBlock} style={{ ...menuActionStyle, color: profile.is_blocked ? 'var(--color-lime)' : '#ef4444' }}><Ban size={15} /> {profile.is_blocked ? 'Unblock profile' : 'Block profile'}</button>
          <button onClick={async () => {
            try {
              if (profile.is_restricted) {
                await usersApi.unrestrict(profile.id)
                setProfile(p => p ? { ...p, is_restricted: false } : p)
                toast.success('Restriction removed')
              } else {
                await usersApi.restrict(profile.id)
                setProfile(p => p ? { ...p, is_restricted: true } : p)
                toast.success('User restricted')
              }
            } catch { toast.error('Could not update restriction') }
            setActionsOpen(false)
          }} style={menuActionStyle}><UserMinus size={15} /> {profile.is_restricted ? 'Remove restriction' : 'Restrict'}</button>
        </div>
      )}
      {blockedProfile ? (
        <BlockedProfileContent
          profile={profile}
          onUnblock={handleBlock}
        />
      ) : <section className="profile-hero">
        <div className="profile-cover">
           {profile.cover_url ? <AuthenticatedImage src={profile.cover_url} alt="Cover" /> : <div className="profile-cover-fallback" />}
        </div>
        <div className="profile-identity-row">
          {glimpses.length > 0 ? (
            <button
              className={`profile-avatar-ring profile-avatar-story${hasUnviewedGlimpse ? '' : ' profile-avatar-story-viewed'}`}
              aria-label={`View ${profile.full_name}'s Glimpses`}
              onClick={() => {
                const params = new URLSearchParams({
                  profile: profile.id,
                  open: firstProfileGlimpse.id,
                  returnTo: `/app/profile/${profile.username}`,
                })
                navigate(`/app/glimpse?${params.toString()}`)
              }}
            >
              <Avatar src={profile.avatar_url} name={profile.full_name} size={86} />
            </button>
          ) : (
            <div className="profile-avatar-ring"><Avatar src={profile.avatar_url} name={profile.full_name} size={86} /></div>
          )}
          {isMe ? (
            <button className="profile-edit-button" onClick={() => navigate('/app/edit-profile')}><Edit3 size={17} /> Edit Profile</button>
          ) : (
            <div className="profile-action-stack">
              <Button size="sm" variant={followStatus !== 'none' ? 'ghost' : 'primary'} onClick={toggleFollow}>
                {followStatus === 'active'
                  ? <><UserCheck size={15} /> Following</>
                  : followStatus === 'pending'
                    ? 'Requested'
                    : <><UserPlus size={15} /> Follow</>}
              </Button>
              <button className="profile-message-button" onClick={handleMessage}><MessageCircle size={15} /> Message</button>
            </div>
          )}
        </div>
        <div className="profile-copy">
          <div className="profile-name-row">
            <h1>{profile.full_name}</h1>
            {(profile.is_college_verified || ['ceo', 'cmo'].includes(profile.username?.toLowerCase() || '')) && <VerifiedBadge size={17} />}
          </div>
          <p className="profile-handle">@{profile.username?.toLowerCase()}</p>
          {publicBio && <p className="profile-bio">{publicBio}</p>}
          <div className="profile-relationship-wrap">
            <span className={`profile-relationship profile-relationship-${relationshipStatus}`}>
              <Heart size={12} fill={relationshipStatus === 'hidden' ? 'none' : 'currentColor'} />
              {relationshipLabel}
            </span>
          </div>
          {profileLinks.length > 0 && (
            <div className="profile-links" aria-label="Profile links">
              {profileLinks.map((link) => (
                <a key={`${link.label}-${link.url}`} href={profileLinkHref(link.url)} target="_blank" rel="noreferrer">
                  <LinkIcon size={13} />
                  {link.label}
                </a>
              ))}
            </div>
          )}
          {skills.length > 0 && (
            <div className="profile-skills" aria-label="Skills">
              <div className="profile-skills-heading">
                <span>Skills</span>
                {skills.length > 2 && (
                  <button onClick={() => setShowAllSkills((open) => !open)}>
                    {showAllSkills ? 'Show less' : 'More skills'}
                  </button>
                )}
              </div>
              <div className="profile-skill-list">
                {(showAllSkills ? skills : skills.slice(0, 2)).map((skill) => (
                  <span className="profile-skill-chip" key={skill}>{skill}</span>
                ))}
              </div>
            </div>
          )}
          {(profile.college_name || cleanDepartment || yearLabel) && (
            <div className="profile-chips">
              {profile.college_name && <span><span aria-hidden>⌂</span>{profile.college_name}</span>}
              {cleanDepartment && <span><span aria-hidden>▣</span>{cleanDepartment}</span>}
              {yearLabel && <span><span aria-hidden>•</span>{yearLabel}</span>}
            </div>
          )}
          {!isMe && mutualFollowers.length > 0 && <button className="profile-mutuals" onClick={() => navigate(`/app/profile/${profile.username}/followers`)}>Followed by {mutualFollowers[0].full_name}{mutualFollowers.length > 1 ? ` and ${mutualFollowers.length - 1} other${mutualFollowers.length > 2 ? 's' : ''}` : ''}</button>}
        </div>
        <div className="profile-stats">
          {[
            { label: 'Posts', val: profile.posts_count || 0 },
            { label: 'Followers', val: profile.followers_count || 0, onClick: () => navigate(`/app/profile/${profile.username}/followers`) },
            { label: 'Following', val: profile.following_count || 0, onClick: () => navigate(`/app/profile/${profile.username}/following`) },
          ].map((stat) => (
            <button key={stat.label} onClick={stat.onClick} disabled={!stat.onClick}>
              <strong>{stat.val >= 1000 ? `${(stat.val / 1000).toFixed(1)}k` : stat.val}</strong><span>{stat.label}</span>
            </button>
          ))}
        </div>
      </section>}

      {!blockedProfile && <div className="profile-view-tabs" role="tablist" aria-label="Profile content">
        <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} role="tab" aria-selected={viewMode === 'grid'} aria-label="Posts"><Grid2X2 size={23} /></button>
        <button className={viewMode === 'reels' ? 'active' : ''} onClick={() => setViewMode('reels')} role="tab" aria-selected={viewMode === 'reels'} aria-label="Clips"><Clapperboard size={22} /></button>
        <button className={viewMode === 'tagged' ? 'active' : ''} onClick={() => setViewMode('tagged')} role="tab" aria-selected={viewMode === 'tagged'} aria-label="Tagged posts"><CircleUserRound size={23} /></button>
      </div>}

      {/* Private gate */}
      {blockedProfile ? (
        <div className="profile-blocked-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '18px 28px 84px', gap: 14 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--color-lime)', boxShadow: '0 10px 34px rgba(0,0,0,0.26)' }}>
            <Ban size={31} strokeWidth={1.8} />
          </div>
          <div>
            <h2 style={{ margin: 0, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', fontSize: 21, lineHeight: 1.2 }}>Content unavailable</h2>
            <p style={{ margin: '9px auto 0', maxWidth: 310, color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
              Posts and Glimpses from this profile are hidden while your block is active. Unblock the profile whenever you want access again.
            </p>
          </div>
          <Button size="sm" variant="primary" onClick={handleBlock}>
            Unblock profile
          </Button>
        </div>
      ) : isPrivate ? (
        <div
          className="profile-private-content"
          style={{
            display: 'flex',
            minHeight: 300,
            flexDirection: 'column',
            alignItems: 'center',
            padding: '56px 24px 96px',
            gap: '16px',
            textAlign: 'center',
          }}
        >
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            background: 'transparent', border: '1.5px solid var(--color-text-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={40} strokeWidth={1.35} color="var(--color-text-primary)" />
          </div>
          <div>
            <h2 style={{ fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: '22px', lineHeight: 1.2, color: 'var(--color-text-primary)', margin: 0 }}>This profile is private</h2>
            <p style={{ maxWidth: 320, fontSize: '15px', lineHeight: 1.45, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)', margin: '12px auto 0' }}>Follow this profile to see their photos and videos.</p>
          </div>
        </div>
      ) : (
        <>
          {viewMode === 'reels' ? (
            clips.length ? <ClipsGrid clips={clips} navigate={navigate} profileUsername={profile.username} /> : <EmptyState icon={<Clapperboard size={28} color="var(--color-lime)" />} title="No clips yet" />
          ) : postsLoading ? (
            <ProfilePostsLoadingSkeleton />
          ) : activePosts.length === 0 ? (
            <EmptyState
              icon={viewMode === 'tagged'
                ? <CircleUserRound size={30} color="var(--color-lime)" strokeWidth={1.6} />
                : <Camera size={28} color="var(--color-lime)" strokeWidth={1.6} />}
              title={viewMode === 'tagged' ? 'No tagged posts yet' : 'No posts yet'}
            />
          ) : (
             <PostsGrid posts={activePosts} navigate={navigate} profileUsername={profile.username} />
          )}
        </>
      )}
      <ConfirmDialog
        open={blockConfirmOpen}
        title={profile.is_blocked ? `Restore @${profile.username}?` : `Block @${profile.username}?`}
        message={profile.is_blocked
          ? 'Their profile and content will become available again, and messaging can resume.'
          : 'They will not be able to view your profile or message you. You will unfollow each other, while any existing chat history stays available.'}
        confirmLabel={profile.is_blocked ? 'Unblock profile' : 'Block profile'}
        cancelLabel="Cancel"
        destructive={!profile.is_blocked}
        onConfirm={() => void confirmBlock()}
        onCancel={() => setBlockConfirmOpen(false)}
      />
      <PromptDialog
        open={reportOpen}
        title={`Report @${profile.username}`}
        message="Tell us why you are reporting this profile. Our team will review your report."
        placeholder="Reason for reporting"
        defaultValue="harassment"
        submitLabel="Submit report"
        onSubmit={(reason, details) => void handleReport(reason, details)}
        onCancel={() => !reportBusy && setReportOpen(false)}
        busy={reportBusy}
      />
    </div>
  )
}

const menuActionStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 9px',
  border: 0, background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer',
  fontSize: 13, textAlign: 'left', borderRadius: 8,
}

function ProfileHeader({
  isMe,
  onSettings,
  onBack,
  onActions,
}: {
  isMe: boolean
  onSettings?: () => void
  onBack?: () => void
  onActions?: () => void
}) {
  return (
    <header className="profile-header">
      {!isMe && <button className="profile-header-icon" aria-label="Back" onClick={onBack}><ArrowLeft size={19} /></button>}
      <h1>Profile</h1>
      {isMe ? (
        <button className="profile-header-icon" aria-label="Settings" onClick={onSettings}><Settings size={19} /></button>
      ) : (
        <button className="profile-header-icon" aria-label="Profile options" onClick={onActions}><MoreHorizontal size={19} /></button>
      )}
    </header>
  )
}

function BlockedProfileContent({
  profile,
  onUnblock,
}: {
  profile: ProfileUser
  onUnblock: () => void
}) {
  return (
    <section className="profile-hero">
      <div className="profile-cover">
        <div className="profile-cover-fallback" style={{ opacity: 0.45 }} />
      </div>
      <div className="profile-identity-row">
        <div className="profile-avatar-ring">
          <Avatar src={profile.avatar_url} name={profile.full_name} size={86} />
        </div>
        <div className="profile-action-stack">
          <Button size="sm" variant="primary" onClick={onUnblock}>
            Unblock profile
          </Button>
          <button className="profile-message-button" disabled style={{ opacity: 0.55, cursor: 'not-allowed' }}>
            <MessageCircle size={15} /> Messaging paused
          </button>
        </div>
      </div>
      <div className="profile-copy">
        <div className="profile-name-row">
          <h1>{profile.full_name}</h1>
        </div>
        <p className="profile-handle">@{profile.username?.toLowerCase()}</p>
      </div>
      <div className="profile-stats">
        {[
          { label: 'Posts', val: profile.posts_count || 0 },
          { label: 'Followers', val: profile.followers_count || 0 },
          { label: 'Following', val: profile.following_count || 0 },
        ].map((stat) => (
          <button key={stat.label} disabled>
            <strong>{stat.val >= 1000 ? `${(stat.val / 1000).toFixed(1)}k` : stat.val}</strong>
            <span>{stat.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function PostsGrid({ posts, navigate, profileUsername }: { posts: Post[]; navigate: (p: string) => void; profileUsername: string }) {
  const activeVideoRef = useRef<HTMLVideoElement | null>(null)
  const activateVideo = useCallback((video: HTMLVideoElement) => {
    if (activeVideoRef.current && activeVideoRef.current !== video) {
      activeVideoRef.current.pause()
    }
    activeVideoRef.current = video
    void video.play().catch(() => {
      if (activeVideoRef.current === video) activeVideoRef.current = null
    })
  }, [])
  const deactivateVideo = useCallback((video: HTMLVideoElement) => {
    video.pause()
    if (activeVideoRef.current === video) activeVideoRef.current = null
  }, [])

  useEffect(() => () => {
    activeVideoRef.current?.pause()
    activeVideoRef.current = null
  }, [])

  return (
    <div className="profile-post-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
      {posts.map((post) => {
        const isVideoPost = post.type === 'video' || post.type === 'reel'
        const rawUrl = isVideoPost
          ? (post.cover_url || (Array.isArray(post.media) && post.media.length > 0 ? post.media[0] : null))
          : (Array.isArray(post.media) && post.media.length > 0 ? post.media[0] : null)
        const imgUrl = mediaUrl(rawUrl)
        const showAsVideo = isVideoPost && !post.cover_url
        return (
          <div
            key={post.id}
            onClick={() => navigate(isVideoPost ? `/app/clips/${post.id}?profile=${encodeURIComponent(profileUsername)}` : `/app/post/${post.id}`)}
            style={{
              /* padding-bottom: 100% forces a square cell regardless of browser aspect-ratio support */
              position: 'relative',
              paddingBottom: '100%',
              overflow: 'hidden',
              cursor: 'pointer',
              background: 'rgba(24,24,27,0.15)',
              transition: 'opacity 150ms',
            }}
          >
            {imgUrl && !showAsVideo ? (
               <AuthenticatedImage
                src={imgUrl}
                alt="post"
                 loading="lazy"
                 placeholderVariant="post"
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
               />
            ) : imgUrl && showAsVideo ? (
              <ProfileVideoThumbnail
                src={imgUrl}
                onActivate={activateVideo}
                onDeactivate={deactivateVideo}
              />
            ) : (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(24,24,27,0.12)',
              }}>
                <Camera size={22} color="rgba(255,255,255,0.25)" />
              </div>
            )}
            {isVideoPost && (
              <div style={{
                position: 'absolute', top: 6, right: 6,
                background: 'rgba(0,0,0,0.55)', borderRadius: '4px',
                padding: '2px 5px', fontSize: '10px', color: '#fff',
                fontFamily: 'var(--font-body)', fontWeight: 600,
              }}>
                ▶
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ClipsGrid({ clips, navigate, profileUsername }: { clips: Clip[]; navigate: (p: string) => void; profileUsername: string }) {
  return <div className="profile-post-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
    {clips.map(clip => <button key={clip.id} onClick={() => navigate(`/app/clips/${clip.id}?profile=${encodeURIComponent(profileUsername)}`)} style={{ position:'relative', aspectRatio:'1', padding:0, overflow:'hidden', border:0, background:'var(--color-surface-hover)', cursor:'pointer' }}>
      {clip.thumbnail_url || clip.cover_url ? (
        <AuthenticatedImage src={clip.thumbnail_url || clip.cover_url} alt="Reel thumbnail" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
      ) : clip.media?.[0] ? (
        <AuthenticatedVideo src={clip.media[0]} muted playsInline preload="metadata" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
      ) : (
        <Clapperboard style={{marginTop:'38%'}} />
      )}
      <span style={{position:'absolute',right:5,top:5,color:'#fff',fontSize:11,textShadow:'0 1px 3px #000'}}>▶</span>
    </button>)}
  </div>
}
