import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

const serviceEntry = new URL('../src/legacy-services/commentModeration.ts', import.meta.url)
let buildDirectory
let moderation

before(async () => {
  buildDirectory = await mkdtemp(join(tmpdir(), 'campnect-comment-moderation-'))
  const bundledService = join(buildDirectory, 'comment-moderation.mjs')
  await build({
    entryPoints: [serviceEntry.pathname],
    outfile: bundledService,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
    plugins: [{
      name: 'isolate-comment-moderation-db',
      setup(buildApi) {
        buildApi.onResolve({ filter: /legacy-db\/index\.js$/ }, () => ({
          path: 'test-moderation-database',
          namespace: 'comment-moderation-test',
        }))
        buildApi.onLoad({ filter: /.*/, namespace: 'comment-moderation-test' }, () => ({
          contents: 'export const db = {}',
          loader: 'js',
        }))
      },
    }],
  })
  moderation = await import(pathToFileURL(bundledService).href)
})

after(async () => {
  if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true })
})

const safePrediction = {
  category: 'SAFE',
  severity: 'NONE',
  confidence: 0.96,
  targeted: false,
  intent: 'Campus event discussion.',
  reason: 'No targeted harm.',
}

function modelReply(classification = safePrediction, status = 200) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(classification) }] } }],
  }), { status, headers: { 'content-type': 'application/json' } })
}

function makeHarness({ predictions = [safePrediction], onFetch, now = 1_800_000_000_000 } = {}) {
  const state = {
    attempts: [],
    comments: [],
    quotas: new Map(),
    fetchRequests: [],
    now,
  }
  let predictionIndex = 0
  let nextTransaction = Promise.resolve()
  const db = {
    async withTransaction(callback) {
      const previousTransaction = nextTransaction
      let finish
      nextTransaction = new Promise((resolve) => { finish = resolve })
      await previousTransaction
      try {
        return await callback({
          async one(sql, params = []) {
            if (sql.includes('pg_advisory_xact_lock')) return { locked: true }
            if (sql.includes('COUNT(*)::int AS attempts')) {
              return {
                attempts: state.attempts.filter(
                  (attempt) => attempt.userId === params[0] && attempt.createdAt > params[1].getTime(),
                ).length,
              }
            }
            if (sql.includes('SELECT EXISTS') && sql.includes('FROM comments c')) {
              const [userId, text, since, exceptId] = params
              return {
                duplicate: state.comments.some(
                  (comment) => comment.userId === userId &&
                    comment.content.toLowerCase().replace(/\s+/g, ' ').trim() === text &&
                    comment.createdAt > since.getTime() &&
                    comment.id !== exceptId,
                ),
              }
            }
            if (sql.includes('SELECT calls FROM moderation_ai_usage')) {
              return state.quotas.get(`${params[0]}:${params[1]}`) ?? null
            }
            throw new Error(`Unexpected moderation DB read: ${sql}`)
          },
          async run(sql, params = []) {
            if (sql.includes('DELETE FROM comment_moderation_rate_attempts')) {
              const cutoff = params[0].getTime()
              state.attempts = state.attempts.filter((attempt) => attempt.createdAt >= cutoff)
              return { rowCount: 0 }
            }
            if (sql.includes('INSERT INTO comment_moderation_rate_attempts')) {
              state.attempts.push({
                id: params[0],
                userId: params[1],
                contentHash: params[2],
                createdAt: params[3].getTime(),
              })
              return { rowCount: 1 }
            }
            if (sql.includes('DELETE FROM moderation_ai_usage')) return { rowCount: 0 }
            if (sql.includes('INSERT INTO moderation_ai_usage')) {
              const key = `${params[0]}:${params[1]}`
              const counter = state.quotas.get(key) ?? { calls: 0 }
              state.quotas.set(key, { calls: counter.calls + 1 })
              return { rowCount: 1 }
            }
            throw new Error(`Unexpected moderation DB write: ${sql}`)
          },
        })
      } finally {
        finish()
      }
    },
  }
  const fetchImpl = async (url, init = {}) => {
    const record = { url, init, body: JSON.parse(init.body) }
    state.fetchRequests.push(record)
    if (onFetch) return onFetch(record, state)
    const prediction = predictions[Math.min(predictionIndex++, predictions.length - 1)]
    return modelReply(prediction)
  }
  const moderator = moderation.createCommentModerator({
    db,
    fetchImpl,
    now: () => state.now,
    env: {
      MODERATION_AI_ENABLED: 'true',
      GEMINI_FREE_TIER_CONFIRMED: 'true',
      GEMINI_API_KEY: 'test-only-key',
    },
  })
  return { state, moderator, db, fetchImpl }
}

