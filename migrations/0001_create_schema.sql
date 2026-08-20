CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL,
  token_hint TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  source_type TEXT NOT NULL CHECK (source_type IN ('raw', 'remote')),
  default_target TEXT NOT NULL,
  processors_json TEXT,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error TEXT
) STRICT;

CREATE UNIQUE INDEX subscriptions_token_hash_idx ON subscriptions(token_hash);
CREATE INDEX subscriptions_updated_at_idx ON subscriptions(updated_at DESC);

CREATE TABLE subscription_source_chunks (
  subscription_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL,
  PRIMARY KEY (subscription_id, chunk_index),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE compiled_artifacts (
  subscription_id TEXT NOT NULL,
  target TEXT NOT NULL,
  subscription_version INTEGER NOT NULL,
  etag TEXT NOT NULL,
  node_count INTEGER NOT NULL,
  response_headers_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (subscription_id, target),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE compiled_artifact_chunks (
  subscription_id TEXT NOT NULL,
  target TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL,
  PRIMARY KEY (subscription_id, target, chunk_index),
  FOREIGN KEY (subscription_id, target)
    REFERENCES compiled_artifacts(subscription_id, target) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;
