package com.agentops.service;

import com.agentops.model.AgentEvent;
import com.agentops.repository.AgentEventRepository;
import com.agentops.config.AgentProfiles;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.LongAdder;

@Service
public class EventStoreService {
  private static final Logger log = LoggerFactory.getLogger(EventStoreService.class);
  private static final int MAX_BUFFER = 3000;
  private static final Set<String> TYPES = Set.of("session_start", "user_prompt", "thinking", "message", "tool_use",
      "tool_result", "handoff", "turn_end", "session_end", "error", "note", "permission_request");
  private final AgentEventRepository repository;
  private final SseBroadcaster broadcaster;
  private final ObjectMapper objectMapper;
  private final SessionTracker sessionTracker;
  private final JdbcTemplate jdbc;
  private final Deque<Map<String, Object>> buffer = new ConcurrentLinkedDeque<>();
  private final Map<String, LongAdder> discarded = new ConcurrentHashMap<>();
  private final Set<String> activeSources = ConcurrentHashMap.newKeySet();
  private volatile String lastRollout;
  private volatile String lastRolloutAt;

  @org.springframework.beans.factory.annotation.Autowired
  public EventStoreService(AgentEventRepository repository, SseBroadcaster broadcaster, ObjectMapper objectMapper,
                           SessionTracker sessionTracker, JdbcTemplate jdbc) {
    this.repository = repository; this.broadcaster = broadcaster; this.objectMapper = objectMapper;
    this.sessionTracker = sessionTracker; this.jdbc = jdbc;
  }

  public EventStoreService(AgentEventRepository repository, SseBroadcaster broadcaster, ObjectMapper objectMapper) {
    this(repository, broadcaster, objectMapper, null, null);
  }

  @PostConstruct
  public void loadHistory() {
    try {
      List<AgentEvent> recent = new ArrayList<>(repository.findAll(PageRequest.of(0, 200, Sort.by(Sort.Direction.DESC, "id"))).getContent());
      Collections.reverse(recent);
      for (AgentEvent a : recent) if (AgentProfiles.supports(a.getAgent())) buffer.addLast(a.toMap(objectMapper));
    } catch (Exception e) { log.warn("No se pudo cargar el historial ({}): {}", e.getClass().getSimpleName(), e.getMessage()); }
  }

  public boolean publish(Map<String, Object> raw) {
    Map<String, Object> ev = normalize(raw);
    if (ev == null) return false;
    String uid = String.valueOf(ev.get("uid"));
    try {
      if (repository.existsByUid(uid)) { count("duplicate_uid"); return false; }
      AgentEvent saved = repository.saveAndFlush(AgentEvent.fromMap(ev, objectMapper));
      ev.put("id", saved.getId());
      if (sessionTracker != null) sessionTracker.accept(ev);
      markSourceActive(String.valueOf(ev.get("source")));
      buffer.addLast(ev);
      while (buffer.size() > MAX_BUFFER) buffer.pollFirst();
      broadcaster.broadcast(ev);
      return true;
    } catch (org.springframework.dao.DataIntegrityViolationException e) {
      count("duplicate_uid");
      return false;
    } catch (Exception e) {
      count("persistence_error");
      log.warn("Persistencia omitida: {}", e.getMessage());
      throw new IllegalStateException("Event persistence failed; ingestion offset must not advance", e);
    }
  }

  public List<Map<String, Object>> getRecent(int limit) {
    List<Map<String, Object>> all = new ArrayList<>(buffer);
    int n = Math.min(Math.max(limit, 0), all.size());
    return all.subList(all.size() - n, all.size());
  }

