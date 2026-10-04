package com.agentops;

import com.agentops.service.AgentDetector;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AgentDetectorTest {
  @TempDir Path root;

  @Test
  void findsOnlyTheDeepSeekMarkerWithoutReadingItsContents() throws Exception {
    Path profileHome = Files.createDirectories(root.resolve(".dsh/profiles"));
    Files.writeString(profileHome.resolve("private.yml"), "secret: do not read");
    MockEnvironment environment = new MockEnvironment()
        .withProperty("agent-ops.agents.claude-home", root.resolve("missing-claude").toString())
        .withProperty("agent-ops.agents.codex-home", root.resolve("missing-codex").toString())
        .withProperty("agent-ops.agents.antigravity-home", root.resolve("missing-antigravity").toString())
        .withProperty("agent-ops.agents.deepseek-home", profileHome.toString())
        .withProperty("PATH", "")
        .withProperty("LOCALAPPDATA", root.resolve("appdata").toString());

    AgentDetector detector = new AgentDetector(environment);
    assertThat(detector.all()).containsEntry("deepseek", new AgentDetector.Detection(true, "~/.dsh/profiles"));
    assertThat(detector.all().entrySet().stream().filter(entry -> entry.getValue().detected()).map(Map.Entry::getKey).toList()).containsExactly("deepseek");
  }

  @Test
  void dockerOverrideSelectsOnlyKnownConfiguredAgents() {
    MockEnvironment environment = new MockEnvironment().withProperty("AGENT_OPS_AGENTS", "claude,codex,unknown");
    AgentDetector detector = new AgentDetector(environment);
    assertThat(detector.all().get("claude").detectedBy()).isEqualTo("AGENT_OPS_AGENTS");
    assertThat(detector.all().get("codex").detected()).isTrue();
    assertThat(detector.all().get("antigravity").detected()).isFalse();
    assertThat(detector.all()).doesNotContainKey("unknown");
  }
}
