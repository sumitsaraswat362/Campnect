import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { build } from 'esbuild'
import express from 'express'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const testDirectory = fileURLToPath(new URL('.', import.meta.url))
const routerEntry = fileURLToPath(new URL('../src/legacy-routes/posts.ts', import.meta.url))
let buildDirectory
let server
let baseUrl
let harness
let assessCommentSubmission
let createCommentModerator

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function classification(decision) {
  return {
    decision,
    category: decision === 'WARN' ? 'LOW_LEVEL_HARASSMENT' : 'SAFE',
    severity: decision === 'WARN' ? 'MEDIUM' : 'NONE',
    confidence: 0.8,
    targeted: decision === 'WARN',
    intent: 'test-only classification',
    reason: 'test-only internal classifier detail',
    requiresConfirmation: decision === 'WARN',
    requiresHumanReview: false,
    source: 'local',
  }
}

function resetHarness() {
  harness.assessments = []
  harness.calls = []
  harness.comments = []
  harness.posts = new Map([['post-1', { id: 'post-1', type: 'photo', user_id: 'owner-1', comments_count: 0 }]])
  harness.commentDecisions = new Map()
  harness.commentModeration = new Map()
  harness.commentOverrides = new Map()
  harness.moderationCases = new Map()
  harness.moderationActions = new Map()
  harness.appeals = new Map()
  harness.appealAccount = null
  harness.latestSanctionAction = null
  harness.localModerator = null
  harness.rateAttempts = []
  harness.notifications = []
}

