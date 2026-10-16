// @ts-nocheck
/**
 * Campnect Content Classifier
 * Classifies posts into categories, detects political content, safety issues, and quality signals.
 */

const CATEGORY_PATTERNS: Record<string, string[]> = {
  'Campus Life':    ['campus', 'hostel', 'dorm', 'canteen', 'mess', 'library', 'classroom', 'lecture hall', 'college building', 'college life', 'uni life', 'back to college'],
  'Events':         ['fest', 'festival', 'event', 'competition', 'workshop', 'seminar', 'hackathon', 'conference', 'cultural', 'techfest', 'culturals', 'farewell', 'induction', 'orientation', 'convocation'],
  'Clubs':          ['club', 'society', 'nss', 'ncc', 'rotaract', 'red cross', 'tech club', 'coding club', 'debate', 'drama', 'literary', 'eco club', 'photography club', 'robotics', 'entrepreneurship cell'],
  'Sports':         ['cricket', 'football', 'basketball', 'volleyball', 'badminton', 'chess', 'athletics', 'sport', 'match', 'tournament', 'gym', 'fitness', 'swimming', 'kabaddi', 'hockey', 'table tennis'],
  'Projects':       ['project', 'research', 'paper', 'publication', 'prototype', 'built a', 'my project', 'side project', 'capstone', 'thesis', 'hackathon project', 'open source project'],
  'Academics':      ['study', 'exam', 'assignment', 'quiz', 'lecture', 'professor', 'grade', 'marks', 'semester', 'notes', 'syllabus', 'viva', 'practical', 'internals', 'backlog', 'attendance', 'gpa', 'cgpa'],
  'Career':         ['internship', 'placement', 'job', 'interview', 'resume', 'cv', 'linkedin', 'offer letter', 'career', 'campus recruit', 'ppo', 'full time', 'job hunt', 'coding round', 'selection'],
  'Memes':          ['meme', 'funny', 'lol', 'lmao', 'rofl', 'joke', 'comedy', 'relatable', 'mood', 'shitpost', 'when you', 'nobody:', 'be like'],
  'Photography':    ['photo', 'photography', 'shot', 'click', 'camera', 'portrait', 'landscape', 'filter', 'edited', 'dslr', 'photoshoot', 'golden hour', 'aesthetic'],
  'Music':          ['music', 'song', 'sing', 'singing', 'dance', 'dancing', 'rap', 'beat', 'cover', 'melody', 'guitar', 'piano', 'drums', 'band', 'concert', 'playlist'],
  'Art':            ['art', 'sketch', 'drawing', 'paint', 'design', 'creative', 'artwork', 'illustration', 'digital art', 'mandala', 'doodle', 'graffiti'],
  'Gaming':         ['game', 'gaming', 'gamer', 'esports', 'valorant', 'bgmi', 'minecraft', 'pubg', 'mobile game', 'pc gaming', 'console', 'playstation', 'xbox', 'twitch'],
  'Technology':     ['tech', 'coding', 'programming', 'software', 'hardware', 'machine learning', 'web dev', 'app dev', 'startup', 'javascript', 'python', 'java', 'react', 'open source', 'github', 'leetcode'],
  'Food':           ['food', 'canteen food', 'mess food', 'recipe', 'foodie', 'snack', 'biryani', 'pizza', 'cooking', 'baking', 'restaurant'],
  'Friendships':    ['friend', 'bestie', 'bff', 'squad', 'crew', 'hangout', 'roommate', 'batchmate', 'classmate', 'college friends', 'batch'],
  'Discussions':    ['opinion', 'thoughts', 'what do you think', 'discussion', 'debate', 'question', 'poll', 'unpopular opinion', 'hot take', 'would you'],
  'Announcements':  ['announcement', 'notice', 'important', 'alert', 'update', 'official', 'deadline', 'result out', 'date sheet', 'schedule released'],
  'Fashion':        ['fashion', 'outfit', 'style', 'wear', 'clothes', 'dress', 'ootd', 'streetwear', 'thrift', 'jewellery'],
  'Travel':         ['travel', 'trip', 'trek', 'hill station', 'beach', 'road trip', 'backpacking', 'wanderlust', 'college trip', 'journey'],
  'Mental Health':  ['mental health', 'stress', 'anxiety', 'burnout', 'self care', 'therapy', 'counseling', 'wellbeing', 'mindfulness', 'healing'],
  'Cross-College':  ['collab', 'collaboration', 'inter college', 'cross college', 'other college', 'national level', 'all india', 'pan india'],
}

