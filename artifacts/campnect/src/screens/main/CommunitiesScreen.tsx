import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Globe, Monitor, Palette, TrendingUp, Trophy, Music, Gamepad2, Camera, BookOpen, Brush, Heart, Sparkles } from 'lucide-react'
import { useCommunityStore, Community } from '../../stores/communityStore'
import { CommunityCardsSkeleton } from '../../components/shared/AppSkeletons'
import { AuthenticatedImage } from '../../components/shared/AuthenticatedImage'
import { radii } from '../../styles/tokens'

const CATEGORY_GRADIENTS: Record<string, string> = {
  Technology:       'linear-gradient(135deg, #1D4ED8, #0891B2)',
  Design:           'linear-gradient(135deg, #27272A, #DB2777)',
  Entrepreneurship: 'linear-gradient(135deg, #D97706, #DC2626)',
  Sports:           'linear-gradient(135deg, #059669, #0D9488)',
  Music:            'linear-gradient(135deg, #27272A, #18181B)',
  Gaming:           'linear-gradient(135deg, #DC2626, #18181B)',
  Photography:      'linear-gradient(135deg, #B45309, #D97706)',
  Academic:         'linear-gradient(135deg, #18181B, #6D28D9)',
  Arts:             'linear-gradient(135deg, #DB2777, #F59E0B)',
  Wellness:         'linear-gradient(135deg, #059669, #10B981)',
  Social:           'linear-gradient(135deg, #18181B, #C44DCC)',
  Other:            'linear-gradient(135deg, #374151, #6B7280)',
}

function CategoryIcon({ category, size = 22 }: { category: string; size?: number }) {
  const props = { size, strokeWidth: 1.8, color: 'var(--color-text-primary)' }
  switch (category) {
    case 'Technology':       return <Monitor {...props} />
    case 'Design':           return <Palette {...props} />
    case 'Entrepreneurship': return <TrendingUp {...props} />
    case 'Sports':           return <Trophy {...props} />
    case 'Music':            return <Music {...props} />
    case 'Gaming':           return <Gamepad2 {...props} />
    case 'Photography':      return <Camera {...props} />
    case 'Academic':         return <BookOpen {...props} />
    case 'Arts':             return <Brush {...props} />
    case 'Wellness':         return <Heart {...props} />
    case 'Social':           return <Globe {...props} />
    default:                 return <Sparkles {...props} />
  }
}

type ViewMode = 'grid' | 'list' | 'joined'