async function request(method, path, body, { authenticated = true } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { authorization: 'Bearer test-user-token' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { response, body: await response.json() }
}

before(async () => {
  process.env.SESSION_SECRET = 'test-only-comment-session-secret-32-chars'
  harness = {
    assessments: [],
    calls: [],
    comments: [],
    posts: new Map(),
    commentDecisions: new Map(),
    commentModeration: new Map(),
    commentOverrides: new Map(),
    moderationCases: new Map(),
    moderationActions: new Map(),
    appeals: new Map(),
    appealAccount: null,
    latestSanctionAction: null,
    localModerator: null,
    rateAttempts: [],
    notifications: [],
    user: {
      id: 'student-1',
      is_banned: 0,
      is_suspended: 0,
      is_deactivated: 0,
      is_admin: 0,
      is_shadowbanned: 0,
    },
    async classify(input, options = {}) {
      this.calls.push({ ...input, options })
      const value = this.assessments.shift() || classification('ALLOW')
      return typeof value === 'string' ? classification(value) : { ...value }
    },
    async one(sql, params = []) {
      const query = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (query.includes('select count(*)::int as attempts from comment_moderation_rate_attempts')) {
        const [userId, createdAfter] = params
        return {
          attempts: this.rateAttempts.filter((attempt) =>
            attempt.user_id === userId &&
            Date.parse(attempt.created_at) > new Date(createdAfter).getTime(),
          ).length,
        }
      }
      if (query.startsWith('select exists (') && query.includes('from comments c')) {
        return { duplicate: false }
      }
      if (query.includes('update comment_moderation_decisions') && query.includes('confirmation_used_at')) {
        const [id, userId, postId, parentId, commentId, operation, contentHash, nonceHash] = params
        const decision = this.commentDecisions.get(id)
        if (
          decision &&
          decision.user_id === userId &&
          decision.post_id === postId &&
          (decision.parent_id || '') === (parentId || '') &&
          (decision.target_comment_id || '') === (commentId || '') &&
          decision.operation === operation &&
          decision.content_hash === contentHash &&
          decision.confirmation_nonce_hash === nonceHash &&
          !decision.confirmation_used_at &&
          Date.parse(decision.confirmation_expires_at) > Date.now()
        ) {
          decision.confirmation_used_at = new Date().toISOString()
          return { id }
        }
        return null
      }
      if (query.includes('select id from comment_moderation_overrides')) {
        const [userId, postId, operation, contentHash, parentId, commentId] = params
        const override = [...this.commentOverrides.values()].find((item) =>
          item.user_id === userId &&
          item.post_id === postId &&
          item.operation === operation &&
          item.content_hash === contentHash &&
          (item.parent_id || '') === (parentId || '') &&
          (item.target_comment_id || '') === (commentId || '') &&
          !item.consumed_at &&
          Date.parse(item.expires_at) > Date.now(),
        )
        return override ? { id: override.id } : null
      }
      if (query.includes('select id, decision, confirmation_used_at from comment_moderation_decisions')) {
        const [userId, postId, parentId, commentId, operation, stage, contentHash, decision] = params
        const prior = [...this.commentDecisions.values()].find((item) =>
          item.user_id === userId && item.post_id === postId &&
          (item.parent_id || '') === (parentId || '') &&
          (item.target_comment_id || '') === (commentId || '') &&
          item.operation === operation && item.request_stage === stage &&
          item.content_hash === contentHash && item.decision === decision &&
          Date.now() - new Date(item.created_at).getTime() < 120_000,
        )
        return prior ? { id: prior.id, decision: prior.decision, confirmation_used_at: prior.confirmation_used_at } : null
      }
      if (query.includes('select count(distinct content_hash)')) {
        const [userId, currentId, currentHash] = params
        const distinct = new Set([...this.commentDecisions.values()]
          .filter((item) =>
            item.user_id === userId &&
            item.id !== currentId &&
            item.content_hash !== currentHash &&
            item.decision === 'BLOCK' &&
            ['HIGH', 'CRITICAL'].includes(item.severity) &&
            item.targeted === 1 &&
            Number(item.confidence) >= 0.9 &&
            item.category !== 'SPAM' &&
            item.appeal_status !== 'approved',
          )
          .map((item) => item.content_hash))
        return { count: distinct.size }
      }
      if (query.includes('select id, expires_at from user_restrictions')) {
        return this.activeCommentRestriction || null
      }
      if (query.startsWith('insert into user_restrictions')) {
        const [id, userId] = params
        this.activeCommentRestriction = { id, user_id: userId, restriction_type: 'comments', issued_by: 'system:comment-moderation' }
        return { id }
      }
      if (query.includes('from comment_moderation_decisions') && query.includes('where id = $1')) {
        return this.commentDecisions.get(params[0]) || null
      }
      if (query.startsWith('update comments set content')) {
        const [content, id, userId, postId] = params
        const comment = this.comments.find((item) => item.id === id && item.user_id === userId && item.post_id === postId)
        if (!comment) return null
        comment.content = content
        comment.updated_at = new Date().toISOString()
        return { id }
      }
      if (query.includes('select * from moderation_cases where id = $1')) {
        return this.moderationCases.get(params[0]) || null
      }
      if (query.includes('select * from appeals where id = $1 for update')) {
        return this.appeals.get(params[0]) || null
      }
      if (query.includes('select id, action, target_type, target_id, reason from moderation_actions')) {
        return this.moderationActions.get(params[0]) || null
      }
      if (query.includes('select id,action from moderation_actions') && query.includes("action in ('user.suspend','user.ban'")) {
        return this.latestSanctionAction
      }
      if (query.includes('select id,is_suspended,is_banned,suspension_reason,ban_reason')) {
        return this.appealAccount || null
      }
      if (query.includes('update appeals') && query.includes('returning *')) {
        const [status, moderatorNotes, decision, assignedTo, id] = params
        const appeal = this.appeals.get(id)
        if (!appeal) return null
        Object.assign(appeal, { status, moderator_notes: moderatorNotes, decision, assigned_to: assignedTo })
        return appeal
      }
      if (query.includes('from comment_moderation_decisions') && query.includes('select id,user_id,post_id,parent_id')) {
        return this.commentDecisions.get(params[0]) || null
      }
      if (query.includes('select summary,status from moderation_cases')) {
        const item = this.moderationCases.get(params[0])
        return item ? { summary: item.summary, status: item.status } : null
      }
      if (query.includes('select count(*)::int as count from moderation_cases mc')) {
        return { count: this.moderationCases.size }
      }
      if (query.includes('from comment_moderation_decisions') && query.includes("decision in ('block','human_review')")) {
        const decision = this.commentDecisions.get(params[0])
        return decision && ['BLOCK', 'HUMAN_REVIEW'].includes(decision.decision) ? decision : null
      }
      if (query.includes('select id from moderation_actions') && query.includes("action in ('comment.block','comment.human_review')")) {
        return this.moderationActions.get(params[0]) || null
      }
      if (query.includes('update user_restrictions set removed_at')) return null
      if (query.includes('update moderation_cases') && query.includes('returning *')) {
        const [status, resolvedBy, id] = params
        const item = this.moderationCases.get(id)
        if (!item) return null
        Object.assign(item, { status, resolved_by: resolvedBy, resolved_at: new Date().toISOString() })
        return item
      }
      if (query.includes('select is_suspended, is_banned, is_deactivated')) return this.user
      if (query.includes('from user_restrictions')) return null
      if (query.includes('select id, type from posts')) return this.posts.get(params[0]) || null
      if (query.includes('select * from comments where id = $1')) {
        return this.comments.find((item) => item.id === params[0]) || null
      }
      if (query.includes('from posts p join users u') && query.includes('where p.id = $2')) {
        return this.posts.has(params[1]) ? { allowed: true } : null
      }
      if (query.includes('select id, post_id, parent_id, user_id from comments')) {
        const comment = this.comments.find((item) => item.id === params[0])
        return comment ? { ...comment } : null
      }
      if (query.includes('select c.id from comments c') && query.includes('parent_id is null')) {
        return this.comments.find((item) => item.id === params[0] && item.post_id === params[1] && !item.parent_id) || null
      }
      if (query.includes('select is_banned, is_suspended, is_deactivated')) return this.user
      if (query.includes('select c.id from comments c') && query.includes("regexp_replace(btrim(c.content)")) {
        const [userId, content, commentId] = params
        const duplicate = this.comments.find((item) =>
          item.user_id === userId &&
          normalize(item.content) === normalize(content) &&
          item.id !== commentId &&
          !this.commentModeration.has(item.id),
        )
        return duplicate ? { id: duplicate.id } : null
      }
      if (query.includes('select user_id, type from posts')) return this.posts.get(params[0]) || null
      if (query.includes('select username, full_name, avatar_url from users')) {
        return { username: 'student', full_name: 'Test Student', avatar_url: null }
      }
      if (query.includes('select c.*, u.username, u.full_name')) {
        const comment = this.comments.find((item) => item.id === params[0])
        return comment ? {
          ...comment,
          username: 'student',
          full_name: 'Test Student',
          avatar_url: null,
          is_college_verified: false,
          is_liked: false,
        } : null
      }
      if (query.includes('select c.id, post_id, parent_id, user_id')) {
        const comment = this.comments.find((item) => item.id === params[0])
        return comment ? { ...comment } : null
      }
      console.error('Unexpected fake database lookup:', query)
      throw new Error(`Unexpected fake database lookup: ${query}`)
    },
    async all(sql, params = []) {
      const query = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (query.includes('from moderation_cases mc')) {
        return [...this.moderationCases.values()]
      }
      if (query.includes('from comments c') && query.includes('where c.post_id = $1')) {
        return this.comments.filter((item) => item.post_id === params[0] && !item.parent_id && !this.commentModeration.has(item.id))
      }
      return []
    },
    async run(sql, params = []) {
      const query = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (query.startsWith('delete from comment_moderation_rate_attempts')) return { rowCount: 0 }
      if (query.startsWith('insert into comment_moderation_rate_attempts')) {
        const [id, userId, contentHash, createdAt] = params
        this.rateAttempts.push({ id, user_id: userId, content_hash: contentHash, created_at: createdAt })
        return { rowCount: 1 }
      }
      if (query.startsWith('delete from comment_moderation_rate_attempts')) return { rowCount: 0 }
      if (query.startsWith('update user_restrictions set removed_at')) return { rowCount: 0 }
      if (query.startsWith('insert into comments')) {
        const [id, postId, userId, parentId, content] = params
        this.comments.push({
          id, post_id: postId, user_id: userId, parent_id: parentId,
          content, likes_count: 0, created_at: new Date().toISOString(),
        })
        return { rowCount: 1 }
      }
      if (query.startsWith('insert into comment_moderation_decisions')) {
        const [
          id, userId, postId, parentId, commentId, operation, stage, contentHash,
          decision, category, severity, source, confidence, targeted, intent, reason,
          requiresConfirmation, requiresHumanReview, approvedOverrideId,
          confirmationNonceHash, confirmationExpiresAt, appealStatus,
        ] = params
        this.commentDecisions.set(id, {
          id,
          user_id: userId,
          post_id: postId,
          parent_id: parentId,
          target_comment_id: commentId,
          operation,
          request_stage: stage,
          content_hash: contentHash,
          decision,
          category,
          severity,
          source,
          confidence: Number(confidence),
          targeted: Number(targeted),
          intent,
          reason,
          requires_confirmation: Number(requiresConfirmation),
          requires_human_review: Number(requiresHumanReview),
          approved_override_id: approvedOverrideId,
          confirmation_nonce_hash: confirmationNonceHash,
          confirmation_expires_at: confirmationExpiresAt,
          confirmation_used_at: null,
          appeal_status: appealStatus,
          created_at: new Date().toISOString(),
        })
        return { rowCount: 1 }
      }
      if (query.startsWith('insert into moderation_actions') && query.includes("'system:comment-moderation'")) {
        const [id, action, targetType, targetId, reason, metadata, requestId] = params
        this.moderationActions.set(id, {
          id, admin_id: 'system:comment-moderation', action, target_type: targetType,
          target_id: targetId, reason, metadata, request_id: requestId,
        })
        return { rowCount: 1 }
      }
      if (query.startsWith('insert into moderation_cases')) {
        const [id, caseType, category, targetId, priority, summary] = params
        this.moderationCases.set(id, {
          id,
          case_type: caseType,
          category,
          target_type: 'comment_submission',
          target_id: targetId,
          status: 'open',
          priority,
          summary,
        })
        return { rowCount: 1 }
      }
      if (query.startsWith('update comment_moderation_decisions set restriction_id')) {
        const [restrictionId, id] = params
        const decision = this.commentDecisions.get(id)
        if (decision) decision.restriction_id = restrictionId
        return { rowCount: decision ? 1 : 0 }
      }
      if (query.startsWith('update comments set content')) {
        const [content, id, userId, postId] = params
        const comment = this.comments.find((item) => item.id === id && item.user_id === userId && item.post_id === postId)
        if (!comment) return { rowCount: 0 }
        comment.content = content
        comment.updated_at = new Date().toISOString()
        return { rowCount: 1 }
      }
      if (query.startsWith('update posts set comments_count = comments_count + 1')) {
        const post = this.posts.get(params[0])
        if (post) post.comments_count += 1
        return { rowCount: post ? 1 : 0 }
      }
      if (query.startsWith('insert into notifications')) {
        this.notifications.push([...params])
        return { rowCount: 1 }
      }
      if (query.startsWith('insert into appeal_history')) return { rowCount: 1 }
      if (query.startsWith('insert into admin_audit_logs')) return { rowCount: 1 }
      if (query.startsWith('update moderation_cases')) return { rowCount: 1 }
      if (query.startsWith('update users set is_suspended = 0')) {
        if (this.appealAccount) {
          this.appealAccount.is_suspended = 0
          this.appealAccount.suspension_reason = ''
        }
        return { rowCount: 1 }
      }
      if (query.startsWith('update users set is_banned = 0')) {
        if (this.appealAccount) {
          this.appealAccount.is_banned = 0
          this.appealAccount.ban_reason = ''
        }
        return { rowCount: 1 }
      }
      if (query.startsWith('insert into moderation_actions')) {
        const [id, adminId, action, targetType, targetId, reason, beforeSummary, afterSummary, metadata] = params
        this.moderationActions.set(id, { id, admin_id: adminId, action, target_type: targetType, target_id: targetId, reason, before_summary: beforeSummary, after_summary: afterSummary, metadata })
        return { rowCount: 1 }
      }
      if (query.startsWith('insert into comment_moderation_overrides')) {
        const [id, userId, postId, parentId, commentId, operation, contentHash, authorityType, authorityId, moderationActionId, approvedBy] = params
        this.commentOverrides.set(id, {
          id, user_id: userId, post_id: postId, parent_id: parentId, target_comment_id: commentId,
          operation, content_hash: contentHash, authority_type: authorityType, authority_id: authorityId,
          moderation_action_id: moderationActionId, approved_by: approvedBy,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(), consumed_at: null,
        })
        return { rowCount: 1 }
      }
      if (query.startsWith('update comment_moderation_decisions set appeal_status')) {
        const decision = this.commentDecisions.get(params[0])
        const status = query.match(/set appeal_status = '([^']+)'/)?.[1]
        if (decision && status) decision.appeal_status = status
        return { rowCount: decision ? 1 : 0 }
      }
      if (query.startsWith('insert into enforcement_history')) return { rowCount: 1 }
      if (query.startsWith('insert into moderation_case_notes')) return { rowCount: 1 }
      console.error('Unexpected fake database write:', query)
      throw new Error(`Unexpected fake database write: ${query}`)
    },
    async withTransaction(callback) {
      const tx = {
        one: (sql, params = []) => {
          const query = sql.replace(/\s+/g, ' ').trim().toLowerCase()
          if (query.includes('pg_advisory_xact_lock')) return Promise.resolve({ locked: true })
          if (query.startsWith('update comment_moderation_overrides')) {
            const [id, userId, postId, operation, contentHash, parentId, commentId] = params
            const override = this.commentOverrides.get(id)
            if (
              override &&
              override.user_id === userId &&
              override.post_id === postId &&
              override.operation === operation &&
              override.content_hash === contentHash &&
              (override.parent_id || '') === (parentId || '') &&
              (override.target_comment_id || '') === (commentId || '') &&
              !override.consumed_at &&
              Date.parse(override.expires_at) > Date.now()
            ) {
              override.consumed_at = new Date().toISOString()
              return { id }
            }
            return null
          }
          if (query.startsWith('update moderation_cases') && query.includes('returning *')) {
            const [status, resolvedBy, id] = params
            const item = this.moderationCases.get(id)
            if (!item) return null
            Object.assign(item, { status, resolved_by: resolvedBy, resolved_at: new Date().toISOString() })
            return item
          }
          if (query.startsWith('insert into moderation_actions')) return this.run(sql, params)
          if (query.startsWith('insert into comment_moderation_overrides')) return this.run(sql, params)
          if (query.startsWith('update comment_moderation_decisions set appeal_status')) return this.run(sql, params)
          if (query.startsWith('insert into notifications')) return this.run(sql, params)
          if (query.startsWith('insert into enforcement_history')) return this.run(sql, params)
          if (query.startsWith('update moderation_cases')) return this.run(sql, params)
          if (query.startsWith('insert into appeal_history')) return this.run(sql, params)
          if (query.startsWith('insert into admin_audit_logs')) return this.run(sql, params)
          if (query.startsWith('update appeals') && query.includes('returning *')) return this.one(sql, params)
          return this.one(sql, params)
        },
        run: (sql, params = []) => this.run(sql, params),
      }
      return callback(tx)
    },
  }
  resetHarness()
  globalThis.__campnectCommentIntegration = harness
  buildDirectory = await mkdtemp(join(testDirectory, '.comment-routes-test-'))
  const bundledRouter = join(buildDirectory, 'posts-router.mjs')
  const moduleMocks = new Map([
    ['legacy-db/index.js', `const h=globalThis.__campnectCommentIntegration; export const db=h; export const withTransaction=(fn)=>h.withTransaction(fn);`],
    ['legacy-middleware/auth.js', `
      export const requireAdminPanel=(req,res,next)=>{req.admin={adminId:'moderator-1'};next()}
      export const requireAdminPermission=()=> (req,res,next)=>next()
      export const requireAuth=(req,res,next)=>{
        if(!req.headers.authorization?.startsWith('Bearer '))return res.status(401).json({success:false,error:'Authentication required'})
        req.user={userId:'student-1',isAdmin:false};next()
      }
      export const optionalAuth=(req,res,next)=>{req.user=null;next()}
    `],
    ['legacy-services/adminSecurity.js', `
      export const adminFailure=(res,req,status,code,message)=>res.status(status).json({success:false,error:{code,message}})
      export const adminSuccess=(res,req,data,meta={})=>res.json({success:true,data,meta})
      export const permissionsForRole=()=>[]
      export const recordAdminAudit=async()=>{}
      export const recordModerationAction=async()=>{}
    `],
    ['legacy-services/enforcement.js', `export const recordEnforcement=async()=>{}`],
    ['legacy-services/userWarnings.js', `export const createUserWarning=async()=>{}; export class UserWarningValidationError extends Error {}`],
    ['legacy-services/supabaseStorage.js', `export const readStoredMedia=async()=>null`],
    ['legacy-services/maintenance.js', `export const getMaintenanceState=async()=>({}); export const setMaintenanceState=async()=>{}`],
    ['legacy-services/appUpdate.js', `export const DEFAULT_PLAY_STORE_URL=''; export const getAppUpdateState=async()=>({}); export const setAppUpdateState=async()=>{}`],
    ['legacy-middleware/upload.js', `
      const pass=()=> (req,res,next)=>next()
      export const uploadPost={single:pass,array:pass}
      export const assertMediaMagic=async()=>{}
      export const sendMediaPolicyError=()=>false
    `],
    ['legacy-services/recommender.js', `
      export const generateFeed=async()=>[]
      export const classifyNewPost=async()=>{}
    `],
    ['legacy-services/media.js', `
      export const storeMediaAsset=async()=>null
      export const storeMediaAssets=async()=>[]
      export const mediaAssetId=()=>null
    `],
    ['legacy-services/userRestrictions.js', `export const enforceUserRestriction=async()=>false`],
    ['legacy-services/reporting.js', `export const createReportWithCase=async()=>null`],
    ['legacy-services/videoProcessing.js', `export const extractVideoCover=async()=>Buffer.alloc(0); export const processGlimpseVideo=async()=>({buffer:Buffer.alloc(0),duration:1,start:0,end:1})`],
    ['legacy-services/mediaLimits.js', `
      export const VIDEO_MAX_DURATION_SECONDS=60
      export class MediaPolicyError extends Error {}
      export const assertVideoDuration=()=>{}
    `],
    ['legacy-socket/io.js', `export const emitUserNotification=()=>{}`],
    ['legacy-services/glimpseAccess.js', `export const loadAccessibleGlimpse=async()=>null`],
    ['legacy-services/giphy.js', `export const normalizeGiphyMessageReference=()=>null`],
    ['commentModeration.js', `
      const h=globalThis.__campnectCommentIntegration
      export const evaluateComment=(input,options)=>h.localModerator
        ? h.localModerator.evaluateComment(input,options)
        : h.classify(input,options)
    `],
    ['legacy-services/commentModeration.js', `
      const h=globalThis.__campnectCommentIntegration
      export const evaluateComment=(input,options)=>h.localModerator
        ? h.localModerator.evaluateComment(input,options)
        : h.classify(input,options)
    `],
  ])
  await build({
    entryPoints: [routerEntry],
    outfile: bundledRouter,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
    plugins: [{
      name: 'isolate-comment-routes',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^((?:\.\.\/)+legacy-[^/]+\/[^/]+\.js|\.\/[^/]+\.js)$/ }, (args) => {
          const key = args.path.startsWith('./') ? args.path.slice(2) : args.path.replace(/^(\.\.\/)+/, '')
          return moduleMocks.has(key) ? { path: key, namespace: 'comment-route-mock' } : null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'comment-route-mock' }, (args) => ({
          contents: moduleMocks.get(args.path),
          loader: 'js',
        }))
      },
    }],
  })
  const { postsRouter, commentModerationRouter } = await import(pathToFileURL(bundledRouter).href)
  const bundledAdminRouter = join(buildDirectory, 'admin-platform-router.mjs')
  await build({
    entryPoints: [fileURLToPath(new URL('../src/legacy-routes/adminPlatformV1.ts', import.meta.url))],
    outfile: bundledAdminRouter,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
    plugins: [{
      name: 'isolate-admin-platform-routes',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^((?:\.\.\/)+legacy-[^/]+\/[^/]+\.js|\.\/[^/]+\.js)$/ }, (args) => {
          const key = args.path.startsWith('./') ? args.path.slice(2) : args.path.replace(/^(\.\.\/)+/, '')
          return moduleMocks.has(key) ? { path: key, namespace: 'comment-route-mock' } : null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'comment-route-mock' }, (args) => ({
          contents: moduleMocks.get(args.path),
          loader: 'js',
        }))
      },
    }],
  })
  const { adminPlatformV1Router } = await import(pathToFileURL(bundledAdminRouter).href)
  const bundledEnforcement = join(buildDirectory, 'comment-enforcement.mjs')
  await build({
    entryPoints: [fileURLToPath(new URL('../src/legacy-services/commentEnforcement.ts', import.meta.url))],
    outfile: bundledEnforcement,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
    plugins: [{
      name: 'isolate-comment-enforcement',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^((?:\.\.\/)+legacy-[^/]+\/[^/]+\.js|\.\/[^/]+\.js)$/ }, (args) => {
          const key = args.path.startsWith('./') ? args.path.slice(2) : args.path.replace(/^(\.\.\/)+/, '')
          return moduleMocks.has(key) ? { path: key, namespace: 'comment-route-mock' } : null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'comment-route-mock' }, (args) => ({
          contents: moduleMocks.get(args.path),
          loader: 'js',
        }))
      },
    }],
  })
  ;({ assessCommentSubmission } = await import(pathToFileURL(bundledEnforcement).href))
  const bundledLocalModerator = join(buildDirectory, 'comment-moderation-local.mjs')
  await build({
    entryPoints: [fileURLToPath(new URL('../src/legacy-services/commentModeration.ts', import.meta.url))],
    outfile: bundledLocalModerator,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
    plugins: [{
      name: 'isolate-local-comment-moderator',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^((?:\.\.\/)+legacy-[^/]+\/[^/]+\.js|\.\/[^/]+\.js)$/ }, (args) => {
          const key = args.path.startsWith('./') ? args.path.slice(2) : args.path.replace(/^(\.\.\/)+/, '')
          return moduleMocks.has(key) ? { path: key, namespace: 'comment-route-mock' } : null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'comment-route-mock' }, (args) => ({
          contents: moduleMocks.get(args.path),
          loader: 'js',
        }))
      },
    }],
  })
  ;({ createCommentModerator } = await import(pathToFileURL(bundledLocalModerator).href))
  const app = express()
  app.use(express.json())
  app.use('/api/posts', postsRouter)
  app.use('/api/comments', commentModerationRouter)
  app.use('/v1/admin', adminPlatformV1Router)
  server = app.listen(0)
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

