CREATE TABLE IF NOT EXISTS agent_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(64),
  ts VARCHAR(64) NOT NULL,
  agent VARCHAR(64) NOT NULL,
  session_id VARCHAR(128),
  parent_session_id VARCHAR(128),
  source VARCHAR(16) NOT NULL,
  type VARCHAR(32) NOT NULL,
  status VARCHAR(32),
  title VARCHAR(1000),
  detail TEXT,
  tool VARCHAR(128),
  meta_json TEXT
);
