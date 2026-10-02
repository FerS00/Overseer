CREATE TABLE IF NOT EXISTS agent_sessions (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  agent VARCHAR(16) NOT NULL,
  cwd VARCHAR(2000),
  model VARCHAR(256),
  started_at VARCHAR(64) NOT NULL,
  last_event_at VARCHAR(64) NOT NULL,
  ended_at VARCHAR(64),
  parent_session_id VARCHAR(128)
);
CREATE INDEX idx_sessions_agent_last ON agent_sessions(agent, last_event_at);
CREATE INDEX idx_sessions_parent ON agent_sessions(parent_session_id);