function seedHeldSubmission({ id, content, authority = 'case' }) {
  const contentHash = crypto.createHash('sha256').update(content).digest('hex')
  const attempt = {
    id,
    user_id: 'student-1',
    post_id: 'post-1',
    parent_id: null,
    target_comment_id: null,
    operation: 'create',
    content_hash: contentHash,
    decision: 'HUMAN_REVIEW',
    category: 'THREATS',
    severity: 'HIGH',
    appeal_status: 'eligible',
    restriction_id: null,
    created_at: new Date().toISOString(),
  }
  harness.commentDecisions.set(id, attempt)
  const action = {
    id,
    admin_id: 'system:comment-moderation',
    action: 'comment.human_review',
    target_type: 'comment_submission',
    target_id: id,
    reason: 'The submitted comment requires human moderation before publication.',
  }
  harness.moderationActions.set(id, action)
  if (authority === 'case') {
    harness.moderationCases.set(`case-${id}`, {
      id: `case-${id}`,
      target_type: 'comment_submission',
      target_id: id,
      status: 'open',
      summary: `Comment submitted for human review: ${content}`,
      category: 'THREATS',
    })
  } else {
    harness.appeals.set(`appeal-${id}`, {
      id: `appeal-${id}`,
      user_id: 'student-1',
      moderation_action_id: id,
      status: 'pending',
    })
  }
  return { attempt, action, contentHash }
}

