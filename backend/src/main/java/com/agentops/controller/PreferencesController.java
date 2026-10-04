package com.agentops.controller;

import com.agentops.service.UiPreferencesService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/preferences")
public class PreferencesController {
  private final UiPreferencesService preferences;
  public PreferencesController(UiPreferencesService preferences) { this.preferences = preferences; }
  @GetMapping public Map<String, Object> get() { return preferences.get(); }
  @PutMapping public Map<String, Object> put(@RequestBody Map<String, Object> body) {
    try { return preferences.put(body); }
    catch (IllegalArgumentException invalid) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, invalid.getMessage()); }
  }
}
