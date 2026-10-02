package com.agentops.service;

import com.agentops.config.AppProperties;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Set;

@Component
public class IngestTokenService {
  private static final Set<PosixFilePermission> FILE_PERMISSIONS = PosixFilePermissions.fromString("rw-------");
  private final Path tokenPath;
  private volatile byte[] token;

  @Autowired
  public IngestTokenService(AppProperties properties) {
    this(Path.of(properties.getTokenFile()));
  }

  public IngestTokenService(Path tokenPath) {
    this.tokenPath = tokenPath.toAbsolutePath().normalize();
  }

  @PostConstruct
  public synchronized void initialize() {
    if (token != null) return;
    try {
      Path parent = tokenPath.getParent();
      if (parent != null) {
        Files.createDirectories(parent);
      }
      if (Files.notExists(tokenPath)) {
        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        String generated = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        try {
          try (var output = Files.newOutputStream(tokenPath, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            output.write((generated + System.lineSeparator()).getBytes(StandardCharsets.US_ASCII));
          }
        } catch (FileAlreadyExistsException race) {
          // Another process created the token first; use the file it completed.
        }
      }
      String stored;
      try {
        stored = Files.readString(tokenPath, StandardCharsets.US_ASCII).trim();
      } catch (Exception e) {
        throw unusableTokenFile("cannot be read", e);
      }
      if (stored.isEmpty()) throw unusableTokenFile("is empty", null);
      setPermissions(tokenPath, FILE_PERMISSIONS);
      token = stored.getBytes(StandardCharsets.UTF_8);
    } catch (Exception e) {
      if (e instanceof IllegalStateException state && state.getMessage() != null
          && state.getMessage().contains(tokenPath.toString())) throw state;
      throw new IllegalStateException("Could not initialize ingest token file at " + tokenPath, e);
    }
  }

  public boolean matches(String supplied) {
    byte[] expected = token;
    if (expected == null || supplied == null) return false;
    return MessageDigest.isEqual(expected, supplied.getBytes(StandardCharsets.UTF_8));
  }

  private static void setPermissions(Path path, Set<PosixFilePermission> permissions) {
    try {
      Files.setPosixFilePermissions(path, permissions);
      return;
    } catch (UnsupportedOperationException | java.io.IOException | SecurityException ignored) { }
    try {
      AclFileAttributeView acl = Files.getFileAttributeView(path, AclFileAttributeView.class);
      if (acl == null) return;
      acl.setAcl(java.util.List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(acl.getOwner())
          .setPermissions(java.util.EnumSet.of(AclEntryPermission.READ_DATA, AclEntryPermission.WRITE_DATA,
              AclEntryPermission.APPEND_DATA, AclEntryPermission.READ_NAMED_ATTRS, AclEntryPermission.WRITE_NAMED_ATTRS,
              AclEntryPermission.READ_ATTRIBUTES, AclEntryPermission.WRITE_ATTRIBUTES, AclEntryPermission.READ_ACL,
              AclEntryPermission.WRITE_ACL, AclEntryPermission.DELETE, AclEntryPermission.SYNCHRONIZE)).build()));
    } catch (UnsupportedOperationException | java.io.IOException | SecurityException ignored) { }
  }

  private IllegalStateException unusableTokenFile(String reason, Exception cause) {
    return new IllegalStateException("Ingest token file " + tokenPath + " " + reason
        + ". Stop the backend, delete this file, then restart to create a new token.", cause);
  }
}