const comment = (text, userId = 'student-1', context = 'A public campus discussion.') => ({
  text,
  context,
  userId,
})

test('allows the awareness, prevention, survivor-support and safety discussions in the specs without Gemini', async () => {
  const { state, db, fetchImpl } = makeHarness()
  const moderator = moderation.createCommentModerator({
    db, fetchImpl, now: () => state.now,
    env: { MODERATION_AI_ENABLED: 'false' },
  })
  const examples = [
    'We need more awareness about rape on college campuses.',
    'Rape victims deserve support and justice.',
    'This documentary discusses sexual violence.',
    'How can colleges better prevent sexual harassment?',
    'Suicide prevention resources should be easier to find.',
    'Campus sexual harassment awareness week starts Monday.',
    'Students should report sexual violence through official channels.',
    'Bullying can seriously affect students.',
    'Violence against students is a serious issue.',
    'Students should be able to report bullying safely.',
    'Our campus needs better mental-health support.',
    'The university should investigate allegations properly.',
  ]
  for (const [index, text] of examples.entries()) {
    const result = await moderator.evaluateComment(comment(text, `sensitive-${index}`))
    assert.equal(result.decision, 'ALLOW', text)
    assert.equal(result.category, 'SAFE', text)
    assert.equal(result.source, 'local', text)
    assert.equal(result.requiresConfirmation, false, text)
  }
  assert.equal(state.fetchRequests.length, 0)
})

test('awareness wording cannot bypass Gemini analysis of an independently harmful clause', async () => {
  const { moderator, state } = makeHarness({
    predictions: [{
      category: 'HATE_VIOLENCE', severity: 'HIGH', confidence: 0.99,
      targeted: true, intent: 'Incites violence against a targeted group.',
      reason: 'A separate clause encourages targeted violence.',
    }],
  })
  const result = await moderator.evaluateComment(comment(
    'Campus awareness about rape is important. Assault every member of that group here.',
  ))
  assert.equal(state.fetchRequests.length, 1)
  assert.equal(result.decision, 'BLOCK')
  assert.equal(result.category, 'HATE_VIOLENCE')
})

test('blocks direct physical and sexual-violence threats without turning them into account sanctions', () => {
  const examples = [
    ['I am going to hurt you.', 'HIGH'],
    ["I'm going to rape you.", 'CRITICAL'],
    ["I'll rape you.", 'CRITICAL'],
    ["I’d rape you.", 'CRITICAL'],
    ["I'mgoingtorapeyou.", 'CRITICAL'],
    ['I will rape you.', 'CRITICAL'],
    ['I hope someone rapes you.', 'CRITICAL'],
    ['I hope you get raped.', 'CRITICAL'],
    ["I'll kill you.", 'HIGH'],
    ["I’d kill you.", 'HIGH'],
    ['I will kill you.', 'HIGH'],
    ["I'll publish your address if you don't do what I say.", 'HIGH'],
    ["Give me your address or you'll regret it.", 'HIGH'],
    ["Send her private photos or I'll hurt her.", 'HIGH'],
  ]
  for (const [text, severity] of examples) {
    const result = moderation.classifyCommentLocally(text)
    assert.equal(result.decision, 'BLOCK', text)
    assert.equal(result.severity, severity, text)
    assert.equal(result.targeted, true, text)
    assert.equal(result.requiresConfirmation, false, text)
    assert.equal(result.requiresHumanReview, false, text)
  }
  assert.equal(moderation.classifyCommentLocally('I will dox you.').category, 'DOXXING')
  assert.equal(
    moderation.classifyCommentLocally('Send me nudes of a 15-year-old student.').category,
    'CHILD_SEXUAL_EXPLOITATION',
  )
  assert.equal(
    moderation.classifyCommentLocally('Send me nudes of a 15-year-old student.').severity,
    'CRITICAL',
  )
})

