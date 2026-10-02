package com.agentops;

import com.agentops.config.AppProperties;
import com.agentops.model.AgentEvent;
import com.agentops.repository.AgentEventRepository;
import com.agentops.service.CodexSessionWatcher;
import com.agentops.service.EventStoreService;
import com.agentops.service.FileTailer;
import com.agentops.service.RetentionService;
import org.springframework.test.util.ReflectionTestUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationState;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.core.env.Environment;
import javax.sql.DataSource;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@SpringBootTest(properties = {
    "spring.config.location=classpath:/application-phase1-test.yml",
    "spring.datasource.url=jdbc:h2:mem:phase1;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.username=sa",
    "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=validate",
    "agent-ops.events-file=target/phase1-events.ndjson",
    "agent-ops.cors=http://localhost:4200",
    "agent-ops.codex-watcher-enabled=false"
})
@AutoConfigureMockMvc
class PhaseOneIntegrationTest {
  private static final Path TOKEN_FILE = Path.of("target", "phase1-token-" + UUID.randomUUID());
  private static final Path ROLLOUTS_DIR = Path.of("target", "phase1-rollouts-" + UUID.randomUUID());
  private static final Path FAKE_DOTENV = createFakeDotenv();
  @Autowired EventStoreService store;
  @Autowired AgentEventRepository repository;
  @Autowired ObjectMapper mapper;
  @Autowired AppProperties properties;
  @Autowired JdbcTemplate jdbc;
  @Autowired CodexSessionWatcher watcher;
  @Autowired MockMvc mockMvc;
  @Autowired DataSource dataSource;
  @Autowired Environment environment;
  @Autowired Flyway flyway;
  @Autowired RetentionService retention;

  @DynamicPropertySource
  static void dynamicProperties(DynamicPropertyRegistry registry) {
    registry.add("agent-ops.token-file", () -> TOKEN_FILE.toString());
    registry.add("agent-ops.codex-sessions", () -> ROLLOUTS_DIR.toString());
  }

  @AfterAll
  static void removeTestToken() throws Exception {
    Files.deleteIfExists(TOKEN_FILE);
  }

  @BeforeEach
  void clear() throws Exception {
    repository.deleteAll();
    jdbc.update("DELETE FROM ingest_offsets");
    jdbc.update("DELETE FROM agent_sessions");
    Path file = Path.of(properties.getEventsFile()); Files.createDirectories(file.getParent()); Files.deleteIfExists(file);
    Path root = Path.of(properties.getCodexSessions());
    if (Files.exists(root)) try (var paths = Files.walk(root)) { for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(p); }
    Files.createDirectories(root);
  }

  @Test
  void normalizesRejectsInvalidAgentAndDeduplicatesByUid() {
    Map<String, Object> raw = event("codex", "test-normalize", "tool_use"); raw.put("detail", "x".repeat(2500));
    assertThat(store.publish(raw)).isTrue();
    AgentEvent saved = repository.findByUid((String) raw.get("uid")).orElseThrow();
    assertThat(saved.getDetail()).hasSize(2000);
    assertThat(saved.getSource()).isEqualTo("rollout");
    assertThat(saved.getSessionId()).isEqualTo("fixture-session");
    assertThat(store.publish(raw)).isFalse();
    assertThat(repository.count()).isEqualTo(1);
    assertThat(store.publish(Map.of("type", "note"))).isFalse();
    assertThat(store.publish(Map.of("agent", "other", "type", "note"))).isFalse();
    assertThat(store.diagnostics().toString()).contains("missing_agent", "invalid_agent", "duplicate_uid");
  }

