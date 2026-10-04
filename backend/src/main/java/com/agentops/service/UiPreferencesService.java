package com.agentops.service;

import com.agentops.config.AgentProfiles;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
public class UiPreferencesService {
  private static final String ID = "default";
  private static final List<String> IDS = AgentProfiles.all().stream().map(AgentProfiles.Profile::id).toList();
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;

  public UiPreferencesService(JdbcTemplate jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }

  public Map<String, Object> get() {
    List<String> rows = jdbc.query("SELECT json FROM ui_preferences WHERE id = ?", (rs, row) -> rs.getString(1), ID);
    if (rows.isEmpty()) return defaults();
    try { return validate(mapper.readValue(rows.getFirst(), new TypeReference<>() { })); }
    catch (Exception invalid) { return defaults(); }
  }

  /** Fields missing from the request keep their stored value, so older clients never erase newer view options. */
  public Map<String, Object> put(Map<String, Object> raw) {
    if (raw == null) throw new IllegalArgumentException("Se requieren preferencias JSON");
    Map<String, Object> merged = new LinkedHashMap<>(get());
    merged.putAll(raw);
    Map<String, Object> safe = validate(merged);
    try {
      String json = mapper.writeValueAsString(safe);
      String updatedAt = Instant.now().toString();
      int updated = jdbc.update("UPDATE ui_preferences SET json = ?, updated_at = ? WHERE id = ?", json, updatedAt, ID);
      if (updated == 0) jdbc.update("INSERT INTO ui_preferences (id, json, updated_at) VALUES (?, ?, ?)", ID, json, updatedAt);
      return safe;
    } catch (Exception e) { throw new IllegalArgumentException("No se pudieron guardar las preferencias", e); }
  }

  public static Map<String, Object> defaults() {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("agentOrder", IDS); result.put("hiddenAgents", List.of()); result.put("layout", "automatic");
    result.put("density", "normal"); result.put("focusAgent", "claude");
    result.put("viewMode", "cabins"); result.put("dockHiddenAgents", List.of()); result.put("dockSize", "normal"); return result;
  }

  public static Map<String, Object> validate(Map<String, Object> raw) {
    if (raw == null) throw new IllegalArgumentException("Se requieren preferencias JSON");
    List<String> order = stringList(raw.get("agentOrder"), "agentOrder");
    if (order.size() != IDS.size() || new HashSet<>(order).size() != IDS.size() || !new HashSet<>(order).equals(new HashSet<>(IDS)))
      throw new IllegalArgumentException("agentOrder debe incluir una vez cada agente conocido");
    List<String> hidden = stringList(raw.get("hiddenAgents"), "hiddenAgents");
    if (new HashSet<>(hidden).size() != hidden.size() || !IDS.containsAll(hidden)) throw new IllegalArgumentException("hiddenAgents contiene ids duplicados o desconocidos");
    String layout = string(raw.get("layout"), "layout");
    String density = string(raw.get("density"), "density");
    String focus = string(raw.get("focusAgent"), "focusAgent");
    if (!Set.of("automatic", "row", "focus").contains(layout)) throw new IllegalArgumentException("layout no admitido");
    if (!Set.of("normal", "compact").contains(density)) throw new IllegalArgumentException("density no admitida");
    if (!IDS.contains(focus)) throw new IllegalArgumentException("focusAgent no admitido");
    String viewMode = raw.containsKey("viewMode") ? string(raw.get("viewMode"), "viewMode") : "cabins";
    List<String> dockHidden = raw.containsKey("dockHiddenAgents") ? stringList(raw.get("dockHiddenAgents"), "dockHiddenAgents") : List.of();
    String dockSize = raw.containsKey("dockSize") ? string(raw.get("dockSize"), "dockSize") : "normal";
    if (!Set.of("cabins", "dock").contains(viewMode)) throw new IllegalArgumentException("viewMode no admitido");
    if (new HashSet<>(dockHidden).size() != dockHidden.size() || !IDS.containsAll(dockHidden)) throw new IllegalArgumentException("dockHiddenAgents contiene ids duplicados o desconocidos");
    if (!Set.of("normal", "compact").contains(dockSize)) throw new IllegalArgumentException("dockSize no admitido");
    Map<String, Object> result = new LinkedHashMap<>(); result.put("agentOrder", order); result.put("hiddenAgents", hidden);
    result.put("layout", layout); result.put("density", density); result.put("focusAgent", focus);
    result.put("viewMode", viewMode); result.put("dockHiddenAgents", dockHidden); result.put("dockSize", dockSize); return result;
  }

  private static List<String> stringList(Object value, String field) {
    if (!(value instanceof List<?> list) || list.stream().anyMatch(item -> !(item instanceof String))) throw new IllegalArgumentException(field + " debe ser una lista de ids");
    return list.stream().map(String.class::cast).toList();
  }
  private static String string(Object value, String field) {
    if (!(value instanceof String text)) throw new IllegalArgumentException(field + " debe ser texto"); return text;
  }
}
