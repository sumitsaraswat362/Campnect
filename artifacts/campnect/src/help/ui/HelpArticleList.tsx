import { ChevronRight } from 'lucide-react'
import type { HelpArticle } from '../helpArticles'
import { colors } from '../../styles/tokens'
import './help.css'

interface Props {
  articles: HelpArticle[]
  onOpen: (article: HelpArticle) => void
  showCategory?: boolean
  label: string
}

export function HelpArticleList({ articles, onOpen, showCategory, label }: Props) {
  return (
    <ul aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
      {articles.map((article, index) => (
        <li key={article.id} style={{ borderBottom: index === articles.length - 1 ? 'none' : `1px solid ${colors.border}` }}>
          <button type="button" className="help-press" onClick={() => onOpen(article)} style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', border: 0, background: 'transparent', textAlign: 'left', boxSizing: 'border-box' }}>
            <span className="help-text" style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', color: colors.textPrimary, fontSize: 15, fontWeight: 600 }}>{article.title}</strong>
              <span style={{ display: 'block', marginTop: 2, color: colors.textMuted, fontSize: 13, lineHeight: 1.4 }}>{article.shortDescription}</span>
              {showCategory && <span style={{ display: 'block', marginTop: 4, color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>{article.category}</span>}
            </span>
            <ChevronRight size={18} color={colors.textMuted} aria-hidden="true" style={{ flexShrink: 0 }} />
          </button>
        </li>
      ))}
    </ul>
  )
}

export const sectionHeadingStyle = { margin: '0 16px 8px', color: colors.textMuted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
