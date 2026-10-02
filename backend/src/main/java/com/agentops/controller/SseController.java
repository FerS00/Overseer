package com.agentops.controller;

import com.agentops.service.SseBroadcaster;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class SseController {

  private final SseBroadcaster broadcaster;
  private final com.agentops.service.EventStoreService store;

  public SseController(SseBroadcaster broadcaster, com.agentops.service.EventStoreService store) {
    this.broadcaster = broadcaster;
    this.store = store;
  }

  @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter stream(@RequestHeader(value = "Last-Event-ID", required = false) String lastEventId,
                           @RequestParam(value = "lastEventId", required = false) String queryId) {
    SseEmitter emitter = broadcaster.register();
    String cursor = lastEventId != null ? lastEventId : queryId;
    if (cursor != null) {
      try { broadcaster.replay(emitter, store.getAfter(Long.parseLong(cursor))); }
      catch (NumberFormatException ignored) { }
    }
    return emitter;
  }
}