test('blocks direct self-harm encouragement, while leaving supportive wording alone', () => {
  assert.equal(moderation.classifyCommentLocally('Kill yourself.').decision, 'BLOCK')
  assert.equal(moderation.classifyCommentLocally('I hope you die.').decision, 'BLOCK')
  assert.equal(moderation.classifyCommentLocally('ki11 y0urself').decision, 'BLOCK')
  const protectedStatement = moderation.classifyCommentLocally(
    'We need better suicide prevention resources on campus.',
  )
  assert.equal(protectedStatement.decision, 'ALLOW')
  assert.equal(protectedStatement.category, 'SAFE')
})

test('evaluates independent clauses so protective language and a negated phrase cannot mask another threat', () => {
  const mixedThreats = [
    "Please don't kill yourself. Awareness resources are available, and I'll kill you.",
    "We need suicide prevention resources; I'm going to rape you.",
    "Our sexual-violence awareness event is today. I'm going to rape you.",
    "Awareness matters: I'mgoingtorapeyou.",
    "Please don't kill yourself, awareness plus I'm going to rape you.",
    "Someone wrote “kill yourself.” I'll kill you.",
  ]
  for (const text of mixedThreats) {
    const result = moderation.classifyCommentLocally(text)
    assert.equal(result.decision, 'BLOCK', text)
    assert.ok(
      result.category === 'PHYSICAL_VIOLENCE_THREAT' ||
      result.category === 'SEXUAL_VIOLENCE_THREAT',
      text,
    )
  }

  assert.equal(
    moderation.classifyCommentLocally("Please don't kill yourself; campus support resources are available.").decision,
    'ALLOW',
  )
  assert.equal(
    moderation.classifyCommentLocally("Please don't kill yourself.").decision,
    'ALLOW',
  )
})

test('protective context does not bypass address extortion or sexual-image requests', () => {
  for (const text of [
    "Give me your address or you'll regret it.",
    'Give meyouraddress oryoullregretit.',
    "Send me her private photos or I'll hurt her.",
    "SendmeherprivatephotosorI'llhurt her.",
  ]) {
    assert.equal(moderation.classifyCommentLocally(text).decision, 'BLOCK', text)
  }

  const framedSolicitation = moderation.classifyCommentLocally(
    'Campus awareness starts today: send me your nudes.',
  )
  assert.equal(framedSolicitation.decision, 'WARN')
  assert.equal(framedSolicitation.category, 'SEXUAL_HARASSMENT')
  assert.equal(
    moderation.classifyCommentLocally('Awareness training reminds us: do not send me nudes.').decision,
    'ALLOW',
  )
})

test('routes quoted or reported threats to human review instead of treating them as direct threats', () => {
  const quote = moderation.classifyCommentLocally(
    'Someone wrote “kill yourself” at our school. Reporting that incident is important.',
  )
  assert.equal(quote.decision, 'HUMAN_REVIEW')
  assert.equal(quote.category, 'SELF_HARM_ENCOURAGEMENT')
  assert.equal(quote.requiresHumanReview, true)
  assert.equal(quote.requiresConfirmation, false)
})

