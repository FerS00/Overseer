package com.agentops.controller;

import com.agentops.config.AgentProfiles;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AgentsController {
  @GetMapping("/agents")
  public List<Map<String, Object>> agents() {
    return AgentProfiles.all().stream().map(p -> Map.<String, Object>of(
        "id", p.id(), "name", p.name(), "color", p.color(), "mascot", p.mascot(),
        "integrations", p.integrations(), "configuration", p.configuration())).toList();
  }
}
