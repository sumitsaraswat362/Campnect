import { useState } from 'react'
import { colors, radii } from '../../styles/tokens'
import './help.css'

type Vote = 'yes' | 'no' | null
type Reason = 'didnt-work' | 'not-found' | 'unclear' | 'app-different' | 'other'

const reasons: { id: Reason; label: string }[] = [
  { id: 'didnt-work', label: "The instructions didn't work" },
  { id: 'not-found', label: "I couldn't find what I needed" },
  { id: 'unclear', label: 'The information is unclear' },
  { id: 'app-different', label: 'Something in the app is different' },
  { id: 'other', label: 'Other' },
]

interface Props { onNavigate: (route: string) => void; hasTroubleshooting: boolean; supportUrl?: string; updateGuide?: { title: string; route: string } }

const btn = (active: boolean) => ({ flex: 1, minHeight: 44, padding: '0 14px', borderRadius: radii.pill, border: `1px solid ${active ? 'var(--color-lime)' : colors.border}`, background: active ? 'var(--color-lime)' : 'transparent', color: active ? 'var(--color-on-lime)' : colors.textPrimary, fontWeight: 700, fontSize: 14 })

export function HelpFeedback({ onNavigate, hasTroubleshooting, supportUrl, updateGuide }: Props) {
  const [vote, setVote] = useState<Vote>(null)
  const [reason, setReason] = useState<Reason | null>(null)
  const pick = (v: Exclude<Vote, null>) => { if (vote === v) { setVote(null); setReason(null) } else { setVote(v); setReason(null) } }

  const next = (): { text: string; action?: { label: string; route: string } } | null => {
    switch (reason) {
      case 'didnt-work': return { text: (hasTroubleshooting ? 'Check the troubleshooting section above for symptoms and fixes.' : 'Try a related article below.') + (supportUrl ? '' : ' A direct support contact is not set up in this app.') }
      case 'not-found': return { text: 'Search all Help topics for a different wording.', action: { label: 'Search Help', route: '/app/settings/help' } }
      case 'unclear': return { text: 'Try the related articles below, which cover nearby tasks in different words.' }
      case 'app-different': return { text: 'Screens can differ between app versions or platforms. Follow the closest matching step.', action: updateGuide ? { label: updateGuide.title, route: updateGuide.route } : undefined }
      case 'other': return { text: 'If this is about safety or a moderation decision, these may help.', action: { label: 'Reporting guide', route: '/app/settings/help/article/report-content' } }
      default: return null
    }
  }
  const n = next()

  return (
    <section aria-labelledby="help-feedback" style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${colors.border}` }}>
      <h2 id="help-feedback" style={{ margin: '0 0 12px', color: colors.textPrimary, fontSize: 17, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Was this helpful?</h2>
      <div role="group" aria-labelledby="help-feedback" style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="help-press" aria-pressed={vote === 'yes'} onClick={() => pick('yes')} style={btn(vote === 'yes')}>Yes</button>
        <button type="button" className="help-press" aria-pressed={vote === 'no'} onClick={() => pick('no')} style={btn(vote === 'no')}>No</button>
      </div>
      <div role="status" aria-live="polite">
        {vote === 'yes' && <p style={{ margin: '12px 0 0', color: colors.textSecondary, fontSize: 14 }}>Glad this helped.</p>}
      </div>
      {vote === 'no' && (
        <fieldset style={{ margin: '14px 0 0', padding: 0, border: 0, minWidth: 0 }}>
          <legend style={{ padding: 0, marginBottom: 6, color: colors.textPrimary, fontSize: 15, fontWeight: 600 }}>What went wrong?</legend>
          {reasons.map((r) => (
            <label key={r.id} className="help-text" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, color: colors.textPrimary, fontSize: 14, cursor: 'pointer' }}>
              <input type="radio" name="help-reason" checked={reason === r.id} onChange={() => setReason(r.id)} style={{ width: 20, height: 20, accentColor: 'var(--color-lime)', margin: 0 }} />
              {r.label}
            </label>
          ))}
          <div role="status" aria-live="polite">
            {n && (
              <div style={{ marginTop: 8 }}>
                <p className="help-text" style={{ margin: 0, color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>{n.text}</p>
                {reason === 'didnt-work' && supportUrl && <a className="help-press help-link" href={supportUrl} target="_blank" rel="noreferrer" style={{ ...btn(false), flex: 'none', marginTop: 8, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Contact support</a>}
                {n.action && <button type="button" className="help-press" onClick={() => onNavigate(n.action!.route)} style={{ ...btn(false), flex: 'none', marginTop: 8 }}>{n.action.label}</button>}
              </div>
            )}
          </div>
        </fieldset>
      )}
      <p style={{ margin: '14px 0 0', color: colors.textMuted, fontSize: 12, lineHeight: 1.5 }}>Your answer stays on this screen. It is not saved or sent to Campnect.</p>
    </section>
  )
}