test('lets Gemini resolve quoted threats with context while keeping independent direct threats blocked', async () => {
  const { moderator, state } = makeHarness()
  const quoted = await moderator.evaluateComment(
    comment('Someone wrote “kill yourself” at our school. Reporting that incident matters.'),
  )
  assert.equal(quoted.source, 'gemini')
  assert.equal(quoted.decision, 'ALLOW')
  assert.equal(state.fetchRequests.length, 1)

  const mixed = await moderator.evaluateComment(
    comment('Someone wrote “kill yourself” at our school. I will kill you.'),
  )
  assert.equal(mixed.source, 'local')
  assert.equal(mixed.decision, 'BLOCK')
  assert.equal(state.fetchRequests.length, 1)
})

test('warns about mild targeted insults and targeted sexual requests; neither is a permanent ban', () => {
  const insult = moderation.classifyCommentLocally("You're an idiot.")
  assert.equal(insult.decision, 'WARN')
  assert.equal(insult.severity, 'MEDIUM')
  assert.equal(insult.requiresConfirmation, true)
  assert.equal(insult.requiresHumanReview, false)

  const solicitation = moderation.classifyCommentLocally('Send me your nudes.')
  assert.equal(solicitation.decision, 'WARN')
  assert.equal(solicitation.category, 'SEXUAL_HARASSMENT')
  assert.equal(solicitation.requiresConfirmation, true)
})

test('rejects separately detected link, mention and repetition spam', async () => {
  const { moderator } = makeHarness()
  const examples = [
    'Visit https://a.invalid https://b.invalid https://c.invalid',
    '@one @two @three @four @five @six @seven @eight read this',
    `${'x'.repeat(35)}`,
  ]
  for (const [index, text] of examples.entries()) {
    const result = await moderator.evaluateComment(comment(text, `spam-${index}`))
    assert.equal(result.decision, 'BLOCK', text.slice(0, 60))
    assert.equal(result.category, 'SPAM')
    assert.equal(result.source, 'local')
  }
})

test('limits rapid submissions per user and prevents recent duplicate comments across posts', async () => {
  const { moderator, state } = makeHarness()
  for (let index = 0; index < 6; index += 1) {
    const result = await moderator.evaluateComment(
      comment(`My separate campus discussion number ${index} is thoughtful.`, 'repeat-user'),
    )
    assert.notEqual(result.category, 'SPAM', `unexpected early rate rejection ${index}`)
  }
  const limited = await moderator.evaluateComment(comment('A seventh unique comment to test rate limiting.', 'repeat-user'))
  assert.equal(limited.decision, 'BLOCK')
  assert.equal(limited.category, 'SPAM')
  assert.match(limited.reason, /wait a moment/)

  state.comments.push({
    id: 'posted-comment',
    userId: 'duplicate-user',
    content: 'A substantial already-posted campus update with sufficient length.',
    createdAt: state.now - 60_000,
  })
  const duplicate = await moderator.evaluateComment(
    comment('A substantial already-posted campus update with sufficient length.', 'duplicate-user'),
  )
  assert.equal(duplicate.category, 'SPAM')
  assert.equal(duplicate.decision, 'BLOCK')
  assert.match(duplicate.reason, /already posted/)
})

test('a current edited comment is excluded from the duplicate-post check', async () => {
  const { moderator, state } = makeHarness()
  state.comments.push({
    id: 'comment-being-edited',
    userId: 'edit-user',
    content: 'An existing campus comment long enough to pass duplicate comparison.',
    createdAt: state.now - 60_000,
  })
  const result = await moderator.evaluateComment(
    comment('An existing campus comment long enough to pass duplicate comparison.', 'edit-user'),
    { excludeCommentId: 'comment-being-edited' },
  )
  assert.equal(result.decision, 'ALLOW')
  assert.equal(result.category, 'SAFE')
})