function enableLocalModerator() {
  const fetchCalls = []
  harness.localModerator = createCommentModerator({
    db: harness,
    env: {
      MODERATION_AI_ENABLED: 'false',
      GEMINI_FREE_TIER_CONFIRMED: 'false',
    },
    fetchImpl: async (...args) => {
      fetchCalls.push(args)
      throw new Error('Network access is disabled for the local-only integration test.')
    },
  })
  return fetchCalls
}

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true })
  delete globalThis.__campnectCommentIntegration
})

test('canonical /api/comments/moderate requires auth and supports text-only plus bound preflight contracts', async () => {
  resetHarness()
  const unauthenticated = await request('POST', '/api/comments/moderate', {
    text: 'Please review this comment.',
  }, { authenticated: false })
  assert.equal(unauthenticated.response.status, 401)
  assert.equal(harness.calls.length, 0)

  harness.assessments = ['WARN']
  const textOnly = await request('POST', '/api/comments/moderate', {
    text: 'Please review this comment.',
  })
  assert.equal(textOnly.response.status, 200, JSON.stringify(textOnly.body))
  assert.deepEqual(textOnly.body.moderation, {
    decision: 'WARN',
    severity: 'MEDIUM',
    category: 'LOW_LEVEL_HARASSMENT',
    requiresConfirmation: true,
  })
  assert.equal(harness.commentDecisions.size, 0, 'targetless UX checks do not create durable decision history')
  assert.equal(harness.moderationActions.size, 0, 'targetless UX checks do not create moderation actions')

  resetHarness()
  harness.assessments = ['WARN']
  const bound = await request('POST', '/api/comments/moderate', {
    post_id: 'post-1',
    text: 'Please review this comment.',
    parent_id: '',
  })
  assert.equal(bound.response.status, 409, JSON.stringify(bound.body))
  assert.equal(bound.body.moderation.decision, 'WARN')
  assert.equal(typeof bound.body.moderation.confirmationToken, 'string')
  assert.equal(harness.commentDecisions.size, 1)
  assert.equal([...harness.commentDecisions.values()][0].post_id, 'post-1')
})

