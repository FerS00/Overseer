package com.agentops.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AppProperties {

  @Value("${agent-ops.events-file}")
  private String eventsFile;

  @Value("${agent-ops.cors}")
  private String cors;

  @Value("${agent-ops.codex-sessions}")
  private String codexSessions;

  @Value("${agent-ops.codex-watcher-enabled:true}")
  private boolean codexWatcherEnabled;

  @Value("${agent-ops.retention-days:14}")
  private int retentionDays;

  @Value("${agent-ops.session-idle-minutes:10}")
  private int sessionIdleMinutes;

  @Value("${agent-ops.token-file:${user.home}/.agent-ops/token}")
  private String tokenFile;

  public String getEventsFile() {
    return eventsFile;
  }

  public String getCors() {
    return cors;
  }

  public String getCodexSessions() { return codexSessions; }
  public boolean isCodexWatcherEnabled() { return codexWatcherEnabled; }
  public int getRetentionDays() { return retentionDays; }
  public int getSessionIdleMinutes() { return sessionIdleMinutes; }
  public String getTokenFile() { return tokenFile; }
}
