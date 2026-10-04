package com.agentops.controller;

import com.agentops.service.EventStoreService;
import com.agentops.service.AgentDetector;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;
import java.util.LinkedHashMap;

@RestController
@RequestMapping("/api")
public class DiagnosticsController {
  private final EventStoreService store;
  private final AgentDetector detector;
  public DiagnosticsController(EventStoreService store, AgentDetector detector) { this.store = store; this.detector = detector; }
  @GetMapping("/diagnostics")
  public Map<String, Object> diagnostics() {
    Map<String, Object> result = new LinkedHashMap<>(store.diagnostics());
    Map<String, Object> agents = new LinkedHashMap<>();
    detector.all().forEach((id, value) -> agents.put(id, Map.of("detected", value.detected(),
        "detected_by", value.detectedBy() == null ? "" : value.detectedBy(),
        "last_event_at", store.lastAgentEventAt(id) == null ? "" : store.lastAgentEventAt(id))));
    result.put("agents", agents); return result;
  }
}