test('real local-only moderation drives comment publication, warnings, blocks, and the staff review queue', async () => {
  resetHarness()
  const fetchCalls = enableLocalModerator()
  const sensitiveSafeExamples = [
    'We need more awareness about rape on college campuses.',
    'We need better suicide prevention resources on campus.',
  ]
  for (const content of sensitiveSafeExamples) {
    const published = await request('POST', '/api/posts/post-1/comments', { content })
    assert.equal(published.response.status, 201, JSON.stringify(published.body))
    assert.equal(published.body.data.content, content)
  }
  assert.equal(harness.comments.length, 2)
  assert.equal(harness.posts.get('post-1').comments_count, 2)

  const notificationsBeforeThreat = harness.notifications.length
  const commentsBeforeThreat = harness.comments.length
  const countBeforeThreat = harness.posts.get('post-1').comments_count
  const threat = await request('POST', '/api/posts/post-1/comments', {
    content: "I'm going to rape you.",
  })
  assert.equal(threat.response.status, 422, JSON.stringify(threat.body))
  assert.equal(threat.body.moderation.decision, 'BLOCK')
  assert.equal(harness.comments.length, commentsBeforeThreat)
  assert.equal(harness.posts.get('post-1').comments_count, countBeforeThreat)
  assert.equal(harness.notifications.length, notificationsBeforeThreat)

  const insultText = "You're an idiot."
  const warning = await request('POST', '/api/posts/post-1/comments', { content: insultText })
  assert.equal(warning.response.status, 409, JSON.stringify(warning.body))
  assert.equal(warning.body.moderation.decision, 'WARN')
  assert.equal(warning.body.moderation.requiresConfirmation, true)
  const confirmed = await request('POST', '/api/posts/post-1/comments', {
    content: insultText,
    moderationConfirmation: warning.body.moderation.confirmationToken,
  })
  assert.equal(confirmed.response.status, 201, JSON.stringify(confirmed.body))
  assert.equal(confirmed.body.data.content, insultText)

  const quotedThreat = 'Someone wrote “kill yourself” at our school. Reporting that incident is important.'
  const held = await request('POST', '/api/posts/post-1/comments', { content: quotedThreat })
  assert.equal(held.response.status, 422, JSON.stringify(held.body))
  assert.equal(held.body.moderation.decision, 'HUMAN_REVIEW')
  assert.equal(harness.comments.some((item) => item.content === quotedThreat), false)
  const heldCase = [...harness.moderationCases.values()].find((item) =>
    item.target_type === 'comment_submission' && item.status === 'open' &&
    item.summary.includes(quotedThreat),
  )
  assert.ok(heldCase, 'quoted threats requiring review should create an open staff case')

  const queue = await request('GET', '/v1/admin/cases?status=open')
  assert.equal(queue.response.status, 200, JSON.stringify(queue.body))
  assert.ok(queue.body.data.some((item) => item.id === heldCase.id && item.target_id === heldCase.target_id))
  const detail = await request('GET', `/v1/admin/cases/${heldCase.id}`)
  assert.equal(detail.response.status, 200, JSON.stringify(detail.body))
  assert.equal(detail.body.data.submission.content_text, quotedThreat)
  assert.equal(detail.body.data.submission.decision, 'HUMAN_REVIEW')
  assert.ok([...harness.commentDecisions.values()].every((item) => item.source === 'local'))
  assert.equal(fetchCalls.length, 0, 'local-only enforcement must not make provider requests')
})

