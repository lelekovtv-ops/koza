-- Operation log (append-only)

CREATE TABLE operations (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,      -- 'block.update', 'shot.create', 'settings.set'
  entity_id   TEXT,               -- block id / shot id / null
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_operations_project ON operations (project_id, id);
CREATE INDEX idx_operations_project_created ON operations (project_id, created_at);