export function CommunitiesScreen() {
  const navigate = useNavigate()
  const { communities, categories, loading, fetchCommunities, fetchCategories, joinCommunity, leaveCommunity } = useCommunityStore()
  const [viewMode, setViewMode]           = useState<ViewMode>('grid')
  const [searchQ, setSearchQ]             = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
    fetchCommunities()
  }, [])

  const filtered = communities.filter((c) => {
    const matchQ    = !searchQ || c.name.toLowerCase().includes(searchQ.toLowerCase()) || c.description?.toLowerCase().includes(searchQ.toLowerCase())
    const matchCat  = !selectedCategory || c.category === selectedCategory
    const matchJoin = viewMode !== 'joined' || c.is_member
    return matchQ && matchCat && matchJoin
  })

  return (
    <div style={{ minHeight: '100%', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Hero / Create Banner */}
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--color-purple-core), var(--color-bg-mid))',
          borderRadius: '20px',
          padding: '20px',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}>
          {/* Background decoration */}
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'var(--color-lime)', filter: 'blur(50px)', opacity: 0.15, pointerEvents: 'none' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>
              Find your people
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              Join communities that match your vibe, or start something completely new.
            </p>
          </div>

          <button
            onClick={() => navigate('/app/communities/create')}
            style={{
              position: 'relative', zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: 'var(--color-lime)', border: 'none', borderRadius: '12px',
              padding: '12px 20px', cursor: 'pointer',
              fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-display)',
              color: 'var(--color-accent-contrast)',
              boxShadow: 'var(--shadow-btn)',
              transition: 'all 200ms var(--ease-smooth)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Plus size={18} strokeWidth={2.5} />
            Create a Community
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--color-input-bg)',
          border: '1.5px solid var(--color-input-border)',
          borderRadius: '14px', padding: '0 14px', height: '44px',
        }}>
          <Search size={16} color="var(--color-input-icon)" />
          <input
            type="text"
            placeholder="Search communities…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'var(--font-body)',
              caretColor: 'var(--color-lime)',
            }}
          />
        </div>
      </div>

      {/* View mode tabs */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', overflowX: 'auto' }} className="no-scrollbar">
        {(['grid', 'list', 'joined'] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            style={{
              flexShrink: 0,
              padding: '6px 16px',
              borderRadius: '9999px',
              border: viewMode === m ? 'none' : `1px solid var(--color-border)`,
              background: viewMode === m ? 'var(--color-lime)' : 'transparent',
              color: viewMode === m ? 'var(--color-accent-contrast)' : 'var(--color-text-muted)',
              fontFamily: 'var(--font-display)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              transition: 'all 200ms var(--ease-smooth)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', padding: '0 16px 12px', overflowX: 'auto' }} className="no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '9999px',
                border: selectedCategory === cat.name ? 'none' : `1px solid var(--color-border)`,
                background: selectedCategory === cat.name ? 'var(--color-lime-dim)' : 'transparent',
                color: selectedCategory === cat.name ? 'var(--color-lime)' : 'var(--color-text-muted)',
                fontFamily: 'var(--font-display)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                transition: 'all 200ms var(--ease-smooth)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: selectedCategory === cat.name ? 'transparent' : 'var(--color-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CategoryIcon category={cat.name} size={10} />
              </div>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ padding: '0 16px 80px' }}><CommunityCardsSkeleton count={viewMode === 'grid' ? 6 : 5} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 24px', gap: '12px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(24,24,27,0.14)', border: '1.5px solid rgba(24,24,27,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={28} color="var(--color-lime)" strokeWidth={1.6} />
          </div>
          <p style={{ fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', margin: 0 }}>No communities found</p>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>Try a different search or category</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '0 16px 80px' }}>
          {filtered.map((c) => <CommunityGridCard key={c.id} community={c} onJoin={joinCommunity} onLeave={leaveCommunity} onClick={() => navigate(`/app/community/${c.slug}`)} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '80px' }}>
          {filtered.map((c) => <CommunityListRow key={c.id} community={c} onJoin={joinCommunity} onLeave={leaveCommunity} onClick={() => navigate(`/app/community/${c.slug}`)} />)}
        </div>
      )}
    </div>
  )
}

function CommunityGridCard({ community: c, onJoin, onLeave, onClick }: { community: Community; onJoin: (id: string) => void; onLeave: (id: string) => void; onClick: () => void }) {
  const gradient = CATEGORY_GRADIENTS[c.category || 'Other'] || CATEGORY_GRADIENTS['Other']
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: radii.lg, overflow: 'hidden',
        border: `1px solid var(--color-border)`,
        background: 'var(--color-surface)',
        boxShadow: 'var(--shadow-card)',
        cursor: 'pointer',
        transition: 'transform 200ms var(--ease-spring)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Cover */}
      <div style={{ height: '80px', background: c.cover_url ? undefined : gradient, position: 'relative', overflow: 'hidden' }}>
        {c.cover_url && <AuthenticatedImage src={c.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} />
        {/* Category icon badge */}
        <div style={{
          position: 'absolute', top: '8px', right: '8px',
          width: 26, height: 26, borderRadius: '50%',
          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CategoryIcon category={c.category || 'Other'} size={13} />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 10px 12px' }}>
        <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '14px', fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
        <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>{c.members_count || 0} members</p>
        <button
          onClick={(e) => { e.stopPropagation(); c.is_member ? onLeave(c.id) : onJoin(c.id) }}
          style={{
            width: '100%', padding: '7px', borderRadius: radii.pill,
            border: c.is_member ? `1px solid var(--color-border)` : 'none',
            background: c.is_member ? 'transparent' : 'var(--color-lime)',
             color: c.is_member ? 'var(--color-text-secondary)' : 'var(--color-accent-contrast)',
            fontFamily: 'var(--font-display)',
            fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            transition: 'all 200ms var(--ease-smooth)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {c.is_member ? 'Joined' : 'Join'}
        </button>
      </div>
    </div>
  )
}

function CommunityListRow({ community: c, onJoin, onLeave, onClick }: { community: Community; onJoin: (id: string) => void; onLeave: (id: string) => void; onClick: () => void }) {
  const gradient = CATEGORY_GRADIENTS[c.category || 'Other'] || CATEGORY_GRADIENTS['Other']
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', cursor: 'pointer',
        borderBottom: `1px solid var(--color-border)`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ width: 48, height: 48, borderRadius: '14px', background: c.cover_url ? undefined : gradient, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {c.cover_url
          ? <AuthenticatedImage src={c.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <CategoryIcon category={c.category || 'Other'} size={22} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '15px', fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>{c.category} · {c.members_count || 0} members</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); c.is_member ? onLeave(c.id) : onJoin(c.id) }}
        style={{
          padding: '7px 16px', borderRadius: radii.pill, flexShrink: 0,
          border: c.is_member ? `1px solid var(--color-border)` : 'none',
          background: c.is_member ? 'transparent' : 'var(--color-lime)',
           color: c.is_member ? 'var(--color-text-secondary)' : 'var(--color-accent-contrast)',
          fontFamily: 'var(--font-display)',
          fontSize: '13px', fontWeight: 700, cursor: 'pointer',
          transition: 'all 200ms var(--ease-smooth)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {c.is_member ? 'Joined' : 'Join'}
      </button>
    </div>
  )
}
