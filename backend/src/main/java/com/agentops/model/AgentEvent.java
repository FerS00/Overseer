package com.agentops.model;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.agentops.service.SecretRedactor;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "agent_events", indexes = {
    @Index(name = "idx_agent_ts", columnList = "ts"),
    @Index(name = "idx_agent_name", columnList = "agent")
})
public class AgentEvent {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true, length = 64)
  private String uid;

  @Column(nullable = false, length = 64)
  private String ts;

  @Column(nullable = false, length = 64)
  private String agent;

  @Column(name = "session_id", length = 128)
  private String sessionId;

  @Column(name = "parent_session_id", length = 128)
  private String parentSessionId;

  @Column(nullable = false, length = 16)
  private String source;

  @Column(nullable = false, length = 32)
  private String type;

  @Column(length = 32)
  private String status;

  @Column(length = 1000)
  private String title;

  @Column(columnDefinition = "TEXT")
  private String detail;

  @Column(length = 128)
  private String tool;

  @Column(columnDefinition = "TEXT")
  private String metaJson;

  public static AgentEvent fromMap(Map<String, Object> ev, ObjectMapper om) {
    AgentEvent a = new AgentEvent();
    a.setTs(str(ev.get("ts")));
    a.setUid(str(ev.get("uid")));
    a.setAgent(str(ev.get("agent")));
    a.setSessionId(nullableStr(ev.get("session_id")));
    a.setParentSessionId(nullableStr(ev.get("parent_session_id")));
    a.setSource(str(ev.getOrDefault("source", "ingest")));
    a.setType(str(ev.get("type")));
    a.setStatus(ev.get("status") == null ? null : str(ev.get("status")));
    a.setTitle(str(ev.get("title")));
    a.setDetail(str(ev.get("detail")));
    a.setTool(str(ev.get("tool")));
    Object meta = ev.get("meta");
    if (meta instanceof Map<?, ?> m && !m.isEmpty()) {
      try {
        a.setMetaJson(om.writeValueAsString(meta));
      } catch (Exception e) {
        a.setMetaJson(null);
      }
    }
    return a;
  }

  public Map<String, Object> toMap(ObjectMapper om) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", id);
    m.put("ts", ts);
    m.put("uid", uid);
    m.put("agent", agent);
    m.put("session_id", sessionId);
    m.put("parent_session_id", parentSessionId);
    m.put("source", source);
    m.put("type", type);
    m.put("status", status);
    m.put("title", title == null ? "" : title);
    m.put("detail", detail == null ? "" : detail);
    m.put("tool", tool == null ? "" : tool);
    if (metaJson != null && !metaJson.isBlank()) {
      try {
        m.put("meta", om.readValue(metaJson, new TypeReference<Map<String, Object>>() {}));
      } catch (Exception e) {
        m.put("meta", Map.of());
      }
    } else {
      m.put("meta", Map.of());
    }
    return SecretRedactor.redactEvent(m);
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static String nullableStr(Object o) { return o == null || String.valueOf(o).isBlank() ? null : String.valueOf(o); }

  public String getUid() { return uid; }
  public void setUid(String uid) { this.uid = uid; }
  public String getSessionId() { return sessionId; }
  public void setSessionId(String sessionId) { this.sessionId = sessionId; }
  public String getParentSessionId() { return parentSessionId; }
  public void setParentSessionId(String parentSessionId) { this.parentSessionId = parentSessionId; }
  public String getSource() { return source; }
  public void setSource(String source) { this.source = source; }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getTs() {
    return ts;
  }

  public void setTs(String ts) {
    this.ts = ts;
  }

  public String getAgent() {
    return agent;
  }

  public void setAgent(String agent) {
    this.agent = agent;
  }

  public String getType() {
    return type;
  }

  public void setType(String type) {
    this.type = type;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getDetail() {
    return detail;
  }

  public void setDetail(String detail) {
    this.detail = detail;
  }

  public String getTool() {
    return tool;
  }

  public void setTool(String tool) {
    this.tool = tool;
  }

  public String getMetaJson() {
    return metaJson;
  }

  public void setMetaJson(String metaJson) {
    this.metaJson = metaJson;
  }
}
