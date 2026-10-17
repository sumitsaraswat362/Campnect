import type { HelpArticle } from './helpArticles'
import { helpArticles } from './helpArticles'

interface SearchIndex {
  article: HelpArticle
  title: string[]
  keywords: string[]
  description: string[]
  category: string[]
}

const excludedWords = new Set([
  'a', 'about', 'an', 'and', 'are', 'do', 'does', 'for', 'from', 'how',
  'i', 'in', 'is', 'it', 'my', 'of', 'on', 'the', 'this', 'to', 'what',
  'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
])

const searchableText = (value: string) => {
  let text = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[’‘`]/g, "'")

  // Keep a useful intent word when expanding contractions. In particular,
  // "can't log in" retains the negation concept rather than dropping "not".
  text = text
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bcannot\b/g, 'cannot')
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bdoesn't\b/g, 'does not')
    .replace(/\bdidn't\b/g, 'did not')
    .replace(/\bisn't\b/g, 'is not')
    .replace(/\baren't\b/g, 'are not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bwhat's\b/g, 'what is')
    .replace(/\b(?:log|sign)\s+(?:in|into)\b/g, 'login')
    .replace(/\blog[\s-]?in\b/g, 'login')
    .replace(/\bsign[\s-]?in\b/g, 'login')
    .replace(/\bverification\s+code\b/g, 'otp')

  return text
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function meaningfulWords(value: string) {
  return searchableText(value).split(' ').filter((word) => word && !excludedWords.has(word))
}

function coverage(query: readonly string[], text: readonly string[]) {
  if (!query.length || !text.length) return 0
  const available = new Set(text)
  const matched = query.reduce((count, word) => count + Number(available.has(word)), 0)
  return matched / query.length
}

function wholePhrase(query: readonly string[], text: readonly string[]) {
  return query.length > 0 && ` ${text.join(' ')} `.includes(` ${query.join(' ')} `)
}

const indexCache = new WeakMap<HelpArticle[], SearchIndex[]>()

function indexArticles(articles: HelpArticle[]) {
  const cached = indexCache.get(articles)
  if (cached) return cached
  const index = articles
    .filter((article) => article.published)
    .map((article) => ({
      article,
      title: meaningfulWords(article.title),
      keywords: meaningfulWords([
        ...article.keywords,
        ...article.aliases,
        ...article.searchTerms,
      ].join(' ')),
      description: meaningfulWords(article.description || article.shortDescription),
      category: meaningfulWords(article.category),
    }))
  indexCache.set(articles, index)
  return index
}

/**
 * Deterministic, local Help search. Tuple ranking protects a direct title match
 * from being displaced by an unrelated article with many keyword matches.
 */
export function searchHelpArticles(query: string, articles: HelpArticle[] = helpArticles): HelpArticle[] {
  const words = meaningfulWords(query)
  if (!words.length) return []

  return indexArticles(articles)
    .map((entry) => {
      const { article, title, keywords, description, category } = entry
      const isExactTitle = title.join(' ') === words.join(' ')
      const titleCoverage = coverage(words, title)
      const keywordCoverage = coverage(words, keywords)
      const descriptionCoverage = coverage(words, description)
      const categoryCoverage = coverage(words, category)
      const titlePhrase = wholePhrase(words, title)

      let tier = 0
      let matchCoverage = 0
      if (isExactTitle) {
        tier = 5
        matchCoverage = 1
      } else if (titlePhrase || titleCoverage >= 0.67) {
        tier = 4
        matchCoverage = Math.max(titlePhrase ? 1 : 0, titleCoverage)
      } else if (keywordCoverage > 0) {
        tier = 3
        matchCoverage = keywordCoverage
      } else if (descriptionCoverage > 0) {
        tier = 2
        matchCoverage = descriptionCoverage
      } else if (categoryCoverage > 0) {
        tier = 1
        matchCoverage = categoryCoverage
      }

      const priority = Number.isFinite(article.searchPriority)
        ? Math.max(-20, Math.min(20, article.searchPriority))
        : 0
      return { article, tier, matchCoverage, priority }
    })
    .filter((result) => result.tier > 0)
    .sort((a, b) =>
      b.tier - a.tier
      || b.matchCoverage - a.matchCoverage
      || b.priority - a.priority
      || a.article.title.localeCompare(b.article.title, 'en')
      || a.article.id.localeCompare(b.article.id, 'en'),
    )
    .map(({ article }) => article)
}