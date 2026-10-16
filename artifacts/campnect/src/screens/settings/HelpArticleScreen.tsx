import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { getHelpArticle, getRelatedHelpArticles, helpArticles } from '../../help/helpArticles'
import { useAuthStore } from '../../stores/authStore'
import { colors, radii } from '../../styles/tokens'
import { HelpArticleList } from '../../help/ui/HelpArticleList'
import { HelpEscalation } from '../../help/ui/HelpEscalation'
import { returnToHelp } from '../../help/ui/helpNav'
import { requestAppBack } from '../../navigation/appBackRequest'
import { supportContactUrl } from '../../help/helpLinks'
import { getPublishedHelpArticles } from '../../help/helpArticles'
import '../../help/ui/helpAuthScope'
import { HelpFeedback } from '../../help/ui/HelpFeedback'
import { normalizeHelpRole } from '../../help/ui/helpRole'
import '../../help/ui/help.css'

const h2: React.CSSProperties = { margin: '0 0 10px', color: colors.textPrimary, fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)' }
const p: React.CSSProperties = { margin: '0 0 12px', color: colors.textSecondary, fontSize: 15, lineHeight: 1.6 }

export function HelpArticleScreen() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const role = normalizeHelpRole(useAuthStore((s) => s.user))
  const article = getHelpArticle(slug ?? '', role)
  const raw = useMemo(() => helpArticles.find((a) => a.slug === slug), [slug])
  const h1Ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { h1Ref.current?.focus({ preventScroll: true }) }, [slug])
  const related = article ? getRelatedHelpArticles(article, role) : []
  const goHelp = () => returnToHelp({ state: location.state, requestBack: requestAppBack, replaceToHelp: () => navigate('/app/settings/help', { replace: true, state: location.state }) })
  const updateArticle = getPublishedHelpArticles(role).find((a) => /update/.test(a.slug))

  if (!article) {
    const facultyOnly = raw?.published && raw.audience === 'faculty'
    const title = !raw ? 'Article not found' : facultyOnly ? 'This guide is for faculty accounts' : 'This article is not available'
    const body = !raw
      ? 'We could not find a Help article at this address. It may have moved or the link may be incomplete.'
      : facultyOnly
        ? 'The steps in this guide apply only to faculty or teacher accounts, so they are not shown for your account.'
        : 'This article is not published right now.'
    return (
      <div className="help-page"><div className="help-wrap" style={{ padding: '28px 16px' }}>
        <h1 ref={h1Ref} tabIndex={-1} className="help-h1 help-text" style={{ margin: '0 0 8px', color: colors.textPrimary, fontFamily: 'var(--font-display)', fontSize: 24 }}>{title}</h1>
        <p style={p}>{body}</p>
        <button type="button" className="help-press" onClick={goHelp} style={{ minHeight: 44, padding: '0 20px', border: 0, borderRadius: radii.pill, background: 'var(--color-lime)', color: 'var(--color-on-lime)', fontWeight: 800 }}>Browse Help</button>
      </div></div>
    )
  }

  const actions = (article.actions || []).filter((a) => a.route.startsWith('/app/'))
  return (
    <div className="help-page">
      <article className="help-wrap" style={{ padding: '20px 16px 8px' }}>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{article.category}</p>
        <h1 ref={h1Ref} tabIndex={-1} className="help-h1 help-text" style={{ margin: '8px 0 8px', color: colors.textPrimary, fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1.15, fontWeight: 800 }}>{article.title}</h1>
        <p className="help-text" style={{ ...p, fontSize: 16 }}>{article.description}</p>
        {article.body.map((text, i) => <p key={i} className="help-text" style={p}>{text}</p>)}

        {article.steps.length > 0 && (
          <section aria-labelledby="a-steps" style={{ marginTop: 24 }}>
            <h2 id="a-steps" style={h2}>Steps</h2>
            <ol style={{ margin: 0, paddingLeft: 24 }}>
              {article.steps.map((step, i) => (
                <li key={i} style={{ padding: '0 0 16px 6px', color: colors.textMuted }}>
                  <h3 className="help-text" style={{ margin: '0 0 3px', color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>{step.title}</h3>
                  <p className="help-text" style={{ margin: 0, color: colors.textSecondary, fontSize: 14, lineHeight: 1.6 }}>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {article.notes.length > 0 && (
          <section aria-labelledby="a-notes" style={{ marginTop: 12, paddingLeft: 14, borderLeft: `3px solid ${colors.borderStrong}` }}>
            <h2 id="a-notes" style={h2}>Good to know</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {article.notes.map((n, i) => <li key={i} className="help-text" style={{ ...p, margin: '0 0 8px' }}>{n}</li>)}
            </ul>
          </section>
        )}

        {article.troubleshooting.length > 0 && (
          <section aria-labelledby="a-trouble" style={{ marginTop: 24 }}>
            <h2 id="a-trouble" style={h2}>Troubleshooting</h2>
            {article.troubleshooting.map((t, i) => (
              <div key={i} style={{ padding: '12px 0', borderTop: `1px solid ${colors.border}` }}>
                <h3 className="help-text" style={{ margin: '0 0 3px', color: colors.textPrimary, fontSize: 15, fontWeight: 700 }}>{t.problem}</h3>
                <p className="help-text" style={{ margin: 0, color: colors.textSecondary, fontSize: 14, lineHeight: 1.6 }}>{t.solution}</p>
              </div>
            ))}
          </section>
        )}

        {actions.length > 0 && (
          <section aria-labelledby="a-actions" style={{ marginTop: 24 }}>
            <h2 id="a-actions" style={h2}>Go there</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {actions.map((a) => (
                <button key={a.route + a.label} type="button" className="help-press" onClick={() => navigate(a.route)} style={{ minHeight: 44, padding: '0 16px', borderRadius: radii.pill, border: 0, background: 'var(--color-lime)', color: 'var(--color-on-lime)', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {a.label}<ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        )}

        <HelpFeedback supportUrl={supportContactUrl} updateGuide={updateArticle ? { title: updateArticle.title, route: `/app/settings/help/article/${updateArticle.slug}` } : undefined} onNavigate={(route) => route === '/app/settings/help' ? goHelp() : navigate(route, { replace: route.startsWith('/app/settings/help'), state: location.state })} hasTroubleshooting={article.troubleshooting.length > 0} />
      </article>

      {related.length > 0 && (
        <section aria-labelledby="a-related" className="help-wrap" style={{ marginTop: 20 }}>
          <h2 id="a-related" style={{ ...h2, margin: '0 16px 8px' }}>Related articles</h2>
          <HelpArticleList articles={related} label="Related articles" onOpen={(a) => navigate(`/app/settings/help/article/${a.slug}`, { replace: true, state: location.state })} />
        </section>
      )}
      <div className="help-wrap"><HelpEscalation onNavigate={(route) => navigate(route, { replace: route.startsWith('/app/settings/help'), state: location.state })} /></div>
    </div>
  )
}