test('uses only the allowlisted Flash-Lite model and returns parsed contextual warnings', async () => {
  const { moderator, state } = makeHarness({
    predictions: [{
      category: 'LOW_LEVEL_HARASSMENT',
      severity: 'MEDIUM',
      confidence: 0.87,
      targeted: true,
      intent: 'Personal insult.',
      reason: 'This may come across as hostile.',
    }],
  })
  const result = await moderator.evaluateComment(comment('A student called someone their rival after a game.'))
  assert.equal(result.decision, 'WARN')
  assert.equal(result.category, 'LOW_LEVEL_HARASSMENT')
  assert.equal(result.source, 'gemini')
  assert.equal(result.requiresConfirmation, true)
  assert.equal(result.requiresHumanReview, false)
  assert.match(state.fetchRequests[0].url, /models\/gemini-2\.5-flash-lite:generateContent$/)
  assert.equal(state.fetchRequests[0].init.headers['x-goog-api-key'], 'test-only-key')
  assert.equal(new URL(state.fetchRequests[0].url).search, '')
})

test('a severe-category model result can never be overridden with its own claimed ALLOW decision', () => {
  const prediction = {
    category: 'PHYSICAL_VIOLENCE_THREAT',
    severity: 'HIGH',
    confidence: 0.99,
    targeted: true,
    intent: 'Threat.',
    reason: 'Threat.',
    decision: 'ALLOW',
    permanentlyBanUser: true,
  }
  const result = moderation.applyModelPolicy(moderation.parseModelClassification(JSON.stringify(prediction)))
  assert.equal(result.decision, 'BLOCK')
  assert.equal(result.category, 'PHYSICAL_VIOLENCE_THREAT')
  assert.equal(result.requiresHumanReview, false)
  assert.equal(result.permanentlyBanUser, undefined)
})

test('ambiguous HIGH and all CRITICAL model results require review without an override button', async () => {
  const predictions = [
    {
      category: 'DOXXING', severity: 'HIGH', confidence: 0.68, targeted: true,
      intent: 'Unclear context.', reason: 'Unclear.',
    },
    {
      category: 'CHILD_SEXUAL_EXPLOITATION', severity: 'CRITICAL', confidence: 0.99, targeted: true,
      intent: 'Uncertain.', reason: 'Uncertain.',
    },
  ]
  const { moderator } = makeHarness({ predictions })
  const ambiguous = await moderator.evaluateComment(comment('Campus meeting updates will be posted after the event.', 'review-1'))
  const critical = await moderator.evaluateComment(comment('Club meeting notes are available after the event.', 'review-2'))
  for (const result of [ambiguous, critical]) {
    assert.equal(result.decision, 'HUMAN_REVIEW')
    assert.equal(result.requiresHumanReview, true)
    assert.equal(result.requiresConfirmation, false)
  }
  assert.equal(critical.severity, 'CRITICAL')
})

test('rejects malformed and out-of-range model responses instead of trusting them', () => {
  assert.equal(moderation.parseModelClassification('not JSON'), null)
  assert.equal(moderation.parseModelClassification(JSON.stringify({
    category: 'SAFE', severity: 'NONE', confidence: 1.5, targeted: false, intent: '', reason: '',
  })), null)
  assert.equal(moderation.parseModelClassification(JSON.stringify({
    category: 'invented', severity: 'NONE', confidence: 0.9, targeted: false, intent: '', reason: '',
  })), null)
  assert.equal(moderation.parseModelClassification(JSON.stringify({
    category: 'SAFE', severity: 'NONE', confidence: 0.9, targeted: false,
    intent: 'x'.repeat(241), reason: '',
  })), null)
})

