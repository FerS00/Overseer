package com.agentops.controller;

import com.agentops.service.EventStoreService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class DiagnosticsController {
  private final EventStoreService store;
  public DiagnosticsController(EventStoreService store) { this.store = store; }
  @GetMapping("/diagnostics")
  public Map<String, Object> diagnostics() { return store.diagnostics(); }
}
