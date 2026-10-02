package com.agentops;

import com.agentops.service.SecretRedactor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;

import static org.assertj.core.api.Assertions.assertThat;

class SecretRedactorTest {
  @Test
  void matchesSharedPositiveAndNegativeCases() throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    try (InputStream input = getClass().getResourceAsStream("/redaction-cases.json")) {
      JsonNode cases = mapper.readTree(input);
      for (JsonNode item : cases.path("positive"))
        assertThat(SecretRedactor.redact(item.path("input").asText())).isEqualTo(item.path("expected").asText());
      for (JsonNode item : cases.path("negative")) {
        String value = item.asText();
        assertThat(SecretRedactor.redact(value)).isEqualTo(value);
      }
    }
  }
}
