package com.agentops;

import com.agentops.service.IngestTokenService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class IngestTokenServiceTest {
  @TempDir Path tempDir;

  @Test
  void createsAndReloadsPrivateTokenFileThenAllowsOwnerReadAndDelete() throws Exception {
    Path file = tempDir.resolve("token");
    IngestTokenService first = new IngestTokenService(file);
    first.initialize();
    String firstValue = Files.readString(file).trim();

    assertThat(Base64.getUrlDecoder().decode(firstValue)).hasSize(32);
    assertThat(first.matches(firstValue)).isTrue();

    IngestTokenService second = new IngestTokenService(file);
    second.initialize();
    assertThat(Files.readString(file).trim()).isEqualTo(firstValue);
    assertThat(second.matches(firstValue)).isTrue();

    Files.delete(file);
    assertThat(file).doesNotExist();
  }

  @Test
  void reportsExistingEmptyTokenFileAndDoesNotRegenerateIt() throws Exception {
    Path file = tempDir.resolve("token");
    Files.createFile(file);

    assertThatThrownBy(() -> new IngestTokenService(file).initialize())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining(file.toAbsolutePath().normalize().toString())
        .hasMessageContaining("is empty")
        .hasMessageContaining("delete this file");
    assertThat(Files.size(file)).isZero();
  }
}
