package com.agentops;

import com.agentops.service.UiPreferencesService;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UiPreferencesServiceTest {
  @Test
  void acceptsCompleteKnownOrderAndViewPreferences() {
    Map<String, Object> raw = Map.of("agentOrder", List.of("deepseek", "claude", "codex", "antigravity"),
        "hiddenAgents", List.of("codex"), "layout", "focus", "density", "compact", "focusAgent", "deepseek");
    assertThat(UiPreferencesService.validate(raw)).containsAllEntriesOf(raw)
        .containsEntry("viewMode", "cabins").containsEntry("dockHiddenAgents", List.of()).containsEntry("dockSize", "normal");
  }

  @Test
  void acceptsDockOptionsAndRejectsUnsupportedOnes() {
    Map<String, Object> raw = new HashMap<>(UiPreferencesService.defaults());
    raw.put("viewMode", "dock"); raw.put("dockHiddenAgents", List.of("deepseek")); raw.put("dockSize", "compact");
    assertThat(UiPreferencesService.validate(raw)).isEqualTo(raw);
    for (Map.Entry<String, Object> invalid : List.<Map.Entry<String, Object>>of(Map.entry("viewMode", "floating"), Map.entry("dockSize", "large"),
        Map.entry("dockHiddenAgents", List.of("claude", "claude")), Map.entry("dockHiddenAgents", List.of("other")), Map.entry("viewMode", 3))) {
      Map<String, Object> copy = new HashMap<>(raw); copy.put(invalid.getKey(), invalid.getValue());
      assertThatThrownBy(() -> UiPreferencesService.validate(copy)).isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void rejectsUnknownOrDuplicateAgentIdsAndUnsupportedViewOptions() {
    Map<String, Object> base = new HashMap<>(UiPreferencesService.defaults());
    base.put("agentOrder", List.of("claude", "codex", "antigravity", "codex"));
    assertThatThrownBy(() -> UiPreferencesService.validate(base)).isInstanceOf(IllegalArgumentException.class);
    base.put("agentOrder", List.of("claude", "codex", "antigravity", "deepseek")); base.put("layout", "grid");
    assertThatThrownBy(() -> UiPreferencesService.validate(base)).isInstanceOf(IllegalArgumentException.class);
  }
}
