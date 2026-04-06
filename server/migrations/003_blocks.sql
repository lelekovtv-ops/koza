-- Screenplay blocks (normalized)

CREATE TABLE blocks (
  id            TEXT NOT NULL,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
    'scene_heading', 'action', 'character', 'parenthetical',
    'dialogue', 'transition', 'shot'
  )),
  text          TEXT NOT NULL DEFAULT '',
  "order"       INT NOT NULL DEFAULT 0,
  duration_ms   INT,
  duration_src  TEXT CHECK (duration_src IN ('auto', 'manual', 'media')),
  meta          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);

CREATE INDEX idx_blocks_order ON blocks (project_id, "order");
