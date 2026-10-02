package com.agentops;

import com.agentops.service.SessionStateMachine;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import static org.assertj.core.api.Assertions.assertThat;

class SessionStateMachineTest {
  @Test
  void transitionsFromActiveToIdleAndEndedUsingInjectedClock() {
    Instant lastEvent = Instant.parse("2026-10-02T10:00:00Z");
    Duration idleAfter = Duration.ofMinutes(10);
    assertThat(SessionStateMachine.state(lastEvent, null,
        Clock.fixed(lastEvent.plusSeconds(599), ZoneOffset.UTC), idleAfter)).isEqualTo("active");
    assertThat(SessionStateMachine.state(lastEvent, null,
        Clock.fixed(lastEvent.plusSeconds(600), ZoneOffset.UTC), idleAfter)).isEqualTo("idle");
    assertThat(SessionStateMachine.state(lastEvent, lastEvent.plusSeconds(601),
        Clock.fixed(lastEvent.plusSeconds(602), ZoneOffset.UTC), idleAfter)).isEqualTo("ended");
  }
}
