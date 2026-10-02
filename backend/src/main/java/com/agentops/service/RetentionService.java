package com.agentops.service;

import com.agentops.config.AppProperties;
import com.agentops.repository.AgentEventRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Component
public class RetentionService {
  private static final Logger log = LoggerFactory.getLogger(RetentionService.class);
  private final AppProperties properties;
  private final AgentEventRepository events;
  private final JdbcTemplate jdbc;

  public RetentionService(AppProperties properties, AgentEventRepository events, JdbcTemplate jdbc) {
    this.properties = properties;
    this.events = events;
    this.jdbc = jdbc;
  }

  @EventListener(ApplicationReadyEvent.class)
  @Transactional
  public void purgeAtStartup() { purgeExpired(); }

  @Scheduled(cron = "0 0 * * * *")
  @Transactional
  public void purgeHourly() { purgeExpired(); }

  @Transactional
  public int purgeExpired() {
    int days = properties.getRetentionDays();
    int deletedEvents = days <= 0 ? 0 : events.deleteOlderThan(Instant.now().minus(days, ChronoUnit.DAYS).toString());
    int deletedOffsets = cleanMissingOffsets();
    log.info("Purga de retención: {} eventos y {} offsets eliminados", deletedEvents, deletedOffsets);
    return deletedEvents;
  }

  private int cleanMissingOffsets() {
    List<String> paths = jdbc.query("SELECT source_path FROM ingest_offsets", (rs, row) -> rs.getString(1));
    int removed = 0;
    for (String value : paths) {
      try {
        if (Files.notExists(Path.of(value))) removed += jdbc.update("DELETE FROM ingest_offsets WHERE source_path = ?", value);
      } catch (RuntimeException ignored) { }
    }
    return removed;
  }
}
