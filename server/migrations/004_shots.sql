-- Shots (normalized)

CREATE TABLE shots (
  id              TEXT NOT NULL,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id        TEXT,
  parent_block_id TEXT,
  "order"         INT NOT NULL DEFAULT 0,
  duration        INT NOT NULL DEFAULT 3000,
  shot_size       TEXT NOT NULL DEFAULT '',
  camera_motion   TEXT NOT NULL DEFAULT '',
  caption         TEXT NOT NULL DEFAULT '',
  director_note   TEXT NOT NULL DEFAULT '',
  camera_note     TEXT NOT NULL DEFAULT '',
  image_prompt    TEXT NOT NULL DEFAULT '',
  video_prompt    TEXT NOT NULL DEFAULT '',
  thumbnail_url   TEXT,
  original_url    TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);

CREATE INDEX idx_shots_scene ON shots (project_id, scene_id);
CREATE INDEX idx_shots_block ON shots (project_id, parent_block_id);
CREATE INDEX idx_shots_order ON shots (project_id, "order");
