import { ChevronRight } from 'lucide-react'
import { legalLinks, supportContactUrl } from '../helpLinks'
import { colors } from '../../styles/tokens'
import { sectionHeadingStyle } from './HelpArticleList'
import './help.css'

interface Props { onNavigate: (route: string) => void }

const rowStyle = { width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', border: 0, background: 'transparent', textAlign: 'left' as const, boxSizing: 'border-box' as const, textDecoration: 'none', color: colors.textPrimary }
const subStyle = { display: 'block', marginTop: 2, color: colors.textMuted, fontSize: 13, lineHeight: 1.4, fontWeight: 400 }

export function HelpEscalation({ onNavigate }: Props) {
  const rows = [
    { title: 'Report a user or content', sub: 'Open the guide to reporting posts, messages and accounts.', route: '/app/settings/help/article/report-content' },
    { title: 'Appeal a moderation decision', sub: 'Review content that was removed or restricted.', route: '/app/settings/content-appeals' },
  ]
  const policy = legalLinks.filter((l) => l.url)
  return (
    <section aria-labelledby="help-still" style={{ marginTop: 28 }}>
      <h2 id="help-still" style={sectionHeadingStyle}>Still need help?</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
        {rows.map((row) => (
          <li key={row.route} style={{ borderBottom: `1px solid ${colors.border}` }}>
            <button type="button" className="help-press" onClick={() => onNavigate(row.route)} style={rowStyle}>
              <span className="help-text" style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{row.title}<span style={subStyle}>{row.sub}</span></span>
              <ChevronRight size={18} color={colors.textMuted} aria-hidden="true" />
            </button>
          </li>
        ))}
        <li>
          {supportContactUrl ? (
            <a className="help-press help-link" href={supportContactUrl} target="_blank" rel="noreferrer" style={rowStyle}>
              <span className="help-text" style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Contact support<span style={subStyle}>Opens in a new tab.</span></span>
              <ChevronRight size={18} color={colors.textMuted} aria-hidden="true" />
            </a>
          ) : (
            <div style={{ ...rowStyle, cursor: 'default' }}>
              <span className="help-text" style={{ flex: 1, fontSize: 15, fontWeight: 600, color: colors.textSecondary }}>Technical support contact<span style={subStyle}>Campnect does not have a direct support contact set up in this app yet. Browse the guides above or use the options here.</span></span>
            </div>
          )}
        </li>
      </ul>
      {policy.length > 0 && (
        <p className="help-text" style={{ margin: '14px 16px 0', color: colors.textMuted, fontSize: 13, lineHeight: 1.8 }}>
          Policies:{' '}
          {policy.map((l, i) => (
            <span key={l.title}>
              <a className="help-link" href={l.url} target="_blank" rel="noreferrer" style={{ color: colors.textPrimary, fontWeight: 600, display: 'inline-block', minHeight: 44, lineHeight: '44px' }}>{l.title}</a>
              {i < policy.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      )}
    </section>
  )
}
