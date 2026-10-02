package com.agentops.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class SecretRedactor {
  private static final Pattern PEM = Pattern.compile("-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\\s\\S]*?-----END \\1-----");
  private static final Pattern OPENAI = Pattern.compile("(?i)\\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{4,}\\b");
  private static final Pattern GITHUB = Pattern.compile("(?i)\\b(ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]{4,}\\b");
  private static final Pattern AWS = Pattern.compile("\\bAKIA[0-9A-Z]{16}\\b");
  private static final Pattern BEARER = Pattern.compile("(?i)\\bBearer\\s+[\\\"']?(?:[A-Za-z0-9]{24,}|[A-Za-z0-9._~+/-]*[._~+/-=][A-Za-z0-9._~+/-=]{5,})[\\\"']?");
  private static final Pattern ASSIGNMENT = Pattern.compile("(?i)(?<![A-Za-z0-9_])[\\\"']?(PASSWORD|PASSWD|TOKEN|SECRET|API_KEY)[\\\"']?\\s*[:=]\\s*(?:\\\"[^\\\"\\r\\n]*\\\"|'[^'\\r\\n]*'|[^\\s,;]+)");
  private static final Pattern AUTHORIZATION = Pattern.compile("(?im)(\\bAuthorization\\s*:\\s*)[^\\r\\n]+");

  private SecretRedactor() { }

  public static String redact(String input) {
    if (input == null || input.isEmpty()) return input;
    String value = PEM.matcher(input).replaceAll("[clave privada redactada]");
    value = OPENAI.matcher(value).replaceAll("sk-***");
    Matcher github = GITHUB.matcher(value);
    StringBuffer githubOut = new StringBuffer();
    while (github.find()) github.appendReplacement(githubOut, Matcher.quoteReplacement(github.group(1) + "***"));
    github.appendTail(githubOut);
    value = AWS.matcher(githubOut.toString()).replaceAll("AKIA***");
    value = BEARER.matcher(value).replaceAll("Bearer ***");
    Matcher assignments = ASSIGNMENT.matcher(value);
    StringBuffer assignmentOut = new StringBuffer();
    while (assignments.find()) assignments.appendReplacement(assignmentOut,
        Matcher.quoteReplacement(assignments.group(1).toUpperCase(java.util.Locale.ROOT) + "=***"));
    assignments.appendTail(assignmentOut);
    Matcher authorization = AUTHORIZATION.matcher(assignmentOut.toString());
    return authorization.replaceAll("$1***");
  }

  public static Map<String, Object> redactMap(Map<?, ?> input) {
    Map<String, Object> output = new LinkedHashMap<>();
    input.forEach((key, value) -> output.put(String.valueOf(key), redactValue(value)));
    return output;
  }

  public static Map<String, Object> redactEvent(Map<String, Object> event) {
    Map<String, Object> safe = new LinkedHashMap<>(event);
    for (String field : List.of("title", "detail", "tool"))
      if (safe.get(field) instanceof String value) safe.put(field, redact(value));
    if (safe.get("meta") instanceof Map<?, ?> meta) safe.put("meta", redactMap(meta));
    return safe;
  }

  private static Object redactValue(Object value) {
    if (value instanceof String text) return redact(text);
    if (value instanceof Map<?, ?> map) return redactMap(map);
    if (value instanceof List<?> list) {
      List<Object> output = new ArrayList<>(list.size());
      for (Object item : list) output.add(redactValue(item));
      return output;
    }
    return value;
  }
}
