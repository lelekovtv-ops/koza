-- Project settings (JSONB — bible, voice, breakdown config, etc.)

CREATE TABLE project_settings (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  store_key   TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, store_key)
);

-- User-level settings (theme, screenplay preferences)

CREATE TABLE user_settings (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_key   TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_key)
);