const POLITICAL_KEYWORDS: string[] = [
  'bjp', 'congress', 'aap', 'bsp', 'sp', 'tmc', 'ysrcp', 'dmk', 'tdp', 'jdu', 'shivsena', 'akali',
  'modi', 'narendra modi', 'rahul gandhi', 'yogi adityanath', 'kejriwal', 'arvind kejriwal',
  'mamata banerjee', 'nitish kumar', 'uddhav thackeray', 'devendra fadnavis', 'akhilesh yadav',
  'smriti irani', 'amit shah', 'nirmala sitharaman', 'priyanka gandhi',
  'general election', 'lok sabha election', 'assembly election', 'state election', 'election campaign',
  'manifesto', 'vote for', 'constituency', 'lok sabha', 'rajya sabha', 'vidhan sabha',
  'election result', 'exit poll', 'political party agenda', 'ruling party', 'opposition party',
  'political rally', 'political speech', 'communal riots', 'hindutva campaign',
  'trump', 'biden', 'harris', 'democrats', 'republicans', 'labour party', 'conservative party',
  '#bjp', '#congress', '#modi', '#rahulgandhi', '#aamaadmiparty', '#vote', '#elections',
]

const CAMPUS_POLITICAL_KEYWORDS: string[] = [
  'student union', 'student council', 'student election', 'student president', 'student representative',
  'abvp', 'nsui', 'sfi', 'aisa', 'aisf', 'campus election', 'college election',
  'student body', 'campus politics', 'student government', 'students federation',
  'hostel committee', 'student welfare', 'college administration', 'university policy',
  'campus protest', 'student protest', 'fee hike', 'exam reform', 'student rights',
  'student leader', 'student association', 'college union', 'college council',
  'college decision', 'dean notice', 'vice chancellor', 'academic council',
  'student feedback', 'student issue', 'campus issue', 'intra college politics',
]

const SAFETY_HIGH: string[] = [
  'pornography', 'porn', 'nude photo', 'nudity explicit', 'onlyfans link', 'x-rated',
  'gore', 'graphic violence', 'death video', 'murder video', 'torture',
  'kill yourself', 'kys method', 'i will kill you', 'bomb threat', 'shoot the school',
  'suicide tutorial', 'how to commit suicide', 'self harm method',
  'csam', 'child abuse image',
]

const SAFETY_MEDIUM: string[] = [
  'scam', 'fraud', 'fake lottery', 'prize claim', 'easy money scheme',
  'follow for follow', 'buy followers', 'bitcoin scam', 'crypto scam',
  'phishing', 'hack account', 'steal data',
  'bully', 'bullying target', 'harass', 'threatening message', 'doxxing', 'dox',
  'impersonating', 'fake verified', 'mass dm', 'spam link',
]

const ENGAGEMENT_BAIT: string[] = [
  'like for like', 'follow for follow', 'f4f', 'l4l', 'comment yes or no',
  'tag 5 friends to win', 'share to win', 'drop a 💯', 'type amen',
  'first 100 to comment', 'like if you agree', 'ignore if you hate',
  'share this post to 10 people', 'watch till end for trick',
]

const QUALITY_POSITIVE: string[] = [
  'tutorial', 'how to', 'guide', 'explained', 'learn with', 'tips and tricks',
  'built this', 'made this', 'created this', 'my original', 'oc',
  'my research', 'sharing my notes', 'solved', 'open source', 'github link',
  'full code', 'step by step', 'resource sharing', 'free resource',
]

const SPAM_PATTERNS: string[] = [
  'work from home earn', 'earn lakhs per day', 'paisa kamao', 'join my channel link',
  'whatsapp group link join', 'telegram join link',
]

function normalizeText(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s#@_.\u0900-\u097f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function countMatches(text: string, patterns: string[]): number {
  let count = 0
  for (const pattern of patterns) {
    if (text.includes(pattern)) count++
  }
  return count
}

function hasMatch(text: string, patterns: string[]): boolean {
  return patterns.some(p => text.includes(p))
}

export interface ClassificationResult {
  categories:          string[]
  is_political:        boolean
  is_campus_pol:       boolean
  safety_flag:         'none' | 'low' | 'medium' | 'high'
  safety_score:        number
  quality_score:       number
  is_spam:             boolean
  is_engagement_bait:  boolean
}

