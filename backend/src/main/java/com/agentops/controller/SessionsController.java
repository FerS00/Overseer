package com.agentops.controller;

import com.agentops.service.SessionTracker;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SessionsController {
  private final SessionTracker tracker;
  public SessionsController(SessionTracker tracker) { this.tracker = tracker; }
  @GetMapping("/sessions")
  public List<Map<String, Object>> sessions(@RequestParam(required = false) String agent,
                                            @RequestParam(required = false) Boolean active) {
    return tracker.list(agent, active);
  }
}