test('does not send email, phone, IP, street address, credentials, URLs, username or account ID to Gemini', async () => {
  const { moderator, state } = makeHarness()
  const result = await moderator.evaluateComment({
    userId: 'private-account-identifier',
    context: 'Public campus event discussion for student clubs.',
    text: 'Contact jane.doe@example.com or 415-555-0123 at 42 Campus Lane. https://campus.invalid/path Password=topsecret. Authorization: Bearer abcdefghijklmnop.qrstuvwxyz0123456789. eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fw Google API key: AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456789 Password is hiddenhunter22',
  })
  assert.equal(result.decision, 'ALLOW')
  assert.equal(state.fetchRequests.length, 1)
  const request = state.fetchRequests[0]
  const serialized = JSON.stringify(request.body)
  for (const privateText of [
    'jane.doe@example.com',
    '415-555-0123',
    '42 Campus Lane',
    'https://campus.invalid/path',
    'topsecret',
    'abcdefghijklmnop.qrstuvwxyz0123456789',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fw',
    'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456789',
    'hiddenhunter22',
    'private-account-identifier',
  ]) {
    assert.equal(serialized.includes(privateText), false, `sent private value: ${privateText}`)
  }
  assert.equal(serialized.includes('[REDACTED_EMAIL]'), true)
  assert.equal(serialized.includes('[REDACTED_PHONE]'), true)
  assert.equal(serialized.includes('[REDACTED_ADDRESS]'), true)
  assert.equal(serialized.includes('[REDACTED_CREDENTIAL]'), true)

  const mentioned = await moderator.evaluateComment(
    comment('@UniversityHandle Please check our club meeting times.', 'pii-user'),
  )
  assert.equal(mentioned.source, 'gemini')
  assert.equal(
    state.fetchRequests.at(-1).body.contents[0].parts[0].text.includes('@UniversityHandle'),
    false,
  )
})

test('caches safe classification results briefly, scoped per account, without sending account IDs', async () => {
  const { moderator, state } = makeHarness()
  const text = 'The student organization updated their annual campus event schedule.'
  const first = await moderator.evaluateComment(comment(text, 'cache-user-1'))
  const second = await moderator.evaluateComment(comment(text, 'cache-user-2'))
  const third = await moderator.evaluateComment(comment(text, 'cache-user-1'))
  assert.equal(first.source, 'gemini')
  assert.equal(second.source, 'gemini')
  assert.equal(third.source, 'gemini')
  assert.equal(state.fetchRequests.length, 2)
  assert.equal(state.attempts.length, 3)
  const serialized = JSON.stringify(state.fetchRequests)
  assert.equal(serialized.includes('cache-user-1'), false)
  assert.equal(serialized.includes('cache-user-2'), false)
})

test('exhausts the configured daily quota without calling Gemini again', async () => {
  const quotaHarness = makeHarness({ predictions: [safePrediction] })
  const envLimited = moderation.createCommentModerator({
    db: quotaHarness.db,
    fetchImpl: quotaHarness.fetchImpl,
    env: {
      MODERATION_AI_ENABLED: 'true',
      GEMINI_FREE_TIER_CONFIRMED: 'true',
      GEMINI_API_KEY: 'test-only-key',
      MODERATION_AI_DAILY_LIMIT: '1',
    },
    now: () => 1_800_000_000_000,
  })

  assert.equal((await envLimited.evaluateComment(comment('Campus clubs announced the updated event schedule.', 'daily-1'))).source, 'gemini')
  assert.equal((await envLimited.evaluateComment(comment('The student volunteer committee will meet after class.', 'daily-2'))).source, 'local')
  assert.equal(quotaHarness.state.fetchRequests.length, 1)
})

