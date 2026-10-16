-- ============================================================
-- Campnect Recommendation System — Additional Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS post_classifications (
  post_id        TEXT PRIMARY KEY,
  categories     TEXT  DEFAULT '[]',
  is_political   SMALLINT DEFAULT 0,
  is_campus_pol  SMALLINT DEFAULT 0,
  safety_flag    TEXT  DEFAULT 'none',
  safety_score   REAL  DEFAULT 1.0,
  quality_score  REAL  DEFAULT 0.5,
  classified_at  TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pc_post      ON post_classifications(post_id);
CREATE INDEX IF NOT EXISTS idx_pc_political ON post_classifications(is_political);
CREATE INDEX IF NOT EXISTS idx_pc_safety    ON post_classifications(safety_flag);

CREATE TABLE IF NOT EXISTS content_interactions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  post_id          TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  watch_pct        REAL DEFAULT 0,
  watch_seconds    REAL DEFAULT 0,
  signal_weight    REAL DEFAULT 1.0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id)  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ci_user_type ON content_interactions(user_id, interaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ci_post      ON content_interactions(post_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_ci_user_time ON content_interactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_interest_profiles (
  user_id            TEXT PRIMARY KEY,
  topic_weights      TEXT DEFAULT '{}',
  negative_creators  TEXT DEFAULT '[]',
  preferred_creators TEXT DEFAULT '[]',
  seen_posts         TEXT DEFAULT '[]',
  last_updated       TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rec_feedback (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  post_id     TEXT,
  creator_id  TEXT,
  category    TEXT,
  action      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rf_user    ON rec_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rf_creator ON rec_feedback(user_id, creator_id);

CREATE TABLE IF NOT EXISTS rec_impressions (
  user_id   TEXT NOT NULL,
  post_id   TEXT NOT NULL,
  feed_type TEXT NOT NULL DEFAULT 'for_you',
  shown_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id, feed_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ri_user_feed ON rec_impressions(user_id, feed_type, shown_at DESC);

CREATE TABLE IF NOT EXISTS reel_distribution (
  post_id            TEXT PRIMARY KEY,
  phase              TEXT DEFAULT 'initial',
  satisfaction_score REAL DEFAULT 0,
  test_views         INTEGER DEFAULT 0,
  positive_signals   INTEGER DEFAULT 0,
  phase_updated_at   TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trending_cache (
  post_id     TEXT NOT NULL,
  scope       TEXT NOT NULL,
  trend_score REAL DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, scope),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tc_scope ON trending_cache(scope, trend_score DESC, computed_at DESC);
