package com.agentops.config;

import java.util.List;
import java.util.Map;

/** Fixed, source-controlled agent catalog. */
public final class AgentProfiles {
  public record Profile(String id, String name, String color, String mascot, List<String> integrations,
                        Map<String, String> configuration) { }

  private static final List<Profile> ALL = List.of(
      new Profile("claude", "Claude Code", "#E5774A", "chispa", List.of("hooks"),
          Map.of("hook", "node hook.mjs claude")),
      new Profile("codex", "Codex", "#8FA2FF", "nodo", List.of("hooks", "rollouts"),
          Map.of("hook", "node hook.mjs codex", "rollouts", "AGENT_OPS_CODEX_SESSIONS")),
      new Profile("antigravity", "Antigravity", "#F28BC8", "astro", List.of("hooks"),
          Map.of("hook", "node hook.mjs antigravity")),
      new Profile("deepseek", "DeepSeek Harness", "#5CC8F5", "hondo", List.of("hooks"),
          Map.of("hook", "node hook.mjs deepseek")));

  private AgentProfiles() { }
  public static List<Profile> all() { return ALL; }
  public static boolean supports(String id) { return ALL.stream().anyMatch(p -> p.id().equals(id)); }
}
