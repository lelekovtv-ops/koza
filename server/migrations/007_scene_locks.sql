-- Scene locks for collaborative editing

CREATE TABLE scene_locks (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id    TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id),
  locked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  PRIMARY KEY (project_id, scene_id)
);

-- Auto-cleanup expired locks (called periodically by WS server)
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM scene_locks WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
