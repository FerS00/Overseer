package com.agentops.controller;

import com.agentops.service.EventStoreService;
import com.agentops.service.IngestTokenService;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class IngestController {

  private final EventStoreService store;
  private final IngestTokenService tokenService;

  public IngestController(EventStoreService store, IngestTokenService tokenService) {
    this.store = store;
    this.tokenService = tokenService;
  }

  @PostMapping("/ingest")
  public Map<String, Object> ingest(@org.springframework.web.bind.annotation.RequestHeader(value = "X-Agent-Ops-Token", required = false) String token,
                                    @RequestBody Object body) {
    if (!tokenService.matches(token)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    int batchSize = body instanceof List<?> list ? list.size()
        : body instanceof Map<?, ?> map && map.get("events") instanceof List<?> eventList ? eventList.size() : 1;
    if (batchSize > 500) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Ingest batch exceeds 500 events");
    List<Map<String, Object>> events = extract(body);
    int ingested = 0;
    for (Map<String, Object> e : events) {
      if (store.publish(e)) ingested++;
    }
    return Map.of("ok", true, "ingested", ingested, "discarded", batchSize - ingested);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> extract(Object body) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (body instanceof List<?> list) {
      for (Object o : list) {
        if (o instanceof Map<?, ?>) {
          out.add((Map<String, Object>) o);
        }
      }
    } else if (body instanceof Map<?, ?> map) {
      Object evs = map.get("events");
      if (evs instanceof List<?> list) {
        for (Object o : list) {
          if (o instanceof Map<?, ?>) {
            out.add((Map<String, Object>) o);
          }
        }
      } else {
        out.add((Map<String, Object>) map);
      }
    }
    return out;
  }
}