test('commit-stage warning returns a bound token and accepts the UI camelCase confirmation exactly once', async () => {
  resetHarness()
  harness.assessments = ['WARN', 'WARN', 'WARN']
  const first = await request('POST', '/api/posts/post-1/comments', { content: 'A mild insult directed at a student.' })
  assert.equal(first.response.status, 409)
  const token = first.body.moderation.confirmationToken
  assert.equal(typeof token, 'string')
  assert.equal(JSON.stringify(first.body).includes('test-only internal classifier detail'), false)

  const accepted = await request('POST', '/api/posts/post-1/comments', {
    content: 'A mild insult directed at a student.',
    moderationConfirmation: token,
  })
  assert.equal(accepted.response.status, 201)
  assert.equal(harness.comments.length, 1)

  const replay = await request('POST', '/api/posts/post-1/comments', {
    content: 'A mild insult directed at a student.',
    moderationConfirmation: token,
  })
  assert.equal(replay.response.status, 409)
  assert.equal(harness.comments.length, 1)
})

test('preflight confirmations work and cannot authorize changed text', async () => {
  resetHarness()
  harness.assessments = ['WARN', 'WARN', 'WARN', 'WARN']
  const preflight = await request('POST', '/api/posts/post-1/comments/moderate', {
    content: 'A mild insult directed at a student.',
  })
  assert.equal(preflight.response.status, 409)
  const token = preflight.body.moderation.confirmationToken

  const changed = await request('POST', '/api/posts/post-1/comments', {
    content: 'A different mild insult directed at a student.',
    moderationConfirmation: token,
  })
  assert.equal(changed.response.status, 409)
  assert.equal(harness.comments.length, 0, JSON.stringify(harness.comments))

  const accepted = await request('POST', '/api/posts/post-1/comments', {
    content: 'A mild insult directed at a student.',
    moderationConfirmation: token,
  })
  assert.equal(accepted.response.status, 201)
  assert.equal(harness.comments.length, 1)
})

