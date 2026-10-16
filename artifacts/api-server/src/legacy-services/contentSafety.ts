/**
 * Blocks abusive, sexually explicit, and harmful language in identity fields.
 * Normalization deliberately removes separators and common character swaps so
 * variants such as "f.u.c.k", "f*ck", and "sh1t" are also detected.
 */
const PROHIBITED_TERMS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'motherfuck', 'fuk', 'fck', 'fk',
  'fcking', 'fking', 'shit', 'bullshit',
  'bitch', 'bitches', 'bastard', 'asshole', 'arsehole', 'ass', 'dick', 'dickhead',
  'cock', 'pussy', 'pssy', 'cunt', 'cnt', 'twat', 'prick', 'douche', 'douchebag', 'slut',
  'whore', 'whores', 'hoe', 'ho', 'skank', 'wanker', 'jerkoff', 'jackass',
  'dipshit', 'dumbass', 'shithead', 'fuckhead', 'asshat', 'asswipe',
  'idiot', 'moron', 'stupid', 'dumb', 'dumbfuck', 'imbecile', 'loser',
  'pathetic', 'worthless', 'scumbag', 'degenerate', 'pieceofshit', 'trash',
  'garbage', 'clown', 'creep', 'creepy', 'weirdo', 'freak', 'coward', 'liar',
  'fraud', 'sonofabitch',
  'madarchod', 'madarchodh', 'madarchd', 'madharchod', 'madharchodh', 'mc', 'bc',
  'behenchod', 'behenchd', 'bhenchod', 'bhenchd', 'bhosdike', 'bhosdika',
  'bhosdi', 'bhosda', 'bhosd', 'chutiya', 'chutiye', 'chutia', 'chutiyapa',
  'chutiyap', 'gandu', 'gaand', 'ganduu', 'gaanduu', 'lavde', 'lavda', 'lund',
  'lodu', 'lawde', 'lauda', 'randi', 'rand', 'harami', 'haraami', 'haramzada',
  'haramzade', 'kamina', 'kamine', 'kameena', 'kutte', 'kutta', 'kutti',
  'bakchod', 'bakchodi', 'bakchd', 'jhantu', 'jhaant', 'jhaatu', 'nalayak',
  'ullu', 'ullukapattha', 'suar', 'suwar', 'bkl', 'bsdk',
  'killyourself', 'kys', 'gokillyourself', 'die', 'youshoulddie', 'iwillkillyou',
  'kill', 'murder', 'shoot', 'stab', 'beat', 'hurt', 'rape', 'iwillrapeyou',
  'rapist', 'molest', 'molester', 'molestation', 'sexualpredator', 'sexpredator',
  'pervert', 'perverted', 'pedo', 'pedophile', 'paedophile', 'childmolester',
  'groomer', 'youareworthless', 'youaredisgusting', 'nobodylikesyou', 'godie',
  'dropdead', 'fuckoff', 'shutthefuckup', 'getlost', 'eatshit', 'suckmydick',
  'suckit', 'kissmyass', 'sex', 'sx', 'sax', 'porn', 'prn',
] as const

const characterSwaps: Record<string, string> = {
  '@': 'a', '4': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '5': 's',
  '$': 's', '7': 't',
  'а': 'a', 'е': 'e', 'і': 'i', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
}

export const USERNAME_BANNED_MESSAGE =
  'This username is not allowed. Abusive, sexually explicit, or harmful usernames may lead to permanent account suspension and further action.'

export const SKILL_BANNED_MESSAGE =
  'This skill is not allowed. Abusive, sexually explicit, or harmful language may lead to permanent account suspension and further action.'

export function normalizeSafetyText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split('')
    .map((character) => characterSwaps[character] || character)
    .join('')
    .replace(/[^a-z0-9]/g, '')
}

const normalizedTerms = [...new Set(PROHIBITED_TERMS.map(normalizeSafetyText))]
const compactTerms = normalizedTerms.filter((term) => term.length >= 4)
const shortTerms = new Set(normalizedTerms.filter((term) => term.length < 4))
const literalObfuscations = ['s1ut', 'p@rn']
const shortTermPatterns = [...shortTerms].map((term) =>
  new RegExp(`(?:^|[^a-z0-9])${term.split('').join('[^a-z0-9]*')}(?=$|[^a-z0-9])`),
)

export function containsProhibitedLanguage(value: unknown): boolean {
  const literal = String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const normalized = normalizeSafetyText(value)
  if (!normalized) return false

  if (literalObfuscations.some((term) => literal.includes(term))) return true
  if (compactTerms.some((term) => normalized.includes(term))) return true
  if (shortTermPatterns.some((pattern) => pattern.test(literal))) return true

  // Two- and three-character terms are only blocked as standalone entries to
  // avoid rejecting unrelated words such as a course or a person's surname.
  return shortTerms.has(normalized)
}