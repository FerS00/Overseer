package com.agentops.service;

import com.agentops.config.AppProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class CodexSessionWatcher {
  private static final int MAX_BYTES_PER_FILE_PER_SCAN = 4 * 1024 * 1024;
  private static final Logger log = LoggerFactory.getLogger(CodexSessionWatcher.class);
  private static final Pattern ROLLOUT = Pattern.compile("^rollout-.*-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}))?\\.jsonl$");
  private final AppProperties props;
  private final EventStoreService store;
  private final ObjectMapper mapper;
  private final JdbcTemplate jdbc;
  private final Map<String, Map<String, Object>> calls = new ConcurrentHashMap<>();
  private final Map<String, Instant> lastTokenNote = new ConcurrentHashMap<>();
  private final Map<String, FileScanState> lastScans = new ConcurrentHashMap<>();

  private record FileScanState(long length, long offset, boolean waitingForLineEnd) { }

  public CodexSessionWatcher(AppProperties props, EventStoreService store, ObjectMapper mapper, JdbcTemplate jdbc) {
    this.props = props; this.store = store; this.mapper = mapper; this.jdbc = jdbc;
  }

  @PostConstruct
  public void initialize() { }

  @Scheduled(fixedDelay = 1000)
  public synchronized void scan() {
    if (!props.isCodexWatcherEnabled()) return;
    scanFiles();
  }

  public synchronized void scanNow() {
    scanFiles();
  }

  private void scanFiles() {
    Instant throttleExpiry = Instant.now().minus(Duration.ofHours(24));
    lastTokenNote.entrySet().removeIf(entry -> entry.getValue().isBefore(throttleExpiry));
    Path root = Path.of(props.getCodexSessions()).toAbsolutePath().normalize();
    if (!Files.isDirectory(root)) return;
    Instant cutoff = Instant.now().minus(Duration.ofHours(24));
    try (var paths = Files.walk(root)) {
      List<Path> recent = paths.filter(Files::isRegularFile).filter(p -> ROLLOUT.matcher(p.getFileName().toString()).matches())
          .filter(p -> { try { return Files.getLastModifiedTime(p).toInstant().isAfter(cutoff); } catch (Exception e) { return false; } }).toList();
      List<Path> ordered = new ArrayList<>(recent);
      ordered.sort(Comparator.comparingLong(p -> { try { return Files.getLastModifiedTime(p).toMillis(); } catch (Exception e) { return 0L; } }));
      for (Path path : ordered) {
        try { readFile(path); }
        catch (Exception e) { log.debug("No se pudo leer rollout {}: {}", path, e.getMessage()); }
      }
      if (!ordered.isEmpty()) store.markSourceActive("rollout");
    } catch (Exception e) { log.warn("No se pudieron explorar sesiones Codex: {}", e.getMessage()); }
  }

  private void readFile(Path path) throws Exception {
    String full = path.toAbsolutePath().normalize().toString();
    Matcher match = ROLLOUT.matcher(path.getFileName().toString()); match.matches();
    String motherId = match.group(1); String childId = match.group(2);
    boolean advanced = false;
    try (RandomAccessFile file = new RandomAccessFile(path.toFile(), "r")) {
      long offset = loadOffset(full);
      if (file.length() < offset) { offset = 0; saveOffset(full, 0); }
      long length = file.length();
      FileScanState previous = lastScans.get(full);
      if (previous != null && previous.length() == length && previous.offset() == offset && previous.waitingForLineEnd()) return;
      if (offset >= length) { lastScans.put(full, new FileScanState(length, offset, false)); return; }
      boolean startsInsideLine = false;
      if (offset > 0) { file.seek(offset - 1); startsInsideLine = file.readByte() != '\n'; }
      file.seek(offset);
      int size = (int) Math.min(MAX_BYTES_PER_FILE_PER_SCAN, length - offset);
      byte[] block = new byte[size];
      file.readFully(block);
      int lastNewline = -1;
      for (int i = block.length - 1; i >= 0; i--) if (block[i] == '\n') { lastNewline = i; break; }
      if (lastNewline < 0) {
        boolean oversized = startsInsideLine || length - offset >= MAX_BYTES_PER_FILE_PER_SCAN;
        if (oversized) {
          store.discard("oversized_rollout_line");
          saveOffset(full, offset + block.length);
          advanced = true;
        }
        lastScans.put(full, new FileScanState(length, loadOffset(full), !oversized));
      } else {
        int lineStart = startsInsideLine ? indexOf(block, (byte) '\n') + 1 : 0;
        for (int i = lineStart; i <= lastNewline; i++) {
          if (block[i] != '\n') continue;
          int end = i;
          if (end > lineStart && block[end - 1] == '\r') end--;
          if (end > lineStart) {
            String line = new String(block, lineStart, end - lineStart, StandardCharsets.UTF_8);
            try {
              Map<String, Object> record = mapper.readValue(line, new TypeReference<>() {});
              processRecord(record, motherId, childId, path.getFileName().toString());
            } catch (Exception e) { store.discard("invalid_rollout_line"); }
          }
          lineStart = i + 1;
        }
        saveOffset(full, offset + lastNewline + 1L);
        advanced = true;
        long nextOffset = offset + lastNewline + 1L;
        boolean waitingForLineEnd = lastNewline < block.length - 1
            && length - nextOffset < MAX_BYTES_PER_FILE_PER_SCAN;
        lastScans.put(full, new FileScanState(length, loadOffset(full), waitingForLineEnd));
      }
    }
    if (advanced) store.markRolloutRead(full);
  }

  @SuppressWarnings("unchecked")
  private void processRecord(Map<String, Object> record, String motherId, String childId, String filename) {
    Object rawPayload = record.get("payload"); if (!(rawPayload instanceof Map<?, ?>)) return;
    Map<String, Object> payload = (Map<String, Object>) rawPayload;
    String sessionId = childId == null ? text(payload.get("session_id"), motherId) : childId;
    String parentId = childId == null ? null : motherId;
    String lineType = text(record.get("type"), "");
    String ts = text(record.get("timestamp"), Instant.now().toString());
    String recordType = text(payload.get("type"), "");
    switch (lineType) {
      case "session_meta" -> publish(sessionId, parentId, ts, "session_start", "Sesión de Codex iniciada",
          join(payload.get("cwd"), payload.get("cli_version"), payload.get("originator")), null,
          Map.of("session_id", sessionId, "cwd", text(payload.get("cwd"), ""), "cli_version", text(payload.get("cli_version"), "")), "session:" + sessionId);
      case "turn_context" -> publish(sessionId, parentId, ts, "note", "Modelo Codex", text(payload.get("model"), ""), null,
          Map.of("model", text(payload.get("model"), "")), "turn_context:" + text(payload.get("turn_id"), ts));
      case "event_msg" -> processEventMessage(payload, sessionId, parentId, ts, recordType);
      case "response_item" -> processResponse(payload, sessionId, parentId, ts, recordType, filename);
      default -> { }
    }
  }

  @SuppressWarnings("unchecked")
  private void processEventMessage(Map<String, Object> p, String sid, String parent, String ts, String type) {
    switch (type) {
      case "task_started" -> publish(sid, parent, ts, "thinking", "Turno iniciado", "", null, Map.of(), "turn_start:" + text(p.get("turn_id"), ts));
      case "task_complete" -> {
        String detail = truncate(text(p.get("last_agent_message"), ""), 2000);
        publish(sid, parent, ts, "turn_end", "Turno finalizado", detail, null,
            Map.of("duration_ms", p.getOrDefault("duration_ms", "")), "turn_end:" + text(p.get("turn_id"), ts));
      }
      case "token_count" -> {
        Instant recordedAt = instantOrNow(ts), last = lastTokenNote.get(sid);
        if (last == null || !recordedAt.isBefore(last.plusSeconds(30))) {
          lastTokenNote.put(sid, recordedAt);
          Object info = p.get("info"); String detail = info instanceof Map<?, ?> m ? String.valueOf(m.get("total_token_usage")) : "";
          publish(sid, parent, ts, "note", "Uso de tokens", truncate(detail, 500), null, Map.of(), "tokens:" + (recordedAt.getEpochSecond() / 30));
        }
      }
      default -> { }
    }
  }

  @SuppressWarnings("unchecked")
  private void processResponse(Map<String, Object> p, String sid, String parent, String ts, String type, String filename) {
    switch (type) {
      case "message" -> {
        String role = text(p.get("role"), ""); Object content = p.get("content"); String body = contentText(content);
        if ("user".equals(role)) {
          if (!body.startsWith("<")) publish(sid, parent, ts, "user_prompt", "Prompt de usuario", truncate(body, 2000), null, Map.of(), "message:" + text(p.get("id"), ts));
        } else if ("assistant".equals(role)) publish(sid, parent, ts, "message", "Mensaje de Codex", truncate(body, 2000), null, Map.of(), "message:" + text(p.get("id"), ts));
      }
      case "reasoning" -> {
        Object summary = p.get("summary"); String text = contentText(summary);
        if (!text.isBlank()) publish(sid, parent, ts, "thinking", "Razonamiento", truncate(text, 1000), null, Map.of(), "reasoning:" + text(p.get("id"), ts));
      }
      case "function_call", "custom_tool_call" -> {
        String id = text(p.get("call_id"), text(p.get("id"), "")); if (id.isBlank()) return;
        String tool = text(p.get("name"), "tool"); String input = text(p.get("input"), text(p.get("arguments"), ""));
        String callKey = sid.length() + ":" + sid + id;
        if (calls.size() >= 10000) calls.clear();
        Map<String, Object> call = Map.of("tool", tool, "input", truncate(input, 1000)); calls.put(callKey, call);
        publish(sid, parent, ts, "tool_use", "Ejecutando " + tool, truncate(input, 2000), tool, Map.of("call_id", id), id + ":pre");
      }
      case "function_call_output", "custom_tool_call_output" -> {
        String id = text(p.get("call_id"), ""); Map<String, Object> call = calls.remove(sid.length() + ":" + sid + id);
        String tool = call == null ? "" : text(call.get("tool"), "");
        publish(sid, parent, ts, "tool_result", tool.isBlank() ? "Resultado de herramienta" : tool + " completada",
            truncate(contentText(p.get("output")), 2000), tool, Map.of("call_id", id), id.isBlank() ? null : id + ":post");
      }
      default -> { }
    }
  }

  private void publish(String sid, String parent, String ts, String type, String title, String detail, String tool,
                       Map<String, Object> meta, String sourceKey) {
    Map<String, Object> event = new LinkedHashMap<>(); event.put("agent", "codex"); event.put("session_id", sid);
    event.put("parent_session_id", parent); event.put("source", "rollout"); event.put("ts", ts); event.put("type", type);
    event.put("title", title); event.put("detail", detail); event.put("tool", tool); event.put("meta", meta);
    if (sourceKey != null) event.put("source_key", sourceKey);
    store.publish(event);
  }

  private long loadOffset(String path) {
    try { Long n = jdbc.queryForObject("SELECT file_offset FROM ingest_offsets WHERE source_path = ?", Long.class, path); return n == null ? 0 : n; }
    catch (org.springframework.dao.EmptyResultDataAccessException e) { return 0; }
  }
  private static int indexOf(byte[] bytes, byte value) {
    for (int i = 0; i < bytes.length; i++) if (bytes[i] == value) return i;
    return -1;
  }
  private static Instant instantOrNow(String value) {
    try { return Instant.parse(value); } catch (Exception ignored) { return Instant.now(); }
  }
  private void saveOffset(String path, long offset) {
    String now = Instant.now().toString();
    if (jdbc.update("UPDATE ingest_offsets SET file_offset = ?, updated_at = ? WHERE source_path = ?", offset, now, path) == 0)
      jdbc.update("INSERT INTO ingest_offsets(source_path, file_offset, updated_at) VALUES (?, ?, ?)", path, offset, now);
  }
  private static String text(Object o, String fallback) { return o == null ? fallback : String.valueOf(o); }
  private static String truncate(String s, int limit) { return s.length() > limit ? s.substring(0, limit) : s; }
  private static String join(Object... parts) { return Arrays.stream(parts).filter(Objects::nonNull).map(String::valueOf).filter(s -> !s.isBlank()).reduce((a,b) -> a + " · " + b).orElse(""); }
  private static String contentText(Object content) {
    if (content instanceof String s) return s;
    if (content instanceof List<?> list) {
      List<String> bits = new ArrayList<>(); for (Object item : list) {
        if (item instanceof Map<?, ?> m) { Object t = m.get("text"); if (t != null) bits.add(String.valueOf(t)); }
        else if (item != null) bits.add(String.valueOf(item));
      } return String.join(" ", bits);
    }
    return content == null ? "" : String.valueOf(content);
  }
}
