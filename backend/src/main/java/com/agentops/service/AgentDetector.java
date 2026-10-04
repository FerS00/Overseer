package com.agentops.service;

import com.agentops.config.AgentProfiles;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

/** Detects installations by marker existence only; never reads profile contents. */
@Service
public class AgentDetector {
  public record Detection(boolean detected, String detectedBy) { }
  private final Environment environment;
  private final AtomicReference<Map<String, Detection>> current = new AtomicReference<>(Map.of());

  public AgentDetector(Environment environment) {
    this.environment = environment;
    refresh();
  }

  @Scheduled(fixedDelayString = "${agent-ops.agent-detection-interval-ms:300000}", initialDelayString = "${agent-ops.agent-detection-interval-ms:300000}")
  public void refresh() {
    Map<String, Detection> result = new LinkedHashMap<>();
    Set<String> forced = forcedAgents();
    for (String id : List.of("claude", "codex", "antigravity", "deepseek")) {
      if (forced != null) {
        result.put(id, new Detection(forced.contains(id), forced.contains(id) ? "AGENT_OPS_AGENTS" : null));
        continue;
      }
      String configured = environment.getProperty("agent-ops.agents." + id + "-home");
      Path userHome = Path.of(System.getProperty("user.home"));
      Path home = configured == null || configured.isBlank() ? userHome : Path.of(configured);
      String marker = switch (id) {
        case "claude" -> existing(configured == null || configured.isBlank() ? userHome.resolve(".claude") : home, "~/.claude");
        case "codex" -> existing(configured == null || configured.isBlank() ? userHome.resolve(".codex") : home, "~/.codex");
        case "antigravity" -> first(existing(configured == null || configured.isBlank() ? userHome.resolve(".gemini/config") : home, "~/.gemini/config"),
            executableOnPath("agy", environment.getProperty("PATH", System.getenv().getOrDefault("PATH", ""))) ? "PATH:agy" : null,
            existing(Path.of(environment.getProperty("LOCALAPPDATA", System.getenv().getOrDefault("LOCALAPPDATA", "")), "Programs/Antigravity"), "Antigravity app"),
            existing(Path.of(environment.getProperty("LOCALAPPDATA", System.getenv().getOrDefault("LOCALAPPDATA", "")), "Programs/Antigravity IDE"), "Antigravity IDE"));
        case "deepseek" -> existing(configured == null || configured.isBlank() ? userHome.resolve(".dsh/profiles") : home, "~/.dsh/profiles");
        default -> null;
      };
      result.put(id, new Detection(marker != null, marker));
    }
    current.set(Collections.unmodifiableMap(result));
  }

  public Map<String, Detection> all() { return current.get(); }
  public Detection get(String agent) { return current.get().getOrDefault(agent, new Detection(false, null)); }

  private Set<String> forcedAgents() {
    String value = environment.getProperty("AGENT_OPS_AGENTS");
    if (value == null || value.isBlank()) return null;
    Set<String> known = new HashSet<>();
    for (String id : value.split(",")) if (AgentProfiles.supports(id.trim().toLowerCase(Locale.ROOT))) known.add(id.trim().toLowerCase(Locale.ROOT));
    return known;
  }

  private static String existing(Path path, String label) { return Files.exists(path) ? label : null; }
  private static String first(String... values) { return Arrays.stream(values).filter(Objects::nonNull).findFirst().orElse(null); }
  private static boolean executableOnPath(String name, String path) {
    if (path == null || path.isBlank()) return false;
    String[] extensions = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win") ? new String[]{"", ".exe", ".cmd", ".bat"} : new String[]{""};
    for (String entry : path.split(java.io.File.pathSeparator)) for (String extension : extensions)
      if (Files.isRegularFile(Path.of(entry, name + extension))) return true;
    return false;
  }
}
