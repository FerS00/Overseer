package com.agentops.service;

import com.agentops.config.AppProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

@Service
public class SessionTracker {
  private final JdbcTemplate jdbc;
  private final Clock clock;
  private final Duration idleAfter;

  @org.springframework.beans.factory.annotation.Autowired
  public SessionTracker(JdbcTemplate jdbc, Clock clock, AppProperties properties) {
    this(jdbc, clock, Duration.ofMinutes(properties.getSessionIdleMinutes()));
  }

  public SessionTracker(JdbcTemplate jdbc, Clock clock, Duration idleAfter) {
    this.jdbc = jdbc; this.clock = clock; this.idleAfter = idleAfter;
  }

  public synchronized void accept(Map<String, Object> event) {
    String agent = String.valueOf(event.get("agent"));
    if (!Set.of("claude", "codex").contains(agent)) return;
    String id = text(event.get("session_id"), agent + ":default");
    String parent = nullable(event.get("parent_session_id"));
    String type = String.valueOf(event.get("type"));
    Instant eventAt = eventInstant(event.get("ts"));
    String at = eventAt.toString();
    Map<?, ?> meta = event.get("meta") instanceof Map<?, ?> m ? m : Map.of();
    String cwd = nullable(meta.get("cwd"));
    String model = nullable(meta.get("model"));
    List<Map<String, Object>> rows = jdbc.queryForList("SELECT id, cwd, model, started_at, last_event_at, ended_at, parent_session_id FROM agent_sessions WHERE id = ?", id);
    if (rows.isEmpty()) {
      jdbc.update("INSERT INTO agent_sessions(id, agent, cwd, model, started_at, last_event_at, ended_at, parent_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          id, agent, cwd, model, at, at, "session_end".equals(type) ? at : null, parent);
      return;
    }
    Map<String, Object> existing = normalizeColumns(rows.get(0));
    Instant startedAt = Instant.parse(String.valueOf(existing.get("started_at")));
    Instant lastEventAt = Instant.parse(String.valueOf(existing.get("last_event_at")));
    Object priorEnded = existing.get("ended_at");
    Instant endedAt = priorEnded == null ? null : Instant.parse(String.valueOf(priorEnded));
    Instant nextStartedAt = eventAt.isBefore(startedAt) ? eventAt : startedAt;
    Instant nextLastEventAt = eventAt.isAfter(lastEventAt) ? eventAt : lastEventAt;
    Instant nextEndedAt = endedAt;
    if ("session_end".equals(type)) {
      if (!eventAt.isBefore(lastEventAt) && (endedAt == null || eventAt.isAfter(endedAt))) nextEndedAt = eventAt;
    } else if (endedAt != null && eventAt.isAfter(endedAt)) {
      nextEndedAt = null;
    }
    jdbc.update("UPDATE agent_sessions SET cwd = ?, model = ?, started_at = ?, last_event_at = ?, ended_at = ?, parent_session_id = ? WHERE id = ?",
        cwd == null ? existing.get("cwd") : cwd,
        model == null ? existing.get("model") : model,
        nextStartedAt.toString(), nextLastEventAt.toString(), nextEndedAt == null ? null : nextEndedAt.toString(),
        parent == null ? existing.get("parent_session_id") : parent, id);
  }

  public List<Map<String, Object>> list(String agent, Boolean active) {
    List<Map<String, Object>> rows = agent == null || agent.isBlank()
        ? jdbc.queryForList("SELECT * FROM agent_sessions ORDER BY last_event_at DESC")
        : jdbc.queryForList("SELECT * FROM agent_sessions WHERE agent = ? ORDER BY last_event_at DESC", agent);
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> source : rows) {
      Map<String, Object> row = normalizeColumns(source);
      List<String> actions = jdbc.query("SELECT title FROM agent_events WHERE agent = ? AND session_id = ? ORDER BY id DESC LIMIT 1",
          (result, index) -> result.getString(1), String.valueOf(row.get("agent")), String.valueOf(row.get("id")));
      row.put("last_action", actions.isEmpty() ? "" : actions.get(0));
      String ended = nullable(row.get("ended_at"));
      Instant last = Instant.parse(String.valueOf(row.get("last_event_at")));
      Instant endedAt = ended == null ? null : Instant.parse(ended);
      String state = SessionStateMachine.state(last, endedAt, clock, idleAfter);
      row.put("state", state);
      row.put("parentSessionId", row.get("parent_session_id"));
      if (active == null || (active == state.equals("active"))) out.add(row);
    }
    return out;
  }

  public List<Map<String, Object>> activeByAgent() {
    Map<String, Long> counts = new HashMap<>();
    Instant now = clock.instant();
    for (Map<String, Object> source : jdbc.queryForList("SELECT agent, last_event_at, ended_at FROM agent_sessions")) {
      Map<String, Object> row = normalizeColumns(source);
      if (row.get("ended_at") != null) continue;
      Instant lastEventAt = Instant.parse(String.valueOf(row.get("last_event_at")));
      if (Duration.between(lastEventAt, now).compareTo(idleAfter) < 0) {
        String agent = String.valueOf(row.get("agent"));
        counts.merge(agent, 1L, Long::sum);
      }
    }
    return com.agentops.config.AgentProfiles.all().stream()
        .map(profile -> Map.<String, Object>of("agent", profile.id(), "activeSessions", counts.getOrDefault(profile.id(), 0L)))
        .toList();
  }

  private Instant eventInstant(Object value) {
    if (value == null || String.valueOf(value).isBlank()) return clock.instant();
    String timestamp = String.valueOf(value).trim();
    try { return Instant.parse(timestamp); }
    catch (Exception ignored) { return OffsetDateTime.parse(timestamp).toInstant(); }
  }

  private static Map<String, Object> normalizeColumns(Map<String, Object> source) {
    Map<String, Object> normalized = new LinkedHashMap<>();
    source.forEach((key, value) -> normalized.put(key.toLowerCase(Locale.ROOT), value));
    return normalized;
  }

  private static String text(Object value, String fallback) { return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value); }
  private static String nullable(Object value) { return value == null || String.valueOf(value).isBlank() ? null : String.valueOf(value); }
}
