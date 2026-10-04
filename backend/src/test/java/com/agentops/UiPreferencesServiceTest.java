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
    assertThat(UiPreferencesService.validate(raw)).isEqualTo(raw);
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
