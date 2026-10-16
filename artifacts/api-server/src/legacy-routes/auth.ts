// @ts-nocheck
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import crypto from 'crypto'
import { db, withTransaction } from '../legacy-db/index.js'
import { signToken, signRefreshToken, verifyToken, requireAuth, JWT_SECRET } from '../legacy-middleware/auth.js'
import { permissionsForRole } from '../legacy-services/adminSecurity.js'
import { sendOTPEmail, sendLoginAlert } from '../legacy-services/email.js'
import { isCollegeEmail, getCollegeNameByEmail, getCollegeDomain } from '../legacy-utils/college-domains.js'
import { isDisposableEmail } from '../legacy-utils/disposable-emails.js'
import { uploadVerify, assertImageMagic, sendMediaPolicyError } from '../legacy-middleware/upload.js'
import { storeMediaAsset } from '../legacy-services/media.js'
import { AUTH_USER_COLUMNS, selfUser, withCanonicalCollegeName, withViewerMediaUrls } from '../legacy-services/userPrivacy.js'

export const authRouter = Router()

type SessionLocation = { city: string; region: string; country: string }
const locationCache = new Map<string, { expiresAt: number; value: SessionLocation | null }>()

function getClientIp(req: any): string {
  // Express resolves req.ip using the bounded trust-proxy policy in app.ts.
  // Never parse the left-most client-supplied forwarding header directly.
  return String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '').trim()
}

function loginPlatform(userAgent = '') {
  const ua = userAgent.toLowerCase()
  if (/android|iphone|ipad|ipod|mobile/.test(ua)) return /android/.test(ua) ? 'android' : 'ios'
  return 'web'
}

async function recordLoginHistory(input: {
  userId?: string | null
  identifier: string
  success: boolean
  req: any
  failureReason?: string
}) {
  if (!input.userId) return
  await db.run(
    `INSERT INTO auth_login_history
      (id, user_id, identifier, success, device_info, ip_address, platform, failure_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      uuidv4(),
      input.userId,
      input.identifier.slice(0, 320),
      input.success ? 1 : 0,
      String(input.req.headers['user-agent'] || '').slice(0, 500),
      getClientIp(input.req),
      loginPlatform(String(input.req.headers['user-agent'] || '')),
      String(input.failureReason || '').slice(0, 500),
    ],
  )
}

function isPrivateIp(ip: string): boolean {
  return !ip || ip === '::1' || ip === '127.0.0.1' || ip === 'localhost'
    || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    || ip.startsWith('fc') || ip.startsWith('fd')
}

function identifyDevice(userAgent = '') {
  const ua = userAgent.toLowerCase()
  const device = /ipad|tablet/.test(ua) ? 'Tablet' : /mobile|android|iphone|ipod/.test(ua) ? 'Phone' : 'Computer'
  const browser = /edg\//.test(ua) ? 'Edge' : /chrome\//.test(ua) ? 'Chrome' : /firefox\//.test(ua) ? 'Firefox' : /safari\//.test(ua) && !/chrome\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iphone|ipad|ipod/.test(ua) ? 'iOS' : /android/.test(ua) ? 'Android' : /windows/.test(ua) ? 'Windows' : /mac os/.test(ua) ? 'macOS' : /linux/.test(ua) ? 'Linux' : ''
  return { device, browser, os }
}

async function lookupSessionLocation(ip: string): Promise<SessionLocation | null> {
  if (isPrivateIp(ip)) return null
  const cached = locationCache.get(ip)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  let value: SessionLocation | null = null
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(1800) })
    if (response.ok) {
      const data = await response.json() as any
      if (data?.city || data?.country_name) {
        value = { city: data.city || '', region: data.region || '', country: data.country_name || data.country || '' }
      }
    }
  } catch { /* Location is supplemental; sessions still render without it. */ }
  locationCache.set(ip, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, value })
  return value
}

function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString()
}
async function safeUser(user: any) {
  const canonicalUser = await withCanonicalCollegeName(user)
  return withViewerMediaUrls(selfUser(canonicalUser), canonicalUser?.id)
}
function buildUserPayload(user: any) {
  const isAdmin = Boolean(user.is_admin)
  const role = isAdmin ? String(user.admin_role || 'owner') : 'user'
  return {
    userId: user.id,
    email: user.email,
    username: user.username,
    isAdmin,
    role,
    permissions: isAdmin ? permissionsForRole(role) : [],
  }
}

function isPlayReviewerAccount(user: any) {
  const configuredEmail = String(process.env.PLAY_REVIEWER_EMAIL || '').trim().toLowerCase()
  return Boolean(
    configuredEmail
    && user?.id === 'play-reviewer-account'
    && String(user?.email || '').trim().toLowerCase() === configuredEmail,
  )
}

function isPasswordOnlyTesterAccount(user: any) {
  const testerNumber = /^(?:[1-9]|1[0-6])$/
  const idMatch = String(user?.id || '').match(/^play-tester-(.+)$/)
  const usernameMatch = String(user?.username || '').match(/^test(.+)$/i)
  const emailMatch = String(user?.email || '').toLowerCase().match(/^test(.+)@campnect\.test$/)
  return Boolean(
    user?.account_type === 'tester'
    && idMatch?.[1]
    && idMatch[1] === usernameMatch?.[1]
    && idMatch[1] === emailMatch?.[1]
    && testerNumber.test(idMatch[1]),
  )
}

/**
 * Lock and consume the newest usable OTP as one transaction operation.  The
 * attempt is counted before comparing the submitted value, so there are
 * exactly five total guesses (including a correct fifth guess).  Callers must
 * keep any privileged follow-up writes in the same transaction.
 */
async function consumeOtp(tx: any, email: string, type: 'verify' | 'login' | 'reset', submittedOtp: string) {
  const record = await tx.one<any>(
    `SELECT id, otp, attempts
     FROM otps
     WHERE email = $1 AND type = $2 AND used = 0
       AND expires_at > NOW() AND attempts < 5
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [email, type],
  )
  if (!record) return null

  const attempted = await tx.run(
    'UPDATE otps SET attempts = attempts + 1 WHERE id = $1 AND used = 0 AND attempts < 5',
    [record.id],
  )
  if (attempted.rowCount !== 1 || record.otp !== submittedOtp) return null

  const consumed = await tx.run('UPDATE otps SET used = 1 WHERE id = $1 AND used = 0', [record.id])
  return consumed.rowCount === 1 ? record : null
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────
const signupSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(100),
  full_name: z.string().min(2).max(50).trim(),
  user_role: z.enum(['student', 'teacher', 'faculty']).default('student'),
  college_id: z.string().max(120).optional(),
  policy_accepted: z.boolean().optional(),
})

