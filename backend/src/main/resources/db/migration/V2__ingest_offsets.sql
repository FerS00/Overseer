CREATE TABLE IF NOT EXISTS ingest_offsets (
  source_path VARCHAR(1024) NOT NULL PRIMARY KEY,
  file_offset BIGINT NOT NULL,
  updated_at VARCHAR(64) NOT NULL
);

ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS uid VARCHAR(64);
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS session_id VARCHAR(128);
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS parent_session_id VARCHAR(128);
ALTER TABLE agent_events ADD COLUMN IF NOT EXISTS source VARCHAR(16);

UPDATE agent_events SET uid = CONCAT('legacy-', id) WHERE uid IS NULL;
UPDATE agent_events SET source = 'ingest' WHERE source IS NULL;
CREATE UNIQUE INDEX idx_agent_events_uid ON agent_events(uid);