export function classifyPost(
  content:            string,
  tags:               string[] = [],
  postType:           string   = 'text',
  communityCategory?: string,
): ClassificationResult {
  const allText = normalizeText([content, ...tags].join(' '))

  // ── Safety ────────────────────────────────────────────────
  let safetyFlag: 'none' | 'low' | 'medium' | 'high' = 'none'
  let safetyScore = 1.0
  if (hasMatch(allText, SAFETY_HIGH)) {
    safetyFlag = 'high'; safetyScore = 0.0
  } else if (countMatches(allText, SAFETY_MEDIUM) >= 2) {
    safetyFlag = 'medium'; safetyScore = 0.3
  } else if (countMatches(allText, SAFETY_MEDIUM) === 1) {
    safetyFlag = 'low'; safetyScore = 0.6
  }

  // ── Political detection ───────────────────────────────────
  const campusPolMatches  = countMatches(allText, CAMPUS_POLITICAL_KEYWORDS)
  const generalPolMatches = countMatches(allText, POLITICAL_KEYWORDS)

  let isPolitical     = generalPolMatches >= 1 && campusPolMatches === 0
  let isCampusPol     = campusPolMatches >= 1

  // If both match but campus context dominates, treat as campus political
  if (generalPolMatches >= 1 && campusPolMatches >= 2 && campusPolMatches >= generalPolMatches) {
    isPolitical  = false
    isCampusPol  = true
  }

  // ── Quality ───────────────────────────────────────────────
  const isEngagementBait = countMatches(allText, ENGAGEMENT_BAIT) >= 1
  const isSpam           = countMatches(allText, SPAM_PATTERNS) >= 1

  let qualityScore = 0.5
  if (['photo', 'carousel', 'video', 'reel'].includes(postType)) qualityScore += 0.10
  const qualityMatches = countMatches(allText, QUALITY_POSITIVE)
  qualityScore += Math.min(0.25, qualityMatches * 0.08)
  if (isEngagementBait) qualityScore -= 0.25
  if (isSpam)           qualityScore -= 0.30
  if (safetyFlag === 'high')   qualityScore -= 0.50
  if (safetyFlag === 'medium') qualityScore -= 0.20

  // Hashtag stuffing penalty
  const hashtagCount = (content.match(/#\w+/g) || []).length + tags.length
  if (hashtagCount > 15) qualityScore -= 0.15

  qualityScore = Math.max(0, Math.min(1, qualityScore))

  // ── Categories ────────────────────────────────────────────
  const categories: string[] = []
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (countMatches(allText, patterns) >= 1) categories.push(category)
  }
  if (communityCategory && !categories.includes(communityCategory)) {
    categories.push(communityCategory)
  }
  if (categories.length === 0) categories.push('Campus Life')

  return {
    categories,
    is_political:        isPolitical,
    is_campus_pol:       isCampusPol,
    safety_flag:         safetyFlag,
    safety_score:        safetyScore,
    quality_score:       qualityScore,
    is_spam:             isSpam,
    is_engagement_bait:  isEngagementBait,
  }
}

export function getCategoryWeight(interactionType: string): number {
  const weights: Record<string, number> = {
    share:          5.0,
    save:           4.5,
    follow_after:   5.0,
    rewatch:        4.0,
    show_more:      3.5,
    comment:        2.5,
    like:           1.5,
    profile_visit:  1.2,
    view:           0.3,
    not_interested: -3.0,
    hide:           -4.0,
    mute:           -5.0,
    block:          -6.0,
    report:         -5.0,
    skip:           -0.8,
  }
  return weights[interactionType] ?? 0
}

export function freshnessScore(createdAt: Date | string, halfLifeHours = 36): number {
  const ageMs    = Date.now() - new Date(createdAt).getTime()
  const ageHours = ageMs / 3_600_000
  return Math.exp(-Math.LN2 * (ageHours / halfLifeHours))
}

export function engagementQualityScore(
  likesCount:    number,
  commentsCount: number,
  savesCount:    number,
  sharesCount:   number,
  viewsCount:    number,
): number {
  const weighted = likesCount * 1 + commentsCount * 2 + savesCount * 4 + sharesCount * 5
  const base     = viewsCount > 0 ? weighted / Math.max(1, viewsCount) : 0
  return Math.min(1, Math.log1p(weighted) / 15 + base * 0.5)
}
