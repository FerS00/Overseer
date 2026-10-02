package com.agentops.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

public final class SessionStateMachine {
  private SessionStateMachine() { }

  public static String state(Instant lastEventAt, Instant endedAt, Clock clock, Duration idleAfter) {
    if (endedAt != null) return "ended";
    return Duration.between(lastEventAt, clock.instant()).compareTo(idleAfter) >= 0 ? "idle" : "active";
  }
}
