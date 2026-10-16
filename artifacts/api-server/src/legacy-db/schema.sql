-- Campnect — Postgres schema
-- Timestamp columns: TIMESTAMPTZ DEFAULT NOW()
-- JSON columns: TEXT (keeps JSON.parse/stringify compatibility)
-- Boolean-like columns: SMALLINT DEFAULT 0

CREATE TABLE IF NOT EXISTS colleges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  domains TEXT NOT NULL DEFAULT '[]',
  country TEXT DEFAULT 'US',
  city TEXT,
  is_verified SMALLINT DEFAULT 1,
  logo_url TEXT,
  cover_url TEXT,
  about TEXT DEFAULT '',
  website TEXT,
  students_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  username TEXT UNIQUE NOT NULL,
  student_id TEXT,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  cover_url TEXT,
  bio TEXT DEFAULT '',
  college_id TEXT,
  college_name TEXT DEFAULT '',
  department TEXT DEFAULT '',
  course TEXT DEFAULT '',
  institute_post TEXT DEFAULT '',
  semester INTEGER DEFAULT 1,
  year INTEGER DEFAULT 1,
  interests TEXT DEFAULT '[]',
  skills TEXT DEFAULT '[]',
  social_links TEXT DEFAULT '{}',
  relationship_status TEXT NOT NULL DEFAULT 'hidden',
  privacy_settings TEXT DEFAULT '{"messageMe":"everyone","callMe":"friends","profileVisibility":"everyone","storiesVisibility":"everyone","showFollowers":true,"showFollowing":true,"showLastSeen":true,"showOnlineStatus":true,"readReceipts":true,"allowFriendRequests":true}',
  notification_prefs TEXT DEFAULT '{"likes":true,"comments":true,"follows":true,"mentions":true,"group_activity":true,"community_activity":true,"college_notices":true,"marketing":false}',
  is_email_verified SMALLINT DEFAULT 0,
  is_college_verified SMALLINT DEFAULT 0,
  verification_status TEXT DEFAULT 'pending',
  account_type TEXT DEFAULT 'public',
  user_role TEXT NOT NULL DEFAULT 'student',
  is_admin SMALLINT DEFAULT 0,
  admin_role TEXT,
  is_online SMALLINT DEFAULT 0,
  is_suspended SMALLINT DEFAULT 0,
  is_banned SMALLINT DEFAULT 0,
  is_shadowbanned SMALLINT DEFAULT 0,
  is_deactivated SMALLINT DEFAULT 0,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT DEFAULT '',
  ban_reason TEXT DEFAULT '',
  ban_ends_at TIMESTAMPTZ,
  suspension_reason TEXT DEFAULT '',
  suspension_ends_at TIMESTAMPTZ,
  warnings_count INTEGER DEFAULT 0,
  is_private SMALLINT DEFAULT 0,
  who_can_message TEXT DEFAULT 'everyone',
  last_seen TIMESTAMPTZ,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (college_id) REFERENCES colleges(id)
);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_college  ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_users_phone   ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_status  ON users(is_suspended, is_banned, is_deactivated);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_full_name_lower ON users(LOWER(full_name));

-- Signup details remain temporary until email ownership is proven. This keeps
-- abandoned OTP flows out of the users table and therefore out of the app.
CREATE TABLE IF NOT EXISTS pending_signups (
  email TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  college_id TEXT,
  college_name TEXT DEFAULT '',
  user_role TEXT NOT NULL DEFAULT 'student',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (college_id) REFERENCES colleges(id)
);
CREATE INDEX IF NOT EXISTS idx_pending_signups_expires ON pending_signups(expires_at);

-- Durable media storage. Uploaded bytes live in Supabase/Postgres instead of
-- the ephemeral application filesystem. Rows are immutable and retained until
-- an explicit privacy/data-retention job removes them.
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  entity_type TEXT NOT NULL DEFAULT 'upload',
  entity_id TEXT,
  purpose TEXT NOT NULL DEFAULT 'upload',
  data BYTEA NOT NULL,
  mime_type TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT 'upload',
  byte_size BIGINT NOT NULL,
  checksum TEXT NOT NULL,
  legacy_path TEXT,
  source_mime_type TEXT,
  source_byte_size BIGINT,
  optimization_status TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS legacy_path TEXT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS source_mime_type TEXT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS source_byte_size BIGINT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS optimization_status TEXT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS height INTEGER;