const SIGNUP_CAMPUS_ALIASES: Record<string, { domain: string; city: string }> = {
  'gla-mathura': { domain: 'gla.ac.in', city: 'mathura' },
  'gla-noida': { domain: 'gla.ac.in', city: 'noida' },
}

async function resolveSignupCollege(collegeId: string | undefined, domain: string) {
  if (!collegeId) {
    return db.one<any>('SELECT id, name FROM colleges WHERE domains LIKE $1 ORDER BY id LIMIT 1', [`%"${domain}"%`])
  }

  const exact = await db.one<any>(
    'SELECT id, name FROM colleges WHERE id = $1 AND domains LIKE $2',
    [collegeId, `%"${domain}"%`],
  )
  if (exact) return exact

  const alias = SIGNUP_CAMPUS_ALIASES[collegeId]
  if (!alias || alias.domain !== domain) return null

  return db.one<any>(
    `SELECT id, name
     FROM colleges
     WHERE domains LIKE $1
       AND LOWER(COALESCE(city, '')) LIKE $2
     ORDER BY id
     LIMIT 1`,
    [`%"${domain}"%`, `%${alias.city}%`],
  )
}

function signupUsername(fullName: string, userId: string): string {
  const base = fullName
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20) || 'student'
  return `${base}${userId.replace(/-/g, '').slice(0, 8)}`.slice(0, 30)
}