  @Test
  void migrationsCreateBaselineAndOffsetTables() {
    assertThat(FAKE_DOTENV).exists();
    assertThat(readFakeDotenv()).contains("AGENT_OPS_DB_DRIVER=com.mysql.cj.jdbc.Driver");
    assertThat(environment.getProperty("AGENT_OPS_DB_DRIVER")).isEqualTo("com.mysql.cj.jdbc.Driver");
    try (var connection = dataSource.getConnection()) {
      assertThat(connection.getMetaData().getDriverName()).containsIgnoringCase("h2");
    } catch (Exception e) { throw new AssertionError(e); }
    var successfulVersions = Arrays.stream(flyway.info().applied())
        .filter(migration -> migration.getVersion() != null)
        .filter(migration -> Set.of("1", "2", "3", "4").contains(migration.getVersion().getVersion()))
        .filter(migration -> migration.getState() == MigrationState.SUCCESS)
        .count();
    assertThat(successfulVersions).isEqualTo(4);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AGENT_EVENTS'", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'INGEST_OFFSETS'", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AGENT_SESSIONS'", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.INDEXES WHERE INDEX_NAME = 'IDX_AGENT_EVENTS_SESSION_ID'", Integer.class)).isEqualTo(1);
  }

  @Test
  void watcherIngestsRolloutsCallsAndSubagentOffsetsAndDeduplicatesHookCall() throws Exception {
    Path root = Path.of(properties.getCodexSessions()); Path fixtures = Path.of("src/test/resources/fixtures");
    try (var files = Files.list(fixtures)) {
      for (Path fixture : files.filter(p -> p.getFileName().toString().startsWith("rollout-")).toList()) {
        Path copy = root.resolve(fixture.getFileName()); Files.copy(fixture, copy);
        Files.setLastModifiedTime(copy, FileTime.from(Instant.now()));
      }
    }
    watcher.scanNow();
    List<AgentEvent> events = repository.findAll();
    assertThat(events).anySatisfy(e -> assertThat(e.getType()).isEqualTo("session_start"));
    assertThat(events).anySatisfy(e -> assertThat(e.getType()).isEqualTo("tool_use"));
    assertThat(events).anySatisfy(e -> assertThat(e.getType()).isEqualTo("tool_result"));
    assertThat(events).anySatisfy(e -> assertThat(e.getType()).isEqualTo("turn_end"));
    String rootSession = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    assertThat(events).anySatisfy(e -> assertThat(e.getUid()).isEqualTo(uid("codex", rootSession, "turn_context:fixture-turn-1")));
    assertThat(events).anySatisfy(e -> assertThat(e.getUid()).isEqualTo(uid("codex", rootSession, "turn_start:fixture-turn-1")));
    long tokenBucket = Instant.parse("2026-10-02T10:00:00Z").getEpochSecond() / 30;
    assertThat(events).anySatisfy(e -> assertThat(e.getUid()).isEqualTo(uid("codex", rootSession, "tokens:" + tokenBucket)));
    AgentEvent subagent = events.stream().filter(e -> e.getUid().equals(uid("codex", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "subagent-call-1:pre"))).findFirst().orElseThrow();
    assertThat(subagent.getAgent()).isEqualTo("codex");
    assertThat(subagent.getSessionId()).isEqualTo("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    assertThat(subagent.getParentSessionId()).isEqualTo("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    Map<String, Object> hook = event("codex", "fixture-call-1:pre", "tool_use");
    hook.put("session_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    hook.put("uid", uid("codex", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "fixture-call-1:pre")); hook.put("source", "hook");
    assertThat(store.publish(hook)).isFalse();
    long count = repository.count(); watcher.scanNow();
    assertThat(repository.count()).isEqualTo(count);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ingest_offsets", Integer.class)).isGreaterThanOrEqualTo(2);
    assertThat(store.diagnostics().toString()).contains("last_rollout");
  }

  @Test
  void rolloutWaitsForNewlineBeforeAdvancingOffset() throws Exception {
    Path file = Path.of(properties.getCodexSessions()).resolve("rollout-2026-10-02T10-00-02-cccccccc-cccc-4ccc-8ccc-cccccccccccc.jsonl");
    String record = "{\"timestamp\":\"2026-10-02T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"session_id\":\"cccccccc-cccc-4ccc-8ccc-cccccccccccc\"}}";
    Files.writeString(file, record);
    Files.setLastModifiedTime(file, FileTime.from(Instant.now()));
    watcher.scanNow();
    assertThat(repository.findByUid(uid("codex", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "session:cccccccc-cccc-4ccc-8ccc-cccccccccccc"))).isEmpty();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ingest_offsets WHERE source_path = ?", Integer.class, file.toAbsolutePath().normalize().toString())).isZero();
    Files.writeString(file, "\n", StandardOpenOption.APPEND);
    watcher.scanNow();
    assertThat(repository.findByUid(uid("codex", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "session:cccccccc-cccc-4ccc-8ccc-cccccccccccc"))).isPresent();
  }

  @Test
  void oversizedRolloutLineIsCountedAndDoesNotBlockFollowingRecords() throws Exception {
    Path file = Path.of(properties.getCodexSessions()).resolve("rollout-2026-10-02T10-00-03-dddddddd-dddd-4ddd-8ddd-dddddddddddd.jsonl");
    String oversized = "x".repeat(4 * 1024 * 1024 + 100);
    String valid = "{\"timestamp\":\"2026-10-02T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"session_id\":\"dddddddd-dddd-4ddd-8ddd-dddddddddddd\"}}\n";
    Files.writeString(file, oversized + "\n" + valid);
    Files.setLastModifiedTime(file, FileTime.from(Instant.now()));
    watcher.scanNow();
    watcher.scanNow();
    assertThat(store.diagnostics().toString()).contains("oversized_rollout_line");
    assertThat(repository.findByUid(uid("codex", "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "session:dddddddd-dddd-4ddd-8ddd-dddddddddddd"))).isPresent();
  }

  @Test
  void fileTailerPersistsOffsetAcrossInstancesAndResetsWhenTruncated() throws Exception {
    Path path = Path.of(properties.getEventsFile());
    Files.writeString(path, mapper.writeValueAsString(event("claude", "file-a", "message")) + "\n");
    FileTailer first = new FileTailer(properties, store, mapper, jdbc); first.init(); first.tail();
    assertThat(repository.findByUid(uid("claude", "fixture-session", "file-a"))).isPresent();
    Files.writeString(path, mapper.writeValueAsString(event("claude", "file-b", "message")) + "\n", StandardOpenOption.APPEND);
    FileTailer afterRestart = new FileTailer(properties, store, mapper, jdbc); afterRestart.init(); afterRestart.tail(); afterRestart.tail();
    assertThat(repository.findByUid(uid("claude", "fixture-session", "file-b"))).isPresent();
    Files.writeString(path, mapper.writeValueAsString(event("claude", "file-c", "message")) + "\n", StandardOpenOption.TRUNCATE_EXISTING);
    afterRestart.tail();
    assertThat(repository.findByUid(uid("claude", "fixture-session", "file-c"))).isPresent();
  }

  @Test
  void sseReplayUsesNamedEventAndDatabaseId() throws Exception {
    Map<String, Object> published = event("codex", "sse-fixture", "message");
    assertThat(store.publish(published)).isTrue();
    AgentEvent persisted = repository.findByUid((String) published.get("uid")).orElseThrow();
    var response = mockMvc.perform(get("/events").header("Last-Event-ID", "0").accept("text/event-stream"))
        .andExpect(status().isOk()).andReturn();
    String body = response.getResponse().getContentAsString();
    assertThat(body).contains("event:event", "id:" + persisted.getId());
    assertThat(store.getAfter(0)).anySatisfy(e -> {
      assertThat(e.get("uid")).isEqualTo(uid("codex", "fixture-session", "sse-fixture"));
      assertThat(e.get("id")).isEqualTo(persisted.getId());
    });
  }

  @Test
  void reloadsPersistedHistoryIntoMutableAscendingBuffer() {
    assertThat(store.publish(event("claude", "history-a", "message"))).isTrue();
    assertThat(store.publish(event("codex", "history-b", "message"))).isTrue();
    EventStoreService restarted = new EventStoreService(repository, new com.agentops.service.SseBroadcaster(), mapper);
    restarted.loadHistory();
    assertThat(restarted.getRecent(10)).extracting(row -> row.get("uid"))
        .containsExactly(uid("claude", "fixture-session", "history-a"), uid("codex", "fixture-session", "history-b"));
  }

  @Test
  void redactsBeforePersistenceWithoutChangingUidAndRecursesIntoMeta() {
    Map<String, Object> raw = event("claude", "redaction-uid", "message");
    raw.put("title", "sk-proj-abcdefgh123456");
    raw.put("detail", "PASSWORD=very-secret");
    raw.put("tool", "ghp_abcdefgh1234");
    raw.put("meta", Map.of("nested", List.of("AKIA1234567890ABCDEF", Map.of("header", "Authorization: Bearer abc.def_123"))));
    String uid = (String) raw.get("uid");
    assertThat(store.publish(raw)).isTrue();
    AgentEvent saved = repository.findByUid(uid).orElseThrow();
    assertThat(saved.getUid()).isEqualTo(uid);
    assertThat(saved.getTitle()).isEqualTo("sk-***");
    assertThat(saved.getDetail()).isEqualTo("PASSWORD=***");
    assertThat(saved.getTool()).isEqualTo("ghp_***");
    assertThat(saved.getMetaJson()).doesNotContain("1234567890ABCDEF", "abc.def_123").contains("AKIA***", "Authorization: ***");
  }

  @Test
  void redactsEntirePrivateKeyBlockBeforeApplyingDetailLimit() {
    Map<String, Object> raw = event("codex", "long-private-key", "message");
    raw.put("detail", "-----BEGIN PRIVATE KEY-----" + "private-key-material".repeat(200) + "-----END PRIVATE KEY-----");
    assertThat(store.publish(raw)).isTrue();
    AgentEvent saved = repository.findByUid((String) raw.get("uid")).orElseThrow();
    assertThat(saved.getDetail()).isEqualTo("[clave privada redactada]");
  }

  @Test
  void retentionDeletesOldEventsKeepsRecentAndZeroDisablesIt() {
    Map<String, Object> old = event("claude", "retention-old", "message");
    String oldOffsetTs = Instant.now().minusSeconds(20L * 24 * 60 * 60).atOffset(java.time.ZoneOffset.ofHours(2)).toString();
    old.put("ts", oldOffsetTs);
    Map<String, Object> recent = event("codex", "retention-recent", "message");
    assertThat(store.publish(old)).isTrue();
    assertThat(store.publish(recent)).isTrue();
    assertThat(repository.findByUid((String) old.get("uid")).orElseThrow().getTs())
        .isEqualTo(java.time.OffsetDateTime.parse(oldOffsetTs).toInstant().toString());
    assertThat(retention.purgeExpired()).isEqualTo(1);
    assertThat(repository.findByUid((String) old.get("uid"))).isEmpty();
    assertThat(repository.findByUid((String) recent.get("uid"))).isPresent();

    Map<String, Object> anotherOld = event("claude", "retention-disabled", "message");
    anotherOld.put("ts", Instant.now().minusSeconds(30L * 24 * 60 * 60).toString());
    assertThat(store.publish(anotherOld)).isTrue();
    ReflectionTestUtils.setField(properties, "retentionDays", 0);
    assertThat(retention.purgeExpired()).isZero();
    assertThat(repository.findByUid((String) anotherOld.get("uid"))).isPresent();
    ReflectionTestUtils.setField(properties, "retentionDays", 14);
  }

  @Test
  void invalidTimestampFallsBackToNowAndIsCounted() {
    Map<String, Object> raw = event("claude", "invalid-timestamp", "message");
    raw.put("ts", "not-a-timestamp");
    Instant before = Instant.now();
    assertThat(store.publish(raw)).isTrue();
    Instant stored = Instant.parse(repository.findByUid((String) raw.get("uid")).orElseThrow().getTs());
    assertThat(stored).isBetween(before, Instant.now().plusSeconds(1));
    assertThat(store.diagnostics().toString()).contains("invalid_ts");
  }

  @Test
  void ingestRequiresTokenLimitsBodyAndPreservesInvalidAgentDiscard() throws Exception {
    Map<String, Object> payload = event("codex", "mock-ingest", "message");
    String body = mapper.writeValueAsString(payload);
    mockMvc.perform(post("/api/ingest").contentType("application/json").content("{invalid json"))
        .andExpect(status().isUnauthorized());
    mockMvc.perform(post("/api/ingest").contentType("application/json").content(body))
        .andExpect(status().isUnauthorized());
    mockMvc.perform(post("/api/ingest").header("X-Agent-Ops-Token", "incorrect")
            .contentType("application/json").content(body))
        .andExpect(status().isUnauthorized());
    String token = Files.readString(Path.of(properties.getTokenFile())).trim();
    mockMvc.perform(post("/api/ingest").header("X-Agent-Ops-Token", token)
            .contentType("application/json").content(body))
        .andExpect(status().isOk()).andExpect(jsonPath("$.ingested").value(1)).andExpect(jsonPath("$.discarded").value(0));
    String oversized = "{\"detail\":\"" + "x".repeat(256 * 1024) + "\"}";
    mockMvc.perform(post("/api/ingest").header("X-Agent-Ops-Token", token)
            .contentType("application/json").content(oversized))
        .andExpect(status().isPayloadTooLarge());
    List<Map<String, Object>> batch = new ArrayList<>();
    for (int i = 0; i < 501; i++) batch.add(event("claude", "batch-" + i, "message"));
    mockMvc.perform(post("/api/ingest").header("X-Agent-Ops-Token", token)
            .contentType("application/json").content(mapper.writeValueAsBytes(batch)))
        .andExpect(status().isPayloadTooLarge());
    Map<String, Object> invalid = event("other", "invalid-ingest", "message");
    mockMvc.perform(post("/api/ingest").header("X-Agent-Ops-Token", token)
            .contentType("application/json").content(mapper.writeValueAsBytes(invalid)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.ingested").value(0)).andExpect(jsonPath("$.discarded").value(1));
    assertThat(repository.findByUid((String) invalid.get("uid"))).isEmpty();
  }

  @Test
  void resolvesLoopbackBindAddressByDefault() {
    assertThat(environment.getProperty("server.address")).isEqualTo("127.0.0.1");
  }

  @Test
  void fixedAgentApiRejectsGeminiAndCountsTheDiscard() throws Exception {
    var profiles = mockMvc.perform(get("/api/agents")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    assertThat(profiles).contains("claude", "codex", "Claude Code", "chispa", "nodo").doesNotContain("gemini");
    var parsedProfiles = mapper.readTree(profiles);
    assertThat(parsedProfiles.size()).isEqualTo(2);
    assertThat(parsedProfiles.get(0).path("id").asText()).isEqualTo("claude");
    assertThat(parsedProfiles.get(1).path("id").asText()).isEqualTo("codex");
    long before = discardedCount("invalid_agent");
    String token = Files.readString(Path.of(properties.getTokenFile())).trim();
    Map<String, Object> unsupported = event("gemini", "phase2-gemini", "message");
    mockMvc.perform(post("/api/ingest").header("X-Agent-Ops-Token", token).contentType("application/json")
            .content(mapper.writeValueAsBytes(unsupported)))
        .andExpect(status().isOk()).andExpect(jsonPath("$.ingested").value(0)).andExpect(jsonPath("$.discarded").value(1));
    assertThat(discardedCount("invalid_agent")).isEqualTo(before + 1);
    assertThat(repository.findByUid((String) unsupported.get("uid"))).isEmpty();
    assertThat(mockMvc.perform(get("/api/events")).andReturn().getResponse().getContentAsString()).doesNotContain("gemini");
  }

  @Test
  void historyIgnoresPreviouslyStoredUnsupportedAgents() {
    AgentEvent unknown = AgentEvent.fromMap(event("gemini", "old-gemini", "message"), mapper);
    repository.saveAndFlush(unknown);
    EventStoreService restarted = new EventStoreService(repository, new com.agentops.service.SseBroadcaster(), mapper);
    restarted.loadHistory();
    assertThat(restarted.getRecent(50)).noneSatisfy(row -> assertThat(row.get("agent")).isEqualTo("gemini"));
    assertThat(restarted.getState().get("agents").toString()).doesNotContain("gemini");
  }

  @Test
  void fileTailerDropsUnsupportedAgentsAndIncrementsDiagnostic() throws Exception {
    Map<String, Object> invalid = event("gemini", "tailer-gemini", "message");
    Path path = Path.of(properties.getEventsFile());
    Files.writeString(path, mapper.writeValueAsString(invalid) + "\n");
    long before = discardedCount("invalid_agent");
    FileTailer tailer = new FileTailer(properties, store, mapper, jdbc); tailer.init(); tailer.tail();
    assertThat(discardedCount("invalid_agent")).isEqualTo(before + 1);
    assertThat(repository.findByUid((String) invalid.get("uid"))).isEmpty();
  }

  @Test
  void sessionsSeparateParallelClaudeSessionsAndNestCodexSubagent() throws Exception {
    Map<String, Object> claudeA = event("claude", "claude-a", "session_start"); claudeA.put("session_id", "claude-a");
    Map<String, Object> claudeB = event("claude", "claude-b", "message"); claudeB.put("session_id", "claude-b");
    Map<String, Object> parent = event("codex", "codex-parent", "session_start"); parent.put("session_id", "codex-parent");
    Map<String, Object> child = event("codex", "codex-child", "tool_use"); child.put("session_id", "codex-child"); child.put("parent_session_id", "codex-parent");
    assertThat(store.publish(claudeA)).isTrue(); assertThat(store.publish(claudeB)).isTrue();
    assertThat(store.publish(parent)).isTrue(); assertThat(store.publish(child)).isTrue();
    String sessions = mockMvc.perform(get("/api/sessions").param("agent", "claude").param("active", "true"))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    assertThat(sessions).contains("claude-a", "claude-b");
    String codexSessions = mockMvc.perform(get("/api/sessions").param("agent", "codex"))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    assertThat(codexSessions).contains("codex-child", "codex-parent", "parent_session_id");
    assertThat(mockMvc.perform(get("/api/state")).andReturn().getResponse().getContentAsString()).contains("activeSessions");
  }

  @Test
  void sessionKeepsCwdAndModelWhenLaterIngestEventOmitsMetadata() throws Exception {
    String token = Files.readString(Path.of(properties.getTokenFile())).trim();
    Map<String, Object> start = event("claude", "metadata-session-start", "session_start");
    start.put("session_id", "metadata-session");
    start.put("meta", Map.of("cwd", "C:/work/agent-ops", "model", "claude-sonnet"));
    Map<String, Object> action = event("claude", "metadata-session-tool", "tool_use");
    action.put("session_id", "metadata-session");
    action.put("meta", Map.of());

    for (Map<String, Object> payload : List.of(start, action)) {
      mockMvc.perform(post("/api/ingest").header("X-Agent-Ops-Token", token).contentType("application/json")
              .content(mapper.writeValueAsBytes(payload)))
          .andExpect(status().isOk()).andExpect(jsonPath("$.ingested").value(1));
    }

    var sessions = mapper.readTree(mockMvc.perform(get("/api/sessions").param("agent", "claude"))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    var preserved = java.util.stream.StreamSupport.stream(sessions.spliterator(), false)
        .filter(session -> session.path("id").asText().equals("metadata-session")).findFirst().orElseThrow();
    assertThat(preserved.path("cwd").asText()).isEqualTo("C:/work/agent-ops");
    assertThat(preserved.path("model").asText()).isEqualTo("claude-sonnet");
  }

  @Test
  void sessionTrackerTransitionsByInjectedClockAndSessionEnd() {
    var start = java.time.Instant.parse("2026-10-02T10:00:00Z");
    var fixed = new com.agentops.service.SessionTracker(jdbc, java.time.Clock.fixed(start, java.time.ZoneOffset.UTC), java.time.Duration.ofMinutes(10));
    Map<String, Object> event = new LinkedHashMap<>(); event.put("agent", "claude"); event.put("session_id", "clock-session"); event.put("type", "session_start"); event.put("meta", Map.of("cwd", "C:/work/app", "model", "sonnet"));
    fixed.accept(event);
    assertThat(fixed.list("claude", true)).anySatisfy(row -> assertThat(row.get("id")).isEqualTo("clock-session"));
    event.put("type", "turn_end"); fixed.accept(event);
    assertThat(fixed.list("claude", true)).anySatisfy(row -> assertThat(row.get("id")).isEqualTo("clock-session"));
    var idle = new com.agentops.service.SessionTracker(jdbc, java.time.Clock.fixed(start.plusSeconds(600), java.time.ZoneOffset.UTC), java.time.Duration.ofMinutes(10));
    assertThat(idle.list("claude", false)).anySatisfy(row -> assertThat(row).containsEntry("state", "idle"));
    event.put("type", "session_end");
    var ended = new com.agentops.service.SessionTracker(jdbc, java.time.Clock.fixed(start.plusSeconds(601), java.time.ZoneOffset.UTC), java.time.Duration.ofMinutes(10));
    ended.accept(event);
    assertThat(ended.list("claude", null)).anySatisfy(row -> assertThat(row).containsEntry("state", "ended"));
  }

  @Test
  void missingSessionIdUsesOneSyntheticSessionPerAgentAndEventsCanBeFiltered() throws Exception {
    Map<String, Object> synthetic = event("claude", "synthetic-session", "message"); synthetic.remove("session_id");
    assertThat(store.publish(synthetic)).isTrue();
    assertThat(mockMvc.perform(get("/api/sessions").param("agent", "claude"))
        .andReturn().getResponse().getContentAsString()).contains("claude:default");
    assertThat(mockMvc.perform(get("/api/events").param("session", "claude:default").param("type", "message").param("q", "fixture"))
        .andReturn().getResponse().getContentAsString()).contains((String) synthetic.get("uid"));
    assertThat(mockMvc.perform(get("/api/events").param("session", "unrelated"))
        .andReturn().getResponse().getContentAsString()).doesNotContain((String) synthetic.get("uid"));
  }

  @Test
  void missingSessionUidUsesEmptySessionLikeIntegrationEmitter() {
    Map<String, Object> raw = event("claude", "uid-without-session", "message");
    raw.remove("session_id"); raw.remove("uid");
    assertThat(store.publish(raw)).isTrue();
    String expected = uid("claude", "", "uid-without-session");
    AgentEvent saved = repository.findByUid(expected).orElseThrow();
    assertThat(saved.getSessionId()).isEqualTo("claude:default");
  }

  @Test
  void eventsEndpointQueriesDatabaseForSessionOutsideBufferAndBeforePage() throws Exception {
    Map<String, Object> raw = event("claude", "historical-only", "message");
    raw.put("session_id", "outside-buffer-session");
    raw.put("ts", Instant.now().minusSeconds(3600).toString());
    raw.put("title", "Historical marker");
    repository.saveAndFlush(AgentEvent.fromMap(raw, mapper));
    assertThat(store.getRecent(3000).stream().noneMatch(row -> raw.get("uid").equals(row.get("uid")))).isTrue();

    String response = mockMvc.perform(get("/api/events").param("limit", "5").param("session", "outside-buffer-session")
            .param("type", "message").param("q", "HISTORICAL MARKER")
            .param("before", Instant.now().minusSeconds(1800).toString()))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    assertThat(response).contains((String) raw.get("uid"), "Historical marker");
  }

  @Test
  void oldEventStartsIdleAndNewerEventReopensEndedSession() {
    Instant now = Instant.parse("2026-10-02T12:00:00Z");
    var tracker = new com.agentops.service.SessionTracker(jdbc,
        java.time.Clock.fixed(now.plusSeconds(2), java.time.ZoneOffset.UTC), java.time.Duration.ofMinutes(10));
    Map<String, Object> old = new LinkedHashMap<>(); old.put("agent", "codex"); old.put("session_id", "old-session");
    old.put("type", "session_start"); old.put("ts", now.minus(java.time.Duration.ofHours(2)).toString()); old.put("meta", Map.of());
    tracker.accept(old);
    old.put("type", "note"); old.put("ts", now.minus(java.time.Duration.ofHours(3)).toString()); tracker.accept(old);
    Map<String, Object> oldRow = tracker.list("codex", false).stream()
        .filter(row -> "old-session".equals(row.get("id"))).findFirst().orElseThrow();
    assertThat(oldRow).containsEntry("state", "idle");
    assertThat(jdbc.queryForObject("SELECT started_at FROM agent_sessions WHERE id = ?", String.class, "old-session"))
        .isEqualTo(now.minus(java.time.Duration.ofHours(3)).toString());
    assertThat(jdbc.queryForObject("SELECT last_event_at FROM agent_sessions WHERE id = ?", String.class, "old-session"))
        .isEqualTo(now.minus(java.time.Duration.ofHours(2)).toString());

    Map<String, Object> resumed = new LinkedHashMap<>(); resumed.put("agent", "claude");
    resumed.put("session_id", "resumed-session"); resumed.put("type", "session_end");
    resumed.put("ts", now.toString()); resumed.put("meta", Map.of());
    tracker.accept(resumed);
    resumed.put("type", "message"); resumed.put("ts", now.plusSeconds(1).toString()); tracker.accept(resumed);
    assertThat(tracker.list("claude", true)).anySatisfy(row -> assertThat(row.get("id")).isEqualTo("resumed-session"));
    assertThat(jdbc.queryForObject("SELECT ended_at FROM agent_sessions WHERE id = ?", String.class, "resumed-session")).isNull();
    assertThat(jdbc.queryForObject("SELECT started_at FROM agent_sessions WHERE id = ?", String.class, "resumed-session"))
        .isEqualTo(now.toString());
    assertThat(jdbc.queryForObject("SELECT last_event_at FROM agent_sessions WHERE id = ?", String.class, "resumed-session"))
        .isEqualTo(now.plusSeconds(1).toString());
  }

  @SuppressWarnings("unchecked")
  private long discardedCount(String reason) {
    return ((Map<String, Long>) store.diagnostics().get("discarded")).getOrDefault(reason, 0L);
  }

  private Map<String, Object> event(String agent, String key, String type) {
    Map<String, Object> e = new LinkedHashMap<>(); e.put("uid", uid(agent, "fixture-session", key)); e.put("source_key", key);
    e.put("agent", agent); e.put("session_id", "fixture-session"); e.put("source", "rollout"); e.put("type", type);
    e.put("ts", Instant.now().toString()); e.put("title", "fixture"); e.put("detail", "detail"); e.put("tool", "exec"); e.put("meta", Map.of()); return e;
  }
  private String uid(String agent, String sid, String sourceKey) {
    try { return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest((agent + "\n" + sid + "\n" + sourceKey).getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
    catch (Exception e) { throw new IllegalStateException(e); }
  }
  private static Path createFakeDotenv() {
    Path path = Path.of("target/phase1-hermetic/.env");
    try {
      Files.createDirectories(path.getParent());
      Files.writeString(path, "AGENT_OPS_DB_DRIVER=com.mysql.cj.jdbc.Driver\nAGENT_OPS_DB_URL=jdbc:mysql://invalid/phase1\n");
      return path;
    } catch (Exception e) { throw new ExceptionInInitializerError(e); }
  }
  private static String readFakeDotenv() {
    try { return Files.readString(FAKE_DOTENV); } catch (Exception e) { throw new AssertionError(e); }
  }
}