-- Storage metadata is additive: legacy BYTEA remains the rollback copy until
-- a separately verified retirement. New storage-backed rows retain an empty
-- non-null BYTEA marker so the existing invariant and old clients remain safe.
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS storage_status TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS storage_migrated_at TIMESTAMPTZ;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS storage_checksum TEXT;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS storage_byte_size BIGINT;
CREATE INDEX IF NOT EXISTS idx_media_assets_entity ON media_assets(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_storage_status ON media_assets(storage_status, created_at);
-- Keep an immutable asset bound to the entity that authorizes it. The same
-- bytes may be used by multiple posts/stories/messages and must not be
-- reassigned by a later upload.
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_checksum_owner_entity ON media_assets(owner_id, checksum, purpose, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_legacy_path ON media_assets(legacy_path) WHERE legacy_path IS NOT NULL;

-- Large Clip uploads arrive in small requests because the production gateway
-- rejects a single multipart body before it reaches the API. Chunks are owned
-- by one user, expire quickly, and are removed after publishing.
CREATE TABLE IF NOT EXISTS clip_upload_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  total_bytes BIGINT NOT NULL,
  chunk_size INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  create_data TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clip_upload_sessions_owner_expiry ON clip_upload_sessions(owner_id, expires_at);

CREATE TABLE IF NOT EXISTS clip_upload_chunks (
  upload_id TEXT NOT NULL REFERENCES clip_upload_sessions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data BYTEA NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (upload_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  device_info TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Separate Admin Panel sessions. These identities are backed by Replit
-- Secrets, not by rows in the student-facing users table.
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_username TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'system',
  resource_id TEXT,
  reason TEXT DEFAULT '',
  before_summary TEXT DEFAULT '{}',
  after_summary TEXT DEFAULT '{}',
  request_id TEXT,
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON admin_audit_logs(resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_security_events (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  event_type TEXT NOT NULL,
  email TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_security_events_created ON admin_security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_security_events_email ON admin_security_events(email, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  before_summary TEXT DEFAULT '{}',
  after_summary TEXT DEFAULT '{}',
  metadata TEXT DEFAULT '{}',
  request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_target ON moderation_actions(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_admin ON moderation_actions(admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS enforcement_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action_type TEXT NOT NULL,
  previous_status TEXT DEFAULT '{}',
  new_status TEXT DEFAULT '{}',
  reason TEXT DEFAULT '',
  internal_notes TEXT DEFAULT '',
  evidence TEXT DEFAULT '',
  moderator_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active SMALLINT DEFAULT 1,
  is_removed SMALLINT DEFAULT 0,
  removed_by TEXT,
  removed_at TIMESTAMPTZ,
  removal_reason TEXT DEFAULT '',
  linked_report_id TEXT,
  linked_appeal_id TEXT,
  audit_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_enforcement_history_user ON enforcement_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enforcement_history_filters ON enforcement_history(user_id, is_active, is_removed, action_type, created_at DESC);

-- Private case notes written by Admin Panel staff. These are never exposed
-- through student-facing routes.
CREATE TABLE IF NOT EXISTS admin_user_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_user_notes_user ON admin_user_notes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_user_notes_admin ON admin_user_notes(admin_id, created_at DESC);

-- Additive Admin operating-system records. Admin identities remain
-- secret-backed - these tables store moderation, workflow, and operational
-- history without changing the student authentication architecture.
CREATE TABLE IF NOT EXISTS user_warnings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL DEFAULT 'policy',
  reason TEXT NOT NULL,
  evidence TEXT DEFAULT '',
  linked_report_id TEXT,
  issued_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removed_by TEXT,
  removal_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_warnings_user ON user_warnings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_warnings_active ON user_warnings(user_id, removed_at, expires_at);

CREATE TABLE IF NOT EXISTS user_restrictions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restriction_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_restrictions_active
  ON user_restrictions(user_id, restriction_type)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_restrictions_user ON user_restrictions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_shadowban_controls (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  feed_visibility SMALLINT DEFAULT 1,
  search_visibility SMALLINT DEFAULT 1,
  discover_visibility SMALLINT DEFAULT 1,
  group_visibility SMALLINT DEFAULT 1,
  comment_visibility SMALLINT DEFAULT 1,
  event_visibility SMALLINT DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_trust_scores (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL DEFAULT 50,
  factors TEXT DEFAULT '{}',
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_trust_scores_score ON user_trust_scores(score DESC);

CREATE TABLE IF NOT EXISTS auth_login_history (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  identifier TEXT DEFAULT '',
  success SMALLINT DEFAULT 1,
  device_info TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  country TEXT DEFAULT '',
  city TEXT DEFAULT '',
  failure_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_login_history_user ON auth_login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_history_created ON auth_login_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_history_platform ON auth_login_history(platform, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_cases (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  case_type TEXT NOT NULL DEFAULT 'report',
  category TEXT NOT NULL DEFAULT 'other',
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to TEXT,
  escalation_level INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_cases_report ON moderation_cases(report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_cases_queue ON moderation_cases(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_target ON moderation_cases(target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moderation_case_notes_case ON moderation_case_notes(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES moderation_cases(id) ON DELETE SET NULL,
  moderation_action_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  evidence TEXT DEFAULT '',
  moderator_notes TEXT DEFAULT '',
  decision TEXT DEFAULT '',
  assigned_to TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appeals_queue ON appeals(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS appeal_history (
  id TEXT PRIMARY KEY,
  appeal_id TEXT NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  notes TEXT DEFAULT '',
  admin_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appeal_history_appeal ON appeal_history(appeal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_moderation (
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_hidden SMALLINT DEFAULT 0,
  is_flagged SMALLINT DEFAULT 0,
  age_restricted SMALLINT DEFAULT 0,
  sensitive_flag TEXT DEFAULT '',
  moderator_notes TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  updated_by TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  restored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (content_type, content_id)
);
CREATE INDEX IF NOT EXISTS idx_content_moderation_queue ON content_moderation(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_moderation_type ON content_moderation(content_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS verification_events (
  id TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  verification_type TEXT DEFAULT 'student',
  notes TEXT DEFAULT '',
  admin_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verification_events_verification ON verification_events(verification_id, created_at DESC);

CREATE TABLE IF NOT EXISTS verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verification_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  documents TEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  reviewer_id TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verification_requests_queue ON verification_requests(verification_type, status, submitted_at ASC);
CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON verification_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS report_assignments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_report_assignments_report ON report_assignments(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_assignments_admin ON report_assignments(admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notification_campaigns (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'announcement',
  audience_type TEXT NOT NULL DEFAULT 'targeted',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_filter TEXT DEFAULT '{}',
  delivery_type TEXT NOT NULL DEFAULT 'in_app',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_notification_campaigns_queue ON admin_notification_campaigns(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_admin_notification_campaigns_created ON admin_notification_campaigns(created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notification_deliveries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES admin_notification_campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT DEFAULT '',
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_notification_deliveries_campaign ON admin_notification_deliveries(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notification_deliveries_user ON admin_notification_deliveries(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notification_templates (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'announcement',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  display_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'read_only',
  permissions TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'invited',
  mfa_enabled SMALLINT DEFAULT 0,
  invited_by TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_status ON admin_accounts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  type TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otps_email_type ON otps(email, type);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT DEFAULT '',
  media TEXT DEFAULT '[]',
  poll_options TEXT,
  poll_votes TEXT DEFAULT '{}',
  tags TEXT DEFAULT '[]',
  college_id TEXT,
  community_id TEXT,
  visibility TEXT DEFAULT 'public',
  location TEXT,
  filter TEXT,
  duration NUMERIC,
  cover_url TEXT,
  trim_start NUMERIC,
  trim_end NUMERIC,
  playback_speed NUMERIC DEFAULT 1,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_posts_user    ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_college ON posts(college_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_type    ON posts(type);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS discovery_restricted SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE INDEX IF NOT EXISTS idx_posts_event ON posts(event_id);
CREATE INDEX IF NOT EXISTS idx_posts_moderation ON posts(type, moderation_status, discovery_restricted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_glimpse_creator_visibility ON posts(type, user_id, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_feed_cursor ON posts(created_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_clip_idempotency ON posts(user_id, idempotency_key) WHERE type = 'reel' AND idempotency_key IS NOT NULL;

-- One counted Clip view per authenticated viewer per hour.
CREATE TABLE IF NOT EXISTS clip_view_events (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, viewer_id)
);

-- One counted Glimpse view per authenticated viewer. Replays may refresh the
-- viewer's timestamp, but never inflate the creator's audience count.
CREATE TABLE IF NOT EXISTS glimpse_view_events (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_glimpse_view_events_recent ON glimpse_view_events(post_id, viewed_at DESC);

-- Server-side Glimpse quota. The unique user/day row is incremented atomically
-- during publication so concurrent devices cannot bypass the daily limit.
CREATE TABLE IF NOT EXISTS glimpse_daily_limits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key DATE NOT NULL,
  published_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, day_key)
);
CREATE INDEX IF NOT EXISTS idx_glimpse_daily_limits_day ON glimpse_daily_limits(day_key);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_saves (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  parent_id TEXT,
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- Disposable rate-limit records are purged after 24 hours.
-- Only hashes are retained here. Durable review evidence lives separately.
CREATE TABLE IF NOT EXISTS comment_moderation_rate_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comment_moderation_rate_user_time
  ON comment_moderation_rate_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comment_moderation_rate_created_at
  ON comment_moderation_rate_attempts(created_at);

-- Durable, privacy-minimized moderation decisions and appeals. Unlike the
-- disposable rate table above, this review history is retained.
CREATE TABLE IF NOT EXISTS comment_moderation_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  target_comment_id TEXT,
  operation TEXT NOT NULL DEFAULT 'classification',
  request_stage TEXT NOT NULL DEFAULT 'commit',
  content_hash TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'ALLOW',
  category TEXT NOT NULL DEFAULT 'SAFE',
  severity TEXT NOT NULL DEFAULT 'NONE',
  source TEXT NOT NULL DEFAULT 'local',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  targeted SMALLINT NOT NULL DEFAULT 0,
  intent TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  requires_confirmation SMALLINT NOT NULL DEFAULT 0,
  requires_human_review SMALLINT NOT NULL DEFAULT 0,
  approved_override_id TEXT,
  confirmation_nonce_hash TEXT,
  confirmation_expires_at TIMESTAMPTZ,
  confirmation_used_at TIMESTAMPTZ,
  restriction_id TEXT,
  appeal_status TEXT NOT NULL DEFAULT 'not_appealable',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comment_moderation_decisions_user_created
  ON comment_moderation_decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comment_moderation_decisions_user_hash
  ON comment_moderation_decisions(user_id, content_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comment_moderation_decisions_post
  ON comment_moderation_decisions(post_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_moderation_decisions_nonce
  ON comment_moderation_decisions(confirmation_nonce_hash)
  WHERE confirmation_nonce_hash IS NOT NULL;

-- Human approval permits exactly the same user to resubmit the exact moderated
-- draft for the same target/operation for a short window. It never publishes it.
CREATE TABLE IF NOT EXISTS comment_moderation_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  parent_id TEXT,
  target_comment_id TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('create','edit')),
  content_hash TEXT NOT NULL,
  authority_type TEXT NOT NULL CHECK (authority_type IN ('appeal','moderation_case')),
  authority_id TEXT NOT NULL,
  moderation_action_id TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (authority_type, authority_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_moderation_overrides_exact
  ON comment_moderation_overrides(user_id, post_id, content_hash, expires_at DESC)
  WHERE consumed_at IS NULL;

-- Gemini calls are additionally capped by atomic global daily and monthly
-- application quotas in the server-only classifier.
CREATE TABLE IF NOT EXISTS moderation_ai_usage (
  period_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  PRIMARY KEY (period_type, period_start)
);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'image',
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration INTEGER DEFAULT 5,
  caption TEXT DEFAULT '',
  bg_color TEXT DEFAULT '#080810',
  filter TEXT DEFAULT 'none',
  expires_at TIMESTAMPTZ NOT NULL,
  views_count INTEGER DEFAULT 0,
  is_highlight SMALLINT DEFAULT 0,
  highlight_id TEXT,
  visibility TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stories_user    ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);

CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id);

CREATE TABLE IF NOT EXISTS highlight_stories (
  id TEXT PRIMARY KEY,
  highlight_id TEXT NOT NULL,
  story_id TEXT,
  media_url TEXT NOT NULL,
  type TEXT DEFAULT 'photo',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_highlight_stories_hl ON highlight_stories(highlight_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower  ON follows(follower_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'private',
  name TEXT,
  description TEXT DEFAULT '',
  avatar_url TEXT,
  event_id TEXT,
  created_by TEXT NOT NULL,
  last_message_id TEXT,
  last_message_preview TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ,
  members_count INTEGER DEFAULT 2,
  is_request SMALLINT DEFAULT 0,
  invite_link TEXT,
  invite_link_active SMALLINT DEFAULT 0,
  requires_approval SMALLINT DEFAULT 0,
  pinned_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  tag TEXT DEFAULT '',
  admin_rights TEXT DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  is_muted SMALLINT DEFAULT 0,
  is_archived SMALLINT DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  reply_to_id TEXT,
  is_edited SMALLINT DEFAULT 0,
  is_deleted SMALLINT DEFAULT 0,
  is_pinned SMALLINT DEFAULT 0,
  forwarded_from TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
ALTER TABLE message_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE message_requests ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

CREATE TABLE IF NOT EXISTS join_requests (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  message TEXT DEFAULT '',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  UNIQUE(conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_id TEXT,
  entity_id TEXT,
  entity_type TEXT,
  content TEXT DEFAULT '',
  extra_data TEXT DEFAULT '{}',
  is_read SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  avatar_url TEXT,
  cover_url TEXT,
  category TEXT DEFAULT 'General',
  is_private SMALLINT DEFAULT 0,
  members_count INTEGER DEFAULT 1,
  posts_count INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  college_id TEXT,
  conversation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug);

CREATE TABLE IF NOT EXISTS community_members (
  community_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT DEFAULT 'meetup',
  category TEXT DEFAULT 'Social',
  visibility TEXT NOT NULL DEFAULT 'public',
  organizer_id TEXT NOT NULL,
  community_id TEXT,
  college_id TEXT,
  location_type TEXT NOT NULL DEFAULT 'inside',
  location TEXT DEFAULT '',
  address TEXT DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_online SMALLINT DEFAULT 0,
  meeting_link TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  max_attendees INTEGER,
  attendees_count INTEGER DEFAULT 0,
  allow_waitlist SMALLINT DEFAULT 0,
  waitlist_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming',
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT DEFAULT '',
  ended_at TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  cover_url TEXT,
  tags TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'going',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS event_hosts (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'host',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_hosts_user ON event_hosts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_saves (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_saves_user ON event_saves(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_invitations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (event_id, invited_user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_invitations_user ON event_invitations(invited_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS event_waitlist (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_waitlist_event ON event_waitlist(event_id, position);

CREATE TABLE IF NOT EXISTS event_announcements (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_announcements_event ON event_announcements(event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS college_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  college_id TEXT,
  id_photo_url TEXT NOT NULL,
  selfie_url TEXT NOT NULL,
  ocr_name TEXT,
  status TEXT DEFAULT 'pending',
  reviewer_id TEXT,
  review_notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alumni_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  message TEXT DEFAULT '',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS user_profile_restrictions (
  restrictor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restricted_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (restrictor_id, restricted_id),
  CHECK (restrictor_id <> restricted_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_entity ON reports(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- Single-row global toggle read by every client (web + APK) on load and on a
-- short poll interval, so an admin flip takes effect without any app rebuild
-- or republish.
CREATE TABLE IF NOT EXISTS maintenance_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  CHECK (id = 1)
);
INSERT INTO maintenance_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- A separate release notice keeps optional and mandatory Play Store updates
-- independent from maintenance mode, which blocks all normal API traffic.
CREATE TABLE IF NOT EXISTS app_update_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'soft' CHECK (mode IN ('soft', 'force')),
  title TEXT NOT NULL DEFAULT 'A new version of Campnect is ready',
  message TEXT NOT NULL DEFAULT 'Update now for the latest features and improvements.',
  play_store_url TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.campnect.app',
  minimum_version_code INTEGER NOT NULL DEFAULT 14 CHECK (minimum_version_code >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  CHECK (id = 1)
);
ALTER TABLE app_update_state ADD COLUMN IF NOT EXISTS minimum_version_code INTEGER NOT NULL DEFAULT 14;
ALTER TABLE app_update_state ALTER COLUMN minimum_version_code SET DEFAULT 14;
UPDATE app_update_state SET minimum_version_code = 14 WHERE minimum_version_code < 1;
INSERT INTO app_update_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