authRouter.post('/signup', async (req, res) => {
  try {
    const parsed = signupSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    const { email, password, full_name, user_role, college_id, policy_accepted } = parsed.data
    if (policy_accepted !== true) return res.status(400).json({ success: false, error: 'You must accept the Terms and policies to create an account.' })

    if (isDisposableEmail(email)) return res.status(400).json({ success: false, error: 'Disposable email addresses are not allowed. Please use your college email.' })
    if (!isCollegeEmail(email)) return res.status(400).json({ success: false, error: 'Only college/university email addresses are accepted. Please use your .edu or institutional email.' })

    const existing = await db.one('SELECT id FROM users WHERE email = $1', [email])
    if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists.' })

    const domain = getCollegeDomain(email)
    const college = await resolveSignupCollege(college_id, domain)
    if (college_id && !college) {
      return res.status(400).json({ success: false, error: 'The selected campus does not match this college email domain.' })
    }
    const collegeName = college?.name || getCollegeNameByEmail(email) || ''

    const password_hash = await bcrypt.hash(password, 12)
    const userId = uuidv4()
    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const pendingExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const otpId = uuidv4()

    await withTransaction(async (tx) => {
      await tx.run('DELETE FROM pending_signups WHERE expires_at <= NOW()')
      await tx.run(
        `INSERT INTO pending_signups
          (email, user_id, password_hash, full_name, college_id, college_name, user_role, expires_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (email) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           college_id = EXCLUDED.college_id,
           college_name = EXCLUDED.college_name,
           user_role = EXCLUDED.user_role,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()`,
        [email, userId, password_hash, full_name, college?.id || null, collegeName, user_role, pendingExpiresAt],
      )
      await tx.run('DELETE FROM otps WHERE email = $1 AND type = $2', [email, 'verify'])
      await tx.run(
        'INSERT INTO otps (id, email, otp, type, expires_at) VALUES ($1,$2,$3,$4,$5)',
        [otpId, email, otp, 'verify', expiresAt],
      )
    })
    try {
      await sendOTPEmail(email, otp, 'verify')
    } catch (error) {
      await db.run('DELETE FROM otps WHERE id = $1', [otpId]).catch(() => {})
      console.error('signup OTP email error:', (error as Error).message)
      return res.status(503).json({
        success: false,
        error: 'We couldn’t send your verification code. Please try again in a moment.',
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
      })
    }

    res.status(201).json({ success: true, message: 'Check your email for a verification code.', data: { userId, email, collegeName } })
  } catch (err: any) {
    console.error('signup error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Verify Email ─────────────────────────────────────────────────────────────
authRouter.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body
    if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP are required.' })

    const result = await withTransaction(async (tx) => {
      if (!await consumeOtp(tx, email.toLowerCase(), 'verify', String(otp))) return null
      const normalizedEmail = email.toLowerCase()
      const pending = await tx.one<any>(
        `SELECT * FROM pending_signups
         WHERE email = $1 AND expires_at > NOW()
         FOR UPDATE`,
        [normalizedEmail],
      )
      if (!pending) {
        const legacyUser = await tx.one<any>(
          `UPDATE users
           SET is_email_verified = 1
           WHERE email = $1 AND is_email_verified = 0
           RETURNING ${AUTH_USER_COLUMNS}`,
          [normalizedEmail],
        )
        if (!legacyUser) return null
        const token = signToken(buildUserPayload(legacyUser))
        const refreshToken = signRefreshToken(legacyUser.id)
        await tx.run(
          'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
          [uuidv4(), legacyUser.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()],
        )
        return { user: legacyUser, token, refreshToken }
      }
      const existing = await tx.one<any>('SELECT id FROM users WHERE email = $1', [normalizedEmail])
      if (existing) throw new Error('Verified signup email already exists')
      const username = signupUsername(pending.full_name, pending.user_id)
      const user = await tx.one<any>(
        `INSERT INTO users
          (id, email, password_hash, username, full_name, college_id, college_name, user_role, is_email_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
         RETURNING ${AUTH_USER_COLUMNS}`,
        [
          pending.user_id,
          normalizedEmail,
          pending.password_hash,
          username,
          pending.full_name,
          pending.college_id,
          pending.college_name,
          pending.user_role,
        ],
      )
      await tx.run('DELETE FROM pending_signups WHERE email = $1', [normalizedEmail])
      const token = signToken(buildUserPayload(user))
      const refreshToken = signRefreshToken(user.id)
      await tx.run(
        'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
        [uuidv4(), user.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()],
      )
      return { user, token, refreshToken }
    })
    if (!result) return res.status(400).json({ success: false, error: 'That verification code is invalid or expired.' })

    res.json({ success: true, message: 'Email verified!', data: { token: result.token, refreshToken: result.refreshToken, user: await safeUser(result.user) } })
  } catch (err: any) {
    console.error('verify-email error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Resend OTP ───────────────────────────────────────────────────────────────
authRouter.post('/resend-otp', async (req, res) => {
  try {
    const { email, type = 'verify' } = req.body
    if (!email) return res.status(400).json({ success: false, error: 'Email is required.' })
    if (!['verify', 'login', 'reset'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid verification code type.' })
    }
    const normalizedEmail = email.toLowerCase().trim()

    if (type === 'verify') {
      const pending = await db.one<any>(
        'SELECT email FROM pending_signups WHERE email = $1 AND expires_at > NOW()',
        [normalizedEmail],
      )
      const legacyUser = pending ? null : await db.one<any>(
        'SELECT email FROM users WHERE email = $1 AND is_email_verified = 0',
        [normalizedEmail],
      )
      if (!pending && !legacyUser) {
        return res.status(404).json({ success: false, error: 'This signup has expired. Please register again.' })
      }
    }
    if (type === 'login') {
      const user = await db.one<any>(
        'SELECT id FROM users WHERE email = $1 AND is_email_verified = 1',
        [normalizedEmail],
      )
      if (!user) {
        return res.status(404).json({ success: false, error: 'No verified account was found for this login.' })
      }
    }

    const recentOtp = await db.one<any>(
      'SELECT created_at FROM otps WHERE email = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1',
      [normalizedEmail, type]
    )
    if (recentOtp) {
      const elapsed = Date.now() - new Date(recentOtp.created_at).getTime()
      if (elapsed < 60000) return res.status(429).json({ success: false, error: 'Please wait 60 seconds before requesting a new code.' })
    }

    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const otpId = uuidv4()
    await db.run('INSERT INTO otps (id, email, otp, type, expires_at) VALUES ($1,$2,$3,$4,$5)', [otpId, normalizedEmail, otp, type, expiresAt])
    try {
      await sendOTPEmail(normalizedEmail, otp, type === 'verify' || type === 'login' ? type : 'reset')
      await db.run('DELETE FROM otps WHERE email = $1 AND type = $2 AND id != $3', [normalizedEmail, type, otpId])
    } catch (error) {
      // Keep the previously delivered code usable when the mail provider
      // rejects a resend instead of replacing it with an undelivered code.
      await db.run('DELETE FROM otps WHERE id = $1', [otpId]).catch(() => {})
      console.error('resend OTP email error:', (error as Error).message)
      return res.status(503).json({
        success: false,
        error: 'We couldn’t send your verification code. Please try again in a moment.',
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
      })
    }

    res.json({ success: true, message: 'New verification code sent.' })
  } catch (err: any) {
    console.error('resend OTP error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Login ────────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(320).optional(),
  email: z.string().trim().min(1).max(320).optional(),
  password: z.string().min(1),
}).refine((data) => Boolean(data.identifier || data.email), {
  message: 'Email or @username is required',
  path: ['identifier'],
})

function normalizeLoginIdentifier(value: string): { kind: 'email' | 'username'; value: string } | null {
  const normalized = value.trim().toLowerCase()
  const withoutAt = normalized.startsWith('@') ? normalized.slice(1) : normalized

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { kind: 'email', value: normalized }
  }
  if (/^[a-z0-9_.]{3,30}$/.test(withoutAt)) {
    return { kind: 'username', value: withoutAt }
  }
  return null
}

export async function unifiedLoginHandler(req: any, res: any) {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message })
    const { password } = parsed.data
    // `email` remains accepted for older clients; the UI now sends `identifier`.
    const identifier = parsed.data.identifier || parsed.data.email || ''
    const normalizedIdentifier = normalizeLoginIdentifier(identifier)
    if (!normalizedIdentifier) {
      return res.status(400).json({ success: false, error: 'Enter a valid college email or @username.' })
    }

    const user = normalizedIdentifier.kind === 'email'
      ? await db.one<any>(`SELECT ${AUTH_USER_COLUMNS} FROM users WHERE email = $1`, [normalizedIdentifier.value])
      : await db.one<any>(`SELECT ${AUTH_USER_COLUMNS} FROM users WHERE LOWER(username) = $1`, [normalizedIdentifier.value])
    const email = user?.email || normalizedIdentifier.value
    if (!user || !user.password_hash) {
      await recordLoginHistory({ userId: user?.id, identifier, success: false, req, failureReason: 'invalid_credentials' })
      if (user) sendLoginAlert(email, 'failed', `A failed login attempt was made for your account from ${req.ip || 'an unknown IP'}.`).catch(() => {})
      return res.status(401).json({ success: false, error: 'Invalid email or password.' })
    }

    // Mobile password fields can occasionally include an accidental leading
    // or trailing space when credentials are pasted. Preserve exact password
    // semantics first, then accept the trimmed form only as a compatibility
    // fallback; this never changes a password that intentionally contains
    // spaces when it is entered exactly.
    const valid = await bcrypt.compare(password, user.password_hash)
      || (password !== password.trim() && await bcrypt.compare(password.trim(), user.password_hash))
    if (!valid) {
      await recordLoginHistory({ userId: user.id, identifier, success: false, req, failureReason: 'invalid_password' })
      sendLoginAlert(email, 'failed', `A failed login attempt was made from ${req.ip || 'an unknown IP'}.`).catch(() => {})
      return res.status(401).json({ success: false, error: 'Invalid email or password.' })
    }

    if (!user.is_email_verified) {
      await recordLoginHistory({ userId: user.id, identifier, success: false, req, failureReason: 'email_not_verified' })
      const otp = generateOTP()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      const otpId = uuidv4()
      await db.run('DELETE FROM otps WHERE email = $1 AND type = $2', [email, 'verify'])
      await db.run('INSERT INTO otps (id, email, otp, type, expires_at) VALUES ($1,$2,$3,$4,$5)', [otpId, email, otp, 'verify', expiresAt])
      try {
        await sendOTPEmail(email, otp, 'verify')
      } catch (error) {
        await db.run('DELETE FROM otps WHERE id = $1', [otpId]).catch(() => {})
        console.error('unverified-login OTP email error:', (error as Error).message)
        return res.status(503).json({
          success: false,
          error: 'We couldn’t send your verification code. Please try again in a moment.',
          code: 'EMAIL_DELIVERY_UNAVAILABLE',
        })
      }
      return res.status(403).json({
        success: false,
        error: 'Email not verified. A new verification code has been sent to your email.',
        code: 'EMAIL_NOT_VERIFIED',
        data: { email, username: user.username },
      })
    }

    if (isPlayReviewerAccount(user) || isPasswordOnlyTesterAccount(user)) {
      const result = await withTransaction(async (tx) => {
        const token = signToken(buildUserPayload(user))
        const refreshToken = signRefreshToken(user.id)
        await tx.run(
          `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, device_info, ip_address)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            uuidv4(),
            user.id,
            crypto.createHash('sha256').update(refreshToken).digest('hex'),
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            req.headers['user-agent'] || '',
            getClientIp(req),
          ],
        )
        await tx.run('UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = $1', [user.id])
        return { token, refreshToken }
      })
      await recordLoginHistory({ userId: user.id, identifier, success: true, req })
      return res.json({
        success: true,
        data: {
          token: result.token,
          refreshToken: result.refreshToken,
          user: await safeUser(user),
        },
      })
    }

    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const otpId = uuidv4()
    await db.run('INSERT INTO otps (id, email, otp, type, expires_at) VALUES ($1,$2,$3,$4,$5)', [otpId, email, otp, 'login', expiresAt])
    try {
      await sendOTPEmail(email, otp, 'login')
      await db.run('DELETE FROM otps WHERE email = $1 AND type = $2 AND id != $3', [email, 'login', otpId])
    } catch (error) {
      await db.run('DELETE FROM otps WHERE id = $1', [otpId]).catch(() => {})
      console.error('login OTP email error:', (error as Error).message)
      return res.status(503).json({
        success: false,
        error: 'We couldn’t send your login code. Please try again in a moment.',
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
      })
    }
    res.status(202).json({
      success: true,
      message: 'A login code was sent to your email.',
      code: 'LOGIN_OTP_REQUIRED',
      data: { email, username: user.username },
    })
  } catch (err: any) {
    console.error('login error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}

authRouter.post('/login', unifiedLoginHandler)

export async function unifiedVerifyLoginHandler(req: any, res: any) {
  try {
    const email = String(req.body.email || '').toLowerCase().trim()
    const otp = String(req.body.otp || '')
    if (!email || otp.length !== 6) return res.status(400).json({ success: false, error: 'Email and a 6-digit code are required.' })
    const result = await withTransaction(async (tx) => {
      if (!await consumeOtp(tx, email, 'login', otp)) return null
      const user = await tx.one<any>(`SELECT ${AUTH_USER_COLUMNS} FROM users WHERE email = $1`, [email])
      if (!user) throw new Error('OTP user missing')
      const token = signToken(buildUserPayload(user))
      const refreshToken = signRefreshToken(user.id)
      await tx.run(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, device_info, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), user.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), req.headers['user-agent'] || '', getClientIp(req)],
      )
      await tx.run('UPDATE users SET is_online = 1, last_seen = NOW() WHERE id = $1', [user.id])
      return { user, token, refreshToken }
    })
    if (!result) return res.status(400).json({ success: false, error: 'That login code is invalid or expired.' })
    await recordLoginHistory({ userId: result.user.id, identifier: email, success: true, req })
    const loginDevice = identifyDevice(String(req.headers['user-agent'] || ''))
    const deviceLabel = [loginDevice.browser, loginDevice.os || loginDevice.device].filter(Boolean).join(' on ')
    sendLoginAlert(email, 'success', `A new login was verified from ${deviceLabel || 'an unknown device'}.`).catch(() => {})
    res.json({ success: true, data: { token: result.token, refreshToken: result.refreshToken, user: await safeUser(result.user) } })
  } catch (err: any) {
    console.error('verify-login error:', err.message)
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}

authRouter.post('/verify-login', unifiedVerifyLoginHandler)

// ─── Refresh Token ────────────────────────────────────────────────────────────
authRouter.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(401).json({ success: false, error: 'Refresh token required.' })

    const payload = verifyToken(refreshToken) as any
    if (!payload?.userId || payload.type !== 'refresh') return res.status(401).json({ success: false, error: 'Invalid refresh token.' })

    const rtHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const result = await withTransaction(async (tx) => {
      const stored = await tx.one<any>(
        'DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW() RETURNING id',
        [rtHash, payload.userId],
      )
      if (!stored) return null
      const user = await tx.one<any>(`SELECT ${AUTH_USER_COLUMNS} FROM users WHERE id = $1`, [payload.userId])
      if (!user) return null
      const refreshToken = signRefreshToken(user.id)
      await tx.run(
        'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
        [uuidv4(), user.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()],
      )
      return { token: signToken(buildUserPayload(user)), refreshToken }
    })
    if (!result) return res.status(401).json({ success: false, error: 'Invalid refresh token.' })
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Logout ───────────────────────────────────────────────────────────────────
authRouter.post('/logout', requireAuth, async (req, res) => {
  try {
    const { refreshToken } = req.body || {}
    if (refreshToken) {
      const rtHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
      await db.run('DELETE FROM refresh_tokens WHERE token_hash = $1', [rtHash])
    }
    await db.run('UPDATE users SET is_online = 0, last_seen = NOW() WHERE id = $1', [req.user!.userId])
    res.json({ success: true, message: 'Logged out.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Forgot Password ──────────────────────────────────────────────────────────
authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ success: false, error: 'Email is required.' })

    const user = await db.one('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (user) {
      const otp = generateOTP()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      await db.run('DELETE FROM otps WHERE email = $1 AND type = $2', [email.toLowerCase(), 'reset'])
      await db.run('INSERT INTO otps (id, email, otp, type, expires_at) VALUES ($1,$2,$3,$4,$5)', [uuidv4(), email.toLowerCase(), otp, 'reset', expiresAt])
      await sendOTPEmail(email, otp, 'reset')
    }
    res.json({ success: true, message: 'If that email exists in our system, a reset code has been sent.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Reset Password ───────────────────────────────────────────────────────────
authRouter.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, password } = req.body
    if (!email || !otp || !password) return res.status(400).json({ success: false, error: 'Email, OTP, and new password are required.' })
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' })

    const hash = await bcrypt.hash(password, 12)
    const reset = await withTransaction(async (tx) => {
      if (!await consumeOtp(tx, email.toLowerCase(), 'reset', String(otp))) return false
      const user = await tx.one<any>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
      if (!user) throw new Error('OTP user missing')
      await tx.run('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user.id])
      await tx.run('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id])
      return true
    })
    if (!reset) return res.status(400).json({ success: false, error: 'Invalid or expired reset code.' })

    res.json({ success: true, message: 'Password reset successfully. Please log in with your new password.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Google OAuth (placeholder) ───────────────────────────────────────────────
authRouter.post('/google', async (_req, res) => {
  res.status(501).json({ success: false, error: 'Google OAuth requires GOOGLE_CLIENT_ID environment variable. Configure it in your Replit secrets.', code: 'GOOGLE_OAUTH_NOT_CONFIGURED' })
})

// ─── College Verification Upload ──────────────────────────────────────────────
authRouter.post('/college-verify', requireAuth, uploadVerify.fields([{ name: 'id_photo', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]), async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]>
    if (!files?.id_photo?.[0] || !files?.selfie?.[0]) return res.status(400).json({ success: false, error: 'Both college ID photo and selfie are required.' })
    await assertImageMagic(files.id_photo[0])
    await assertImageMagic(files.selfie[0])

    await withTransaction(async (tx) => {
      const idPhotoUrl = await storeMediaAsset(tx, files.id_photo[0], req.user!.userId, 'verification_id_photo', req.user!.userId)
      const selfieUrl = await storeMediaAsset(tx, files.selfie[0], req.user!.userId, 'verification_selfie', req.user!.userId)
      const user = await tx.one<any>('SELECT full_name FROM users WHERE id = $1', [req.user!.userId])
      const ocrName = user?.full_name || ''

      const existing = await tx.one('SELECT id FROM college_verifications WHERE user_id = $1', [req.user!.userId])
      const verificationId = existing?.id || uuidv4()
      if (existing) {
        await tx.run(
          `UPDATE college_verifications SET id_photo_url=$1, selfie_url=$2, ocr_name=$3, status='pending', submitted_at=NOW(), reviewed_at=NULL WHERE user_id=$4`,
          [idPhotoUrl, selfieUrl, ocrName, req.user!.userId]
        )
      } else {
        await tx.run(
          `INSERT INTO college_verifications (id, user_id, id_photo_url, selfie_url, ocr_name, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
          [verificationId, req.user!.userId, idPhotoUrl, selfieUrl, ocrName]
        )
      }
      await tx.run(
        `INSERT INTO verification_requests
          (id, user_id, verification_type, status, documents, notes, reviewer_id, submitted_at, reviewed_at, updated_at)
         VALUES ($1,$2,'student','pending',$3,'',NULL,NOW(),NULL,NOW())
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id, verification_type = 'student', status = 'pending',
           documents = EXCLUDED.documents, notes = '', reviewer_id = NULL,
           submitted_at = EXCLUDED.submitted_at, reviewed_at = NULL, updated_at = NOW()`,
        [verificationId, req.user!.userId, JSON.stringify([
          { kind: 'id', url: idPhotoUrl },
          { kind: 'selfie', url: selfieUrl },
        ])],
      )
      await tx.run('UPDATE users SET verification_status = $1 WHERE id = $2', ['pending', req.user!.userId])
    })
    res.json({ success: true, message: 'Verification submitted! Our team will review within 24 hours.', data: { status: 'pending' } })
  } catch (err: any) {
    if (sendMediaPolicyError(res, err)) return
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Check Email ──────────────────────────────────────────────────────────────
authRouter.get('/check-email', async (req, res) => {
  try {
    const email = (req.query.email as string || '').toLowerCase().trim()
    if (!email) return res.status(400).json({ success: false, error: 'Email required' })
    if (isDisposableEmail(email)) return res.json({ success: true, data: { valid: false, reason: 'disposable' } })
    if (!isCollegeEmail(email)) return res.json({ success: true, data: { valid: false, reason: 'not_college' } })
    const taken = await db.one('SELECT id FROM users WHERE email = $1', [email])
    if (taken) return res.json({ success: true, data: { valid: false, reason: 'taken' } })
    const collegeName = getCollegeNameByEmail(email)
    res.json({ success: true, data: { valid: true, collegeName } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

// ─── Sessions ─────────────────────────────────────────────────────────────────
authRouter.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await db.all<any>('SELECT id, device_info, ip_address, created_at, expires_at FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC', [req.user!.userId])
    const data = await Promise.all(sessions.map(async (session) => {
      const location = await lookupSessionLocation(session.ip_address)
      return {
        id: session.id,
        ...identifyDevice(session.device_info),
        location,
        created_at: session.created_at,
        expires_at: session.expires_at,
      }
    }))
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})

authRouter.delete('/sessions', requireAuth, async (req, res) => {
  try {
    const { refreshToken } = req.body
    const currentHash = refreshToken ? crypto.createHash('sha256').update(refreshToken).digest('hex') : null
    if (currentHash) {
      await db.run('DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash != $2', [req.user!.userId, currentHash])
    } else {
      await db.run('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user!.userId])
    }
    res.json({ success: true, message: 'All other sessions logged out.' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Internal server error.' })
  }
})
