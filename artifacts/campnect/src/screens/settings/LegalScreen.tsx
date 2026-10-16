import { ExternalLink, Heart } from 'lucide-react'
import { legalLinks } from '../../help/helpLinks'
import { colors } from '../../styles/tokens'

export function LegalScreen() {
  return (
    <main style={{ minHeight: '100%', background: colors.bg, padding: '24px 0 36px' }}>
      <section style={{ padding: '0 16px 16px' }}>
        <h1 style={{ margin: 0, color: colors.textPrimary, fontFamily: 'var(--font-display)', fontSize: 23 }}>Legal</h1>
        <p style={{ margin: '5px 0 0', color: colors.textMuted, fontSize: 13, lineHeight: 1.5 }}>Policies and guidelines for the Campnect community.</p>
      </section>
      <section aria-label="Legal documents">
        <p style={{ margin: '0 16px 7px', color: colors.textMuted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Legal</p>
        <div style={{ background: 'var(--color-surface)', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
          {legalLinks.map((link, index) => (
            <a key={link.title} href={link.url} target="_blank" rel="noreferrer" style={{ minHeight: 54, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: index === legalLinks.length - 1 ? 'none' : `1px solid ${colors.border}`, color: colors.textPrimary, textDecoration: 'none', cursor: 'pointer' }}>
              <span><span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{link.title}</span><span style={{ display: 'block', marginTop: 2, color: colors.textMuted, fontSize: 11 }}>Opens Campnect Legal</span></span>
              <ExternalLink size={17} color={colors.textMuted} aria-hidden="true" />
            </a>
          ))}
        </div>
      </section>
      <p style={{ textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>Made with <Heart size={12} fill="var(--color-lime)" color="var(--color-lime)" /> for campus communities</p>
    </main>
  )
}