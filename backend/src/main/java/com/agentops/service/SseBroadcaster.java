package com.agentops.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

@Component
public class SseBroadcaster {

  private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

  public SseEmitter register() {
    SseEmitter emitter = new SseEmitter(0L);
    emitters.add(emitter);
    emitter.onCompletion(() -> emitters.remove(emitter));
    emitter.onTimeout(() -> emitters.remove(emitter));
    emitter.onError((e) -> emitters.remove(emitter));
    return emitter;
  }

  public void broadcast(Map<String, Object> event) {
    Map<String, Object> safeEvent = SecretRedactor.redactEvent(event);
    Object id = safeEvent.get("id");
    for (SseEmitter emitter : emitters) {
      try {
        SseEmitter.SseEventBuilder builder = SseEmitter.event().name("event").data(safeEvent);
        if (id != null) builder.id(String.valueOf(id));
        emitter.send(builder);
      } catch (Exception e) {
        emitters.remove(emitter);
      }
    }
  }

  public void replay(SseEmitter emitter, java.util.List<Map<String, Object>> events) {
    for (Map<String, Object> event : events) {
      try { Map<String, Object> safeEvent = SecretRedactor.redactEvent(event);
        emitter.send(SseEmitter.event().name("event").id(String.valueOf(safeEvent.get("id"))).data(safeEvent)); }
      catch (Exception e) { emitters.remove(emitter); break; }
    }
  }

  @Scheduled(fixedRate = 20000)
  public void heartbeat() {
    for (SseEmitter emitter : emitters) {
      try {
        emitter.send(SseEmitter.event().comment("ping"));
      } catch (Exception e) {
        emitters.remove(emitter);
      }
    }
  }
}
