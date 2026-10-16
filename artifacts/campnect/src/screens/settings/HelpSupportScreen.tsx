import { useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  HelpArticle, HelpCategory, commonIssueIds, getPublishedHelpArticles, helpCategories, helpCategoryDescriptions, quickHelpIds,
} from '../../help/helpArticles'
import { searchHelpArticles } from '../../help/helpSearch'
import { useAuthStore } from '../../stores/authStore'
import { colors, radii } from '../../styles/tokens'
import { HelpArticleList, sectionHeadingStyle } from '../../help/ui/HelpArticleList'
import { HelpEscalation } from '../../help/ui/HelpEscalation'
import { normalizeHelpRole } from '../../help/ui/helpRole'
import { helpOwnerKey } from '../../help/ui/helpAuthScope'
import { useHelpVisit } from '../../help/ui/useHelpVisit'
import { useDebouncedStatus } from '../../help/ui/useDebouncedStatus'
import '../../help/ui/help.css'

const suggestions = [
  "I can't log in",
  'I forgot my password',
  'How do I change my username?',
  "Why didn't I receive my OTP?",
  'How do I report someone?',
  "Why can't I upload a video?",
]

export function HelpSupportScreen() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const role = normalizeHelpRole(user)
  const { query, setQuery, category, setCategory, anchorRef } = useHelpVisit(helpOwnerKey(user))
  const visible = useMemo(() => getPublishedHelpArticles(role), [role])
  const byId = useMemo(() => new Map(visible.map((a) => [a.id, a])), [visible])
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((a): a is HelpArticle => !!a)
  const quick = useMemo(() => pick(quickHelpIds), [byId]) // eslint-disable-line react-hooks/exhaustive-deps
  const common = useMemo(() => pick(commonIssueIds), [byId]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const m = new Map<HelpCategory, number>()
    visible.forEach((a) => m.set(a.category, (m.get(a.category) || 0) + 1))
    return m
  }, [visible])
  const topics = helpCategories.filter((c) => (counts.get(c) || 0) > 0)
  const searching = query.trim().length > 0
  const results = useMemo(() => (searching ? searchHelpArticles(query, visible) : []), [query, visible, searching])
  const inCategory = category ? visible.filter((a) => a.category === category) : []
  const open = (a: HelpArticle) => navigate(`/app/settings/help/article/${a.slug}`, { state: { helpFromHome: true } })

  const status = useDebouncedStatus(searching ? (results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'} found` : 'No matching articles found') : '')

  return (
    <section className="help-page" aria-label="Help and Support" ref={anchorRef as React.Ref<HTMLElement>}>
      <div className="help-wrap">
        <header style={{ padding: '20px 16px 12px' }}>
          <h1 style={{ margin: 0, color: colors.textPrimary, fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, lineHeight: 1.15 }}>Help &amp; Support</h1>
          <p className="help-text" style={{ margin: '6px 0 0', color: colors.textMuted, fontSize: 14, lineHeight: 1.5 }}>Find answers, troubleshoot problems, and understand your options.</p>
          <div role="search" style={{ marginTop: 16 }}>
            <label htmlFor="help-search" className="sr-only">Search Campnect help</label>
            <div className="help-search" style={{ minHeight: 52, padding: '0 6px 0 14px', borderRadius: radii.lg, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-surface)', border: `1px solid ${colors.border}` }}>
              <Search size={19} color={colors.textMuted} aria-hidden="true" />
              <input id="help-search" className="help-input" type="search" enterKeyHint="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a problem or question" style={{ flex: 1, minWidth: 0, minHeight: 44, border: 0, background: 'transparent', color: colors.textPrimary, fontSize: 16, fontFamily: 'var(--font-body)', WebkitAppearance: 'none' }} />
              {query && (
                <button type="button" className="help-press" aria-label="Clear search" onClick={() => setQuery('')} style={{ width: 44, height: 44, flexShrink: 0, border: 0, borderRadius: radii.pill, background: 'transparent', display: 'grid', placeItems: 'center', color: colors.textMuted }}>
                  <X size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div role="status" aria-live="polite" className="sr-only">{status}</div>
        </header>

        {searching ? (
          <section aria-labelledby="help-results">
            <h2 id="help-results" style={sectionHeadingStyle}>{results.length ? `${results.length} ${results.length === 1 ? 'result' : 'results'} across all topics` : 'No results'}</h2>
            {results.length > 0 ? (
              <HelpArticleList articles={results} onOpen={open} showCategory label="Search results" />
            ) : (
              <div style={{ padding: '4px 16px 0' }}>
                <p className="help-text" style={{ margin: 0, color: colors.textPrimary, fontSize: 16, fontWeight: 600 }}>We couldn't find an answer for that.</p>
                <p className="help-text" style={{ margin: '4px 0 12px', color: colors.textMuted, fontSize: 14, lineHeight: 1.5 }}>Nothing matched &ldquo;{query.trim()}&rdquo;. Try different words, or try one of these.</p>
                <SuggestionList onPick={setQuery} />
                <h3 style={{ margin: '20px 0 4px', color: colors.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Browse a topic</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {topics.map((t) => (
                    <li key={t}><button type="button" className="help-press" onClick={() => { setQuery(''); setCategory(t) }} style={{ width: '100%', minHeight: 44, padding: 0, border: 0, background: 'transparent', textAlign: 'left', color: colors.textPrimary, fontSize: 14, fontWeight: 600 }}>{t} <span style={{ color: colors.textMuted, fontWeight: 400 }}>({counts.get(t)})</span></button></li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <>
            {!category && quick.length > 0 && (
              <section aria-labelledby="help-quick" style={{ marginTop: 4 }}>
                <h2 id="help-quick" style={sectionHeadingStyle}>Quick help</h2>
                <HelpArticleList articles={quick} onOpen={open} label="Quick help" />
              </section>
            )}

            <section aria-labelledby="help-topics" style={{ marginTop: 24 }}>
              <h2 id="help-topics" style={sectionHeadingStyle}>Browse by topic</h2>
              <div className="help-chips" role="group" aria-label="Help topics">
                <button type="button" className="help-press" aria-pressed={!category} onClick={() => setCategory(null)} style={chip(!category)}>All topics</button>
                {topics.map((t) => (
                  <button key={t} type="button" className="help-press" aria-pressed={category === t} onClick={() => setCategory(t)} style={chip(category === t)}>{t}</button>
                ))}
              </div>
            </section>

            {category ? (
              <section aria-labelledby="help-cat" style={{ marginTop: 16 }}>
                <h2 id="help-cat" style={{ ...sectionHeadingStyle, marginBottom: 2 }}>{category}</h2>
                <p className="help-text" style={{ margin: '0 16px 10px', color: colors.textMuted, fontSize: 13, lineHeight: 1.45 }}>{helpCategoryDescriptions[category]}</p>
                {inCategory.length > 0 ? <HelpArticleList articles={inCategory} onOpen={open} label={category} /> : (
                  <div style={{ padding: '0 16px' }}>
                    <p style={{ margin: '0 0 8px', color: colors.textSecondary, fontSize: 14 }}>No published articles are available in this topic yet.</p>
                    <button type="button" className="help-press" onClick={() => setCategory(null)} style={{ minHeight: 44, padding: '0 16px', borderRadius: radii.pill, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textPrimary, fontWeight: 700 }}>All topics</button>
                  </div>
                )}
              </section>
            ) : common.length > 0 && (
              <section aria-labelledby="help-common" style={{ marginTop: 24 }}>
                <h2 id="help-common" style={sectionHeadingStyle}>Common issues</h2>
                <HelpArticleList articles={common} onOpen={open} label="Common issues" />
              </section>
            )}

            <section aria-labelledby="help-try" style={{ marginTop: 24, padding: '0 16px' }}>
              <h2 id="help-try" style={{ ...sectionHeadingStyle, margin: '0 0 4px' }}>Try asking</h2>
              <SuggestionList onPick={setQuery} />
            </section>
          </>
        )}

        <HelpEscalation onNavigate={(route) => navigate(route, { state: { helpFromHome: true } })} />
      </div>
    </section>
  )
}

function SuggestionList({ onPick }: { onPick: (q: string) => void }) {
  return (
    <ul aria-label="Suggested searches" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {suggestions.map((s) => (
        <li key={s}><button type="button" className="help-press help-text" onClick={() => onPick(s)} style={{ width: '100%', minHeight: 44, padding: 0, border: 0, background: 'transparent', textAlign: 'left', color: colors.textSecondary, fontSize: 14 }}>{s}</button></li>
      ))}
    </ul>
  )
}

const chip = (active: boolean) => ({ whiteSpace: 'nowrap' as const, minHeight: 44, padding: '0 16px', borderRadius: radii.pill, border: `1px solid ${active ? 'var(--color-lime)' : colors.border}`, background: active ? 'var(--color-lime)' : 'transparent', color: active ? 'var(--color-on-lime)' : colors.textSecondary, fontWeight: 700, fontSize: 13 })