test('edit confirmations bind to the existing comment, and an unchanged edit is not a duplicate of itself', async () => {
  resetHarness()
  harness.comments.push({
    id: 'comment-1',
    post_id: 'post-1',
    user_id: 'student-1',
    parent_id: null,
    content: 'An existing comment.',
    likes_count: 0,
    created_at: new Date().toISOString(),
  })
  harness.assessments = ['WARN', 'WARN']
  const warned = await request('PATCH', '/api/posts/comments/comment-1', {
    content: 'A mild insult directed at a student.',
  })
  assert.equal(warned.response.status, 409, JSON.stringify(warned.body))
  const token = warned.body.moderation.confirmationToken
  const saved = await request('PATCH', '/api/posts/comments/comment-1', {
    content: 'A mild insult directed at a student.',
    moderationConfirmation: token,
  })
  assert.equal(saved.response.status, 200)
  assert.equal(harness.comments[0].content, 'A mild insult directed at a student.')
  assert.equal(harness.calls.every((call) => call.options.excludeCommentId === 'comment-1'), true)
})

test('spam and exact recent duplicate submissions return 429 with Retry-After and do not publish', async () => {
  resetHarness()
  const spam = {
    ...classification('BLOCK'),
    category: 'SPAM',
    severity: 'MEDIUM',
    reason: 'This comment appears to contain repetitive spam.',
  }
  harness.assessments = [spam]
  const blocked = await request('POST', '/api/posts/post-1/comments', {
    content: 'https://one.test https://two.test https://three.test',
  })
  assert.equal(blocked.response.status, 429, JSON.stringify(blocked.body))
  assert.equal(blocked.response.headers.get('retry-after'), '60')
  assert.equal(harness.comments.length, 0, JSON.stringify(harness.comments))

  harness.assessments = ['ALLOW', 'ALLOW']
  const text = 'A repeatable ordinary campus comment about the next student meeting.'
  const first = await request('POST', '/api/posts/post-1/comments', { content: text })
  assert.equal(first.response.status, 201)
  const duplicate = await request('POST', '/api/posts/post-1/comments', { content: text })
  assert.equal(duplicate.response.status, 429)
  assert.equal(harness.comments.length, 1)
})

test('admin case approval grants exact-draft resubmission without publishing or bypassing one-use commit checks', async () => {
  resetHarness()
  const content = 'A held draft that an authorized moderator has reviewed.'
  const { attempt } = seedHeldSubmission({ id: 'attempt-case-1', content })

  const detail = await request('GET', '/v1/admin/cases/case-attempt-case-1')
  assert.equal(detail.response.status, 200)
  assert.deepEqual(
    {
      id: detail.body.data.submission.id,
      user_id: detail.body.data.submission.user_id,
      post_id: detail.body.data.submission.post_id,
      operation: detail.body.data.submission.operation,
      content_text: detail.body.data.submission.content_text,
    },
    {
      id: attempt.id,
      user_id: 'student-1',
      post_id: 'post-1',
      operation: 'create',
      content_text: content,
    },
  )

  const approved = await request('PATCH', '/v1/admin/cases/case-attempt-case-1/comment-review', {
    decision: 'approved',
    reason: 'Reviewed the exact submitted draft and approve one resubmission.',
  })
  assert.equal(approved.response.status, 200, JSON.stringify(approved.body))
  assert.equal(approved.body.data.status, 'resolved')
  assert.equal(approved.body.data.decision, 'approved')
  assert.equal(harness.comments.length, 0, 'review approval must not auto-publish')
  assert.equal(harness.commentOverrides.size, 1)
  assert.equal([...harness.commentOverrides.values()][0].content_hash, attempt.content_hash)

  harness.assessments = ['BLOCK', 'BLOCK', 'BLOCK']
  const changed = await request('POST', '/api/posts/post-1/comments', { content: `${content} changed` })
  assert.equal(changed.response.status, 422)
  assert.equal(harness.comments.length, 0)

  const resubmitted = await request('POST', '/api/posts/post-1/comments', { content })
  assert.equal(resubmitted.response.status, 201, JSON.stringify(resubmitted.body))
  assert.equal(harness.comments.length, 1)
  assert.ok([...harness.commentOverrides.values()][0].consumed_at)

  const replay = await request('POST', '/api/posts/post-1/comments', { content })
  assert.equal(replay.response.status, 422)
  assert.equal(harness.comments.length, 1)
})

test('admin case rejection closes the held decision without creating a resubmission override', async () => {
  resetHarness()
  const { attempt } = seedHeldSubmission({
    id: 'attempt-case-reject',
    content: 'A draft rejected by a reviewer.',
  })
  const rejected = await request('PATCH', '/v1/admin/cases/case-attempt-case-reject/comment-review', {
    decision: 'rejected',
    reason: 'The reviewed draft cannot be resubmitted.',
  })
  assert.equal(rejected.response.status, 200, JSON.stringify(rejected.body))
  assert.equal(rejected.body.data.status, 'dismissed')
  assert.equal(rejected.body.data.decision, 'rejected')
  assert.equal(harness.commentOverrides.size, 0)
  assert.equal(harness.commentDecisions.get(attempt.id).appeal_status, 'rejected')
})

test('appeal approval grants the same bound resubmission allowance and no other draft', async () => {
  resetHarness()
  const content = 'An exact draft approved on appeal.'
  const { attempt } = seedHeldSubmission({ id: 'attempt-appeal-1', content, authority: 'appeal' })

  const approved = await request('PATCH', '/v1/admin/appeals/appeal-attempt-appeal-1', {
    status: 'approved',
    reason: 'Reviewed the appeal and approve exact-draft resubmission.',
  })
  assert.equal(approved.response.status, 200, JSON.stringify(approved.body))
  assert.equal(approved.body.data.status, 'approved')
  assert.equal(harness.comments.length, 0, 'appeal approval must not auto-publish')
  assert.equal(harness.commentOverrides.size, 1)

  harness.assessments = ['HUMAN_REVIEW', 'HUMAN_REVIEW']
  const wrongDraft = await request('POST', '/api/posts/post-1/comments', { content: 'A different draft.' })
  assert.equal(wrongDraft.response.status, 422)
  const exactDraft = await request('POST', '/api/posts/post-1/comments', { content })
  assert.equal(exactDraft.response.status, 201, JSON.stringify(exactDraft.body))
  assert.equal(harness.comments.length, 1)
  assert.equal([...harness.commentOverrides.values()][0].content_hash, attempt.content_hash)
})

