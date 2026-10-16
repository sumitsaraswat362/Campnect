// @ts-nocheck
import { Router } from 'express'
import { db } from '../legacy-db/index.js'
import { optionalAuth, requireAdmin } from '../legacy-middleware/auth.js'
import { isCollegeEmail, getCollegeNameByEmail } from '../legacy-utils/college-domains.js'

export const collegesRouter = Router()

/**
 * Users can arrive from older imports and profile edits with the same course
 * written using different dash characters, an optional duration, or without
 * the final "Engineering". Keep those variants in one people directory.
 */
function courseKey(value: string): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s*(?:[·•—–-]\s*)?\d+\s*years?\s*$/i, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

  return [
    'b tech computer science',
    'b tech computer science engineering',
    'b tech computer science and engineering',
  ].includes(normalized)
    ? 'b tech computer science engineering'
    : normalized
}

function courseKeySql(column: string): string {
  const normalized = `
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(LOWER(TRIM(${column})), '\\s*[·•—–-]*\\s*[0-9][0-9]*\\s*years*\\s*$', '', 'i'),
          '&', ' and ', 'g'
        ),
        '[^a-z0-9]+', ' ', 'g'
      )
    )
  `
  return `CASE
    WHEN ${normalized} IN (
      'b tech computer science',
      'b tech computer science engineering',
      'b tech computer science and engineering'
    )
      THEN 'b tech computer science engineering'
    ELSE ${normalized}
  END`
}

collegesRouter.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, limit = '20', page = '1' } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    let colleges
    if (q) {
      colleges = await db.all('SELECT * FROM colleges WHERE LOWER(name) LIKE $1 OR LOWER(short_name) LIKE $2 ORDER BY students_count DESC LIMIT $3 OFFSET $4', [`%${(q as string).toLowerCase()}%`, `%${(q as string).toLowerCase()}%`, Number(limit), offset])
    } else {
      colleges = await db.all('SELECT * FROM colleges ORDER BY students_count DESC LIMIT $1 OFFSET $2', [Number(limit), offset])
    }
    res.json({ success: true, data: colleges })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

// Fixed paths BEFORE /:id dynamic route
collegesRouter.get('/check-email', (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ success: false, error: 'Email required.' })
  const valid = isCollegeEmail(email as string)
  const collegeName = valid ? getCollegeNameByEmail(email as string) : null
  res.json({ success: true, data: { valid, collegeName } })
})

collegesRouter.get('/:id', optionalAuth, async (req, res) => {
  try {
    const [college, memberCountRow] = await Promise.all([
      db.one<any>('SELECT * FROM colleges WHERE id = $1', [req.params.id]),
      db.one<any>('SELECT COUNT(*) as c FROM users WHERE college_id = $1 AND is_email_verified = 1', [req.params.id]),
    ])
    if (!college) return res.status(404).json({ success: false, error: 'College not found.' })
    res.json({ success: true, data: { ...college, member_count: Number(memberCountRow?.c ?? 0) } })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

collegesRouter.get('/:id/courses', optionalAuth, async (req, res) => {
  try {
    const key = courseKeySql('u.course')
    const courses = await db.all(`
      SELECT
        CASE
          WHEN ${key} = 'b tech computer science engineering'
            THEN 'B.Tech Computer Science & Engineering'
          ELSE MIN(TRIM(course))
        END AS name,
        COUNT(*)::integer AS member_count
      FROM users u
      WHERE u.college_id = $1
        AND u.is_email_verified = 1
        AND COALESCE(u.is_suspended, 0) = 0
        AND COALESCE(u.is_banned, 0) = 0
        AND COALESCE(u.is_deactivated, 0) = 0
        AND COALESCE(u.is_admin, 0) = 0
        AND COALESCE((SELECT usc.search_visibility FROM user_shadowban_controls usc WHERE usc.user_id = u.id), COALESCE(u.is_shadowbanned, 0)) = 0
        AND u.course IS NOT NULL
        AND TRIM(u.course) <> ''
      GROUP BY ${key}
      HAVING COUNT(*) > 0
      ORDER BY member_count DESC, name ASC
    `, [req.params.id])
    res.json({ success: true, data: courses })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

collegesRouter.get('/:id/students', optionalAuth, async (req, res) => {
  try {
    const { limit = '20', page = '1', department, course } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    let sql = 'SELECT u.id, u.username, u.full_name, u.avatar_url, u.department, u.course, u.semester, u.is_college_verified, u.followers_count FROM users u WHERE u.college_id = ? AND u.is_email_verified = 1 AND COALESCE(u.is_suspended, 0) = 0 AND COALESCE(u.is_banned, 0) = 0 AND COALESCE(u.is_deactivated, 0) = 0 AND COALESCE(u.is_admin, 0) = 0 AND COALESCE((SELECT usc.search_visibility FROM user_shadowban_controls usc WHERE usc.user_id = u.id), COALESCE(u.is_shadowbanned, 0)) = 0'
    const params: any[] = [req.params.id]
    if (department) { sql += ' AND LOWER(department) = ?'; params.push((department as string).toLowerCase()) }
    if (course) { sql += ` AND ${courseKeySql('u.course')} = ?`; params.push(courseKey(course as string)) }
    sql += ' ORDER BY followers_count DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), offset)
    const [finalSql, finalParams] = db.toPos(sql, params)
    res.json({ success: true, data: await db.all(finalSql, finalParams) })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})

collegesRouter.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, about, website, logo_url, cover_url } = req.body
    const fields: string[] = []
    const values: any[] = []
    if (name) { fields.push('name = ?'); values.push(name) }
    if (about !== undefined) { fields.push('about = ?'); values.push(about) }
    if (website !== undefined) { fields.push('website = ?'); values.push(website) }
    if (logo_url !== undefined) { fields.push('logo_url = ?'); values.push(logo_url) }
    if (cover_url !== undefined) { fields.push('cover_url = ?'); values.push(cover_url) }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update.' })
    values.push(req.params.id)
    const [sql, params] = db.toPos(`UPDATE colleges SET ${fields.join(', ')} WHERE id = ? RETURNING *`, values)
    const college = await db.one(sql, params)
    res.json({ success: true, data: college })
  } catch (err: any) { res.status(500).json({ success: false, error: 'Internal server error.' }) }
})
