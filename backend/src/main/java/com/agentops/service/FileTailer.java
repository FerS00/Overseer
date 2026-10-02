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
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;

@Component
public class FileTailer {
  private static final Logger log = LoggerFactory.getLogger(FileTailer.class);
  private final AppProperties props;
  private final EventStoreService store;
  private final ObjectMapper objectMapper;
  private final JdbcTemplate jdbc;
  private volatile boolean initialized;

  public FileTailer(AppProperties props, EventStoreService store, ObjectMapper objectMapper, JdbcTemplate jdbc) {
    this.props = props; this.store = store; this.objectMapper = objectMapper; this.jdbc = jdbc;
  }

  @PostConstruct
  public void init() {
    File f = new File(props.getEventsFile());
    try {
      if (f.getParentFile() != null) f.getParentFile().mkdirs();
      if (!f.exists()) f.createNewFile();
      initialized = true;
    } catch (IOException e) { log.warn("No se pudo preparar el archivo de eventos {}: {}", f.getAbsolutePath(), e.getMessage()); }
  }

  @Scheduled(fixedDelay = 400)
  public synchronized void tail() {
    if (!initialized) return;
    File file = new File(props.getEventsFile());
    String path = file.getAbsolutePath();
    try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
      long offset = loadOffset(path);
      if (raf.length() < offset) { offset = 0; saveOffset(path, 0); }
      if (raf.length() == offset) return;
      raf.seek(offset);
      int length = (int) Math.min(Integer.MAX_VALUE, raf.length() - offset);
      byte[] bytes = new byte[length]; raf.readFully(bytes);
      int completeEnd = -1;
      for (int i = 0; i < bytes.length; i++) if (bytes[i] == '\n') {
        String line = new String(bytes, completeEnd + 1, i - completeEnd - 1, StandardCharsets.UTF_8).trim();
        if (!line.isEmpty()) {
          try {
            Map<String, Object> event = objectMapper.readValue(line, new TypeReference<>() {});
            event.putIfAbsent("source", "hook"); store.publish(event);
          } catch (IllegalStateException e) { throw e; }
          catch (Exception e) { store.discard("invalid_event_line"); log.warn("Línea de evento no válida: {}", e.getMessage()); }
        }
        completeEnd = i;
      }
      if (completeEnd >= 0) saveOffset(path, offset + completeEnd + 1L);
      store.markSourceActive("hook");
    } catch (IOException | IllegalStateException e) { log.warn("Error leyendo el archivo de eventos: {}", e.getMessage()); }
  }

  private long loadOffset(String path) {
    try { Long value = jdbc.queryForObject("SELECT file_offset FROM ingest_offsets WHERE source_path = ?", Long.class, path); return value == null ? 0 : value; }
    catch (org.springframework.dao.EmptyResultDataAccessException e) { return 0; }
  }

  private void saveOffset(String path, long offset) {
    int changed = jdbc.update("UPDATE ingest_offsets SET file_offset = ?, updated_at = ? WHERE source_path = ?", offset, Instant.now().toString(), path);
    if (changed == 0) jdbc.update("INSERT INTO ingest_offsets(source_path, file_offset, updated_at) VALUES (?, ?, ?)", path, offset, Instant.now().toString());
  }
}