test('appeal rejection creates no override or publication and leaves a later draft held', async () => {
  resetHarness()
  const content = 'A comment that remains held after appeal rejection.'
  const { attempt } = seedHeldSubmission({
    id: 'attempt-appeal-reject',
    content,
    authority: 'appeal',
  })
  const beforeCount = harness.posts.get('post-1').comments_count
  const rejected = await request('PATCH', '/v1/admin/appeals/appeal-attempt-appeal-reject', {
    status: 'rejected',
    reason: 'The original moderation decision is upheld.',
  })
  assert.equal(rejected.response.status, 200, JSON.stringify(rejected.body))
  assert.equal(harness.commentOverrides.size, 0)
  assert.equal(harness.comments.length, 0)
  assert.equal(harness.posts.get('post-1').comments_count, beforeCount)
  assert.equal(harness.commentDecisions.get(attempt.id).appeal_status, 'rejected')
  assert.equal(harness.notifications.length, 1, 'only the appeal decision notification is issued')

  const notificationCountAfterDecision = harness.notifications.length
  harness.assessments = ['HUMAN_REVIEW']
  const stillHeld = await request('POST', '/api/posts/post-1/comments', { content })
  assert.equal(stillHeld.response.status, 422, JSON.stringify(stillHeld.body))
  assert.equal(stillHeld.body.moderation.decision, 'HUMAN_REVIEW')
  assert.equal(harness.commentOverrides.size, 0)
  assert.equal(harness.comments.length, 0)
  assert.equal(harness.posts.get('post-1').comments_count, beforeCount)
  assert.equal(harness.notifications.length, notificationCountAfterDecision)
})

test('the real enforcement transaction counts independent severe drafts, not a repeated hash', async () => {
  resetHarness()
  const severe = {
    decision: 'BLOCK',
    category: 'THREATS',
    severity: 'HIGH',
    confidence: 0.95,
    targeted: true,
    intent: 'directed threat',
    reason: 'Severe test-only classification.',
    requiresConfirmation: false,
    requiresHumanReview: false,
    source: 'local',
  }
  harness.assessments = [severe, severe, severe, severe]
  const submit = (text) => assessCommentSubmission({
    userId: 'student-1',
    postId: 'post-1',
    operation: 'create',
    stage: 'commit',
    text,
  })

  await submit('Distinct severe draft A.')
  await submit('Distinct severe draft B.')
  assert.equal(harness.activeCommentRestriction, undefined)

  const priorA = [...harness.commentDecisions.values()]
    .find((item) => item.content_hash === crypto.createHash('sha256').update('Distinct severe draft A.').digest('hex'))
  priorA.created_at = new Date(Date.now() - 180_000).toISOString()
  await submit('Distinct severe draft A.')
  assert.equal(harness.activeCommentRestriction, undefined, 'a repeated hash is not an independent violation')

  await submit('Distinct severe draft C.')
  assert.equal(harness.activeCommentRestriction?.restriction_type, 'comments')
  const distinctHighBlocks = new Set([...harness.commentDecisions.values()]
    .filter((item) => item.decision === 'BLOCK' && item.severity === 'HIGH')
    .map((item) => item.content_hash))
  assert.equal(distinctHighBlocks.size, 3)
})

test('account appeal approval is limited to the latest matching sanction and preserves the other restriction', async () => {
  resetHarness()
  const action = {
    id: 'sanction-1',
    action: 'user.suspend',
    target_type: 'user',
    target_id: 'student-1',
    reason: 'A current suspension reason.',
  }
  harness.moderationActions.set(action.id, action)
  harness.appeals.set('account-appeal-1', {
    id: 'account-appeal-1',
    user_id: 'student-1',
    moderation_action_id: action.id,
    status: 'pending',
  })
  harness.latestSanctionAction = { id: action.id, action: action.action }
  harness.appealAccount = {
    id: 'student-1',
    is_suspended: 1,
    is_banned: 1,
    suspension_reason: action.reason,
    ban_reason: 'Unrelated active ban.',
  }

  const approved = await request('PATCH', '/v1/admin/appeals/account-appeal-1', {
    status: 'approved',
    reason: 'The linked suspension appeal was approved.',
  })
  assert.equal(approved.response.status, 200, JSON.stringify(approved.body))
  assert.equal(harness.appealAccount.is_suspended, 0)
  assert.equal(harness.appealAccount.suspension_reason, '')
  assert.equal(harness.appealAccount.is_banned, 1)
  assert.equal(harness.appealAccount.ban_reason, 'Unrelated active ban.')

  resetHarness()
  harness.moderationActions.set(action.id, action)
  harness.appeals.set('stale-account-appeal', {
    id: 'stale-account-appeal',
    user_id: 'student-1',
    moderation_action_id: action.id,
    status: 'pending',
  })
  harness.latestSanctionAction = { id: 'newer-action', action: 'user.ban' }
  harness.appealAccount = {
    id: 'student-1',
    is_suspended: 1,
    is_banned: 1,
    suspension_reason: action.reason,
    ban_reason: 'Newer ban.',
  }
  const stale = await request('PATCH', '/v1/admin/appeals/stale-account-appeal', {
    status: 'approved',
    reason: 'This action has been superseded.',
  })
  assert.equal(stale.response.status, 409)
  assert.equal(harness.appealAccount.is_suspended, 1)
  assert.equal(harness.appealAccount.is_banned, 1)
})