test('reserves model quota atomically when separate accounts submit simultaneously', async () => {
  const h = makeHarness()
  const limited = moderation.createCommentModerator({
    db: h.db,
    fetchImpl: h.fetchImpl,
    now: () => h.state.now,
    env: {
      MODERATION_AI_ENABLED: 'true',
      GEMINI_FREE_TIER_CONFIRMED: 'true',
      GEMINI_API_KEY: 'test-only-key',
      MODERATION_AI_DAILY_LIMIT: '2',
    },
  })
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    limited.evaluateComment(comment(
      `Campus society number ${index} shared the latest annual student event details.`,
      `quota-user-${index}`,
    )),
  ))
  assert.equal(results.filter((result) => result.source === 'gemini').length, 2)
  assert.equal(results.filter((result) => result.source === 'local').length, 6)
  assert.equal(h.state.fetchRequests.length, 2)
})

test('fails open to conservative local moderation when Gemini is unavailable or exhausts its free quota', async () => {
  const { moderator, state } = makeHarness({
    onFetch: async () => { throw new Error('test-only model outage') },
  })
  const safeText = 'The student society will discuss the campus cleanup schedule.'
  const first = await moderator.evaluateComment(comment(safeText, 'offline-1'))
  assert.equal(first.decision, 'ALLOW')
  assert.equal(first.source, 'local')
  const circuitBroken = await moderator.evaluateComment(
    comment('Student clubs will share their accessible event schedule soon.', 'offline-2'),
  )
  assert.equal(circuitBroken.source, 'local')
  assert.equal(state.fetchRequests.length, 1)
})

test('opens the circuit on free-quota responses without retrying or falling through to a paid model', async () => {
  const h = makeHarness({ onFetch: async () => new Response('{}', { status: 429 }) })
  const first = await h.moderator.evaluateComment(
    comment('A campus volunteer group shared its meeting schedule.', 'quota-down-1'),
  )
  const second = await h.moderator.evaluateComment(
    comment('Student volunteers organized a community cleanup.', 'quota-down-2'),
  )
  assert.equal(first.source, 'local')
  assert.equal(second.source, 'local')
  assert.equal(h.state.fetchRequests.length, 1)
})

test('never calls Gemini until server-side free-tier activation, confirmation, and secret are all present', async () => {
  const incompleteConfigurations = [
    { MODERATION_AI_ENABLED: 'false', GEMINI_FREE_TIER_CONFIRMED: 'true', GEMINI_API_KEY: 'test' },
    { MODERATION_AI_ENABLED: 'true', GEMINI_FREE_TIER_CONFIRMED: 'false', GEMINI_API_KEY: 'test' },
    { MODERATION_AI_ENABLED: 'true', GEMINI_FREE_TIER_CONFIRMED: 'true' },
  ]
  for (const [index, missingConfiguration] of incompleteConfigurations.entries()) {
    const h = makeHarness()
    const safeText = 'The campus club has updated its summer meeting schedule.'
    const moderatorWithoutAI = moderation.createCommentModerator({
      db: h.db,
      fetchImpl: h.fetchImpl,
      now: () => h.state.now,
      env: missingConfiguration,
    })
    const result = await moderatorWithoutAI.evaluateComment(comment(safeText, `missing-user-${index}`))
    assert.equal(result.source, 'local')
    assert.equal(h.state.fetchRequests.length, 0)
  }
})

test('does not let zero, invalid, or excessive environment quotas increase the free-tier safety caps', () => {
  assert.deepEqual(
    moderation.getCommentModerationConfiguration({}).limits,
    { minute: 5, daily: 20, monthly: 500 },
  )
  assert.deepEqual(moderation.getCommentModerationConfiguration({
    MODERATION_AI_DAILY_LIMIT: '0',
    MODERATION_AI_MONTHLY_LIMIT: '900000',
    MODERATION_AI_PER_MINUTE_LIMIT: 'invalid',
  }).limits, { minute: 0, daily: 0, monthly: 500 })
  const safeConfiguration = moderation.getCommentModerationConfiguration({
    GEMINI_API_KEY: 'do-not-expose',
  })
  assert.equal(safeConfiguration.apiKeyConfigured, true)
  assert.equal(JSON.stringify(safeConfiguration).includes('do-not-expose'), false)
})
