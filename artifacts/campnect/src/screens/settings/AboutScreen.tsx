import { ExternalLink, Heart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { colors, radii } from '../../styles/tokens'
import { useAppVersionLabel } from '../../hooks/useAppVersionLabel'

export function AboutScreen() {
  const navigate = useNavigate()
  const versionLabel = useAppVersionLabel()
  return (
    <div style={{ minHeight: '100%', background: colors.bg, paddingBottom: '32px' }}>
      {/* Brand */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px 24px' }}>
        <div style={{
          width: 84, height: 84, borderRadius: '24px',
          background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '14px',
          overflow: 'hidden',
          boxShadow: '0 10px 28px rgba(7,18,11,0.16)',
        }}>
          <img
            src="/campnect-logo.png"
            alt="Campnect logo"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, fontFamily: 'var(--font-display)', color: colors.textPrimary }}>Campnect</h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', fontFamily: 'var(--font-body)', color: colors.textMuted }}>{versionLabel} · Campus Social Platform</p>
      </div>

      {/* Info cards */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <InfoCard
          title="About"
          body="Campnect is a premium, college-only social platform for verified students. Connect with peers, discover communities, and stay on top of campus events — all in one place."
        />
        <InfoCard
          title="Built for students"
          body="Every feature is designed for the college experience: verified identities, campus communities, academic events, and real-time connections that matter."
        />
        <InfoCard
          title="Privacy & Safety"
          body="Your privacy is our priority. We verify every user through their college email. Robust reporting, moderation, and privacy controls keep the community safe."
        />
      </div>

      {/* Links */}
      <div style={{ marginTop: '24px' }}>
        <p style={{ margin: '0 0 4px 16px', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-display)', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Legal</p>
        <div style={{ background: 'var(--color-surface)', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
          <button type="button" onClick={() => navigate('/app/settings/legal')} style={{ width: '100%', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <span style={{ fontSize: '15px', fontFamily: 'var(--font-body)', color: colors.textPrimary }}>View legal documents</span>
              <ExternalLink size={14} color={colors.textMuted} />
          </button>
        </div>
      </div>

      <p style={{ textAlign: 'center', color: colors.textMuted, fontSize: '12px', fontFamily: 'var(--font-body)', marginTop: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
        Made with <Heart size={12} fill="var(--color-lime)" color="var(--color-lime)" /> for campus communities
      </p>
      <p style={{ textAlign: 'center', color: colors.textMuted, fontSize: '11px', fontFamily: 'var(--font-body)', margin: '10px 24px 0', lineHeight: 1.5 }}>
        Emoji graphics by <a href="https://openmoji.org/" target="_blank" rel="noreferrer" style={{ color: colors.textSecondary }}>OpenMoji</a> — the open-source emoji and icon project. License: <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" style={{ color: colors.textSecondary }}>CC BY-SA 4.0</a>.
      </p>
    </div>
  )
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: `1px solid ${colors.border}`, borderRadius: radii.xl, padding: '16px' }}>
      <p style={{ margin: '0 0 6px', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '14px', color: colors.textPrimary }}>{title}</p>
      <p style={{ margin: 0, fontSize: '13px', fontFamily: 'var(--font-body)', color: colors.textSecondary, lineHeight: 1.6 }}>{body}</p>
    </div>
  )
}
