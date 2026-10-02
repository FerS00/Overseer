package com.agentops.controller;

import com.agentops.service.EventStoreService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class EventsController {

  private final EventStoreService store;

  public EventsController(EventStoreService store) {
    this.store = store;
  }

  @GetMapping("/events")
  public List<Map<String, Object>> events(@RequestParam(defaultValue = "200") int limit,
      @RequestParam(required = false) String agent, @RequestParam(required = false) String session,
      @RequestParam(required = false) String type, @RequestParam(required = false) String q,
      @RequestParam(required = false) String before) {
    return store.getRecent(limit, agent, session, type, q, before);
  }

  @GetMapping("/state")
  public Map<String, Object> state() {
    return store.getState();
  }
}
