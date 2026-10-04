package com.agentops.controller;

import com.agentops.config.AgentProfiles;
import com.agentops.service.AgentDetector;
import com.agentops.service.EventStoreService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;

@RestController
@RequestMapping("/api")
public class AgentsController {
  private final AgentDetector detector;
  private final EventStoreService store;
  public AgentsController(AgentDetector detector, EventStoreService store) { this.detector = detector; this.store = store; }

  @GetMapping("/agents")
  public List<Map<String, Object>> agents() {
    List<Map<String, Object>> result = new ArrayList<>();
    for (var profile : AgentProfiles.all()) {
      var detection = detector.get(profile.id());
      Map<String, Object> item = new java.util.LinkedHashMap<>();
      item.put("id", profile.id()); item.put("name", profile.name()); item.put("color", profile.color());
      item.put("mascot", profile.mascot()); item.put("integrations", profile.integrations());
      item.put("sources", profile.integrations()); item.put("configuration", profile.configuration());
      item.put("detected", detection.detected()); item.put("detected_by", detection.detectedBy());
      item.put("last_event_at", store.lastAgentEventAt(profile.id())); result.add(item);
    }
    return List.copyOf(result);
  }
}