  public List<Map<String, Object>> getRecent(int limit, String agent, String session, String type, String query, String before) {
    List<Map<String, Object>> all = new ArrayList<>(buffer);
    List<Map<String, Object>> filtered = all.stream().filter(e -> agent == null || agent.isBlank() || agent.equals(e.get("agent")))
        .filter(e -> session == null || session.isBlank() || session.equals(e.get("session_id")))
        .filter(e -> type == null || type.isBlank() || type.equals(e.get("type")))
        .filter(e -> query == null || query.isBlank() || (String.valueOf(e.get("title")) + " " + e.get("detail") + " " + e.get("tool")).toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT)))
        .filter(e -> before == null || before.isBlank() || String.valueOf(e.get("ts")).compareTo(before) < 0).toList();
    int requested = countForRequest(limit);
    int count = Math.min(requested, filtered.size());
    boolean needsDatabase = (before != null && !before.isBlank()) || filtered.size() < requested;
    if (!needsDatabase || jdbc == null || requested == 0) return filtered.subList(filtered.size() - count, filtered.size());
    return getRecentFromDatabase(requested, agent, session, type, query, before);
  }

  private int countForRequest(int limit) { return Math.min(Math.max(0, limit), 500); }

  private List<Map<String, Object>> getRecentFromDatabase(int limit, String agent, String session, String type, String query, String before) {
    StringBuilder sql = new StringBuilder("SELECT id FROM agent_events WHERE agent IN ('claude', 'codex')");
    List<Object> args = new ArrayList<>();
    if (agent != null && !agent.isBlank()) { sql.append(" AND agent = ?"); args.add(agent); }
    if (session != null && !session.isBlank()) { sql.append(" AND session_id = ?"); args.add(session); }
    if (type != null && !type.isBlank()) { sql.append(" AND type = ?"); args.add(type); }
    if (query != null && !query.isBlank()) {
      sql.append(" AND (LOWER(COALESCE(title, '')) LIKE ? OR LOWER(COALESCE(detail, '')) LIKE ? OR LOWER(COALESCE(tool, '')) LIKE ?)");
      String like = "%" + query.toLowerCase(Locale.ROOT) + "%";
      args.add(like); args.add(like); args.add(like);
    }
    if (before != null && !before.isBlank()) { sql.append(" AND ts < ?"); args.add(normalizeBefore(before)); }
    sql.append(" ORDER BY id DESC LIMIT ?"); args.add(limit);
    List<Long> ids = jdbc.query(sql.toString(), (result, row) -> result.getLong(1), args.toArray());
    if (ids.isEmpty()) return List.of();
    Map<Long, AgentEvent> byId = new HashMap<>();
    repository.findAllById(ids).forEach(event -> byId.put(event.getId(), event));
    List<Map<String, Object>> events = new ArrayList<>();
    for (int index = ids.size() - 1; index >= 0; index--) {
      AgentEvent event = byId.get(ids.get(index));
      if (event != null && AgentProfiles.supports(event.getAgent())) events.add(event.toMap(objectMapper));
    }
    return events;
  }

  private static String normalizeBefore(String value) {
    try { return OffsetDateTime.parse(value.trim()).toInstant().toString(); }
    catch (DateTimeParseException ignored) { return value; }
  }

  public List<Map<String, Object>> getAfter(long id) {
    return repository.findTop500ByIdGreaterThanOrderByIdAsc(id).stream().filter(e -> AgentProfiles.supports(e.getAgent())).map(e -> e.toMap(objectMapper)).toList();
  }

  public Map<String, Object> getState() {
    Map<String, Integer[]> perAgent = new LinkedHashMap<>(); int total = 0, tools = 0; String lastTs = null;
    for (Map<String, Object> e : buffer) {
      total++; String agent = String.valueOf(e.get("agent")); String type = String.valueOf(e.get("type"));
      Integer[] c = perAgent.computeIfAbsent(agent, k -> new Integer[]{0, 0}); c[0]++;
      if ("tool_use".equals(type) || "tool_result".equals(type)) { c[1]++; tools++; }
      lastTs = String.valueOf(e.get("ts"));
    }
    List<Map<String, Object>> agents = new ArrayList<>();
    for (Map.Entry<String, Integer[]> en : perAgent.entrySet()) agents.add(Map.of("agent", en.getKey(), "events", en.getValue()[0], "tools", en.getValue()[1]));
    Map<String, Object> state = new LinkedHashMap<>(); state.put("total", total); state.put("tools", tools); state.put("lastTs", lastTs); state.put("agents", agents);
    if (sessionTracker != null) state.put("sessions", sessionTracker.activeByAgent());
    return state;
  }

  public void markSourceActive(String source) { activeSources.add(source); }
  public void discard(String reason) { count(reason); }
  public void markRolloutRead(String path) { lastRollout = path; lastRolloutAt = Instant.now().toString(); markSourceActive("rollout"); }
  public Map<String, Object> diagnostics() {
    Map<String, Long> counts = new TreeMap<>(); discarded.forEach((k, v) -> counts.put(k, v.sum()));
    Map<String, Object> d = new LinkedHashMap<>(); d.put("discarded", counts); d.put("active_sources", new TreeSet<>(activeSources));
    d.put("last_rollout", lastRollout); d.put("last_rollout_at", lastRolloutAt); return d;
  }

  private Map<String, Object> normalize(Map<String, Object> raw) {
    Object agentValue = raw.get("agent");
    if (!(agentValue instanceof String s) || !Set.of("claude", "codex").contains(s.trim().toLowerCase(Locale.ROOT))) {
      count(agentValue == null ? "missing_agent" : "invalid_agent"); return null;
    }
    String agent = s.trim().toLowerCase(Locale.ROOT);
    String type = raw.get("type") instanceof String t && TYPES.contains(t) ? t : "note";
    String session = nullable(raw.get("session_id"));
    String uidSession = session == null ? "" : session;
    String storedSession = session == null ? agent + ":default" : session;
    String sourceKey = nullable(raw.get("source_key"));
    String uid = nullable(raw.get("uid"));
    if (uid == null || !uid.matches("[a-f0-9]{64}")) {
      if (sourceKey == null) sourceKey = agent + ":" + UUID.randomUUID();
      uid = sha256(agent + "\n" + uidSession + "\n" + sourceKey);
    }
    Map<String, Object> ev = new LinkedHashMap<>();
    ev.put("uid", uid); ev.put("ts", normalizeTimestamp(raw.get("ts")));
    String parent = nullable(raw.get("parent_session_id"));
    ev.put("agent", agent); ev.put("session_id", string(storedSession, 128)); ev.put("parent_session_id", parent == null ? null : string(parent, 128));
    ev.put("source", raw.get("source") instanceof String src && Set.of("hook", "rollout", "ingest", "stream").contains(src) ? src : "ingest");
    ev.put("type", type); ev.put("status", nullable(raw.get("status"))); ev.put("title", safeString(raw.get("title"), 1000));
    ev.put("detail", safeString(raw.get("detail"), 2000)); ev.put("tool", safeString(raw.get("tool"), 128));
    ev.put("meta", raw.get("meta") instanceof Map<?, ?> m ? SecretRedactor.redactMap(m) : Map.of()); return ev;
  }

  private void count(String reason) { discarded.computeIfAbsent(reason, k -> new LongAdder()).increment(); }
  private static String nullable(Object value) { return value == null || String.valueOf(value).isBlank() ? null : String.valueOf(value).trim(); }
  private static String string(Object value, int max) { if (value == null) return ""; String s = String.valueOf(value); return s.length() > max ? s.substring(0, max) : s; }
  private static String safeString(Object value, int max) {
    if (value == null) return "";
    return string(SecretRedactor.redact(String.valueOf(value)), max);
  }
  private String normalizeTimestamp(Object value) {
    if (value == null) return Instant.now().toString();
    try { return OffsetDateTime.parse(String.valueOf(value).trim()).toInstant().toString(); }
    catch (DateTimeParseException e) { count("invalid_ts"); return Instant.now().toString(); }
  }
  private static String sha256(String value) {
    // Matches emit.mjs: SHA-256(agent + LF + raw session_id or empty + LF + source_key), UTF-8 hex.
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
    catch (Exception e) { throw new IllegalStateException(e); }
  }
}
