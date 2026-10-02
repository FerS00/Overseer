const PEM = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g;
const OPENAI = /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{4,}\b/gi;
const GITHUB = /\b(ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]{4,}\b/gi;
const AWS = /\bAKIA[0-9A-Z]{16}\b/g;
const BEARER = /\bBearer\s+["']?(?:[A-Za-z0-9]{24,}|[A-Za-z0-9._~+/-]*[._~+/-=][A-Za-z0-9._~+/-=]{5,})["']?/gi;
const ASSIGNMENT = /(^|[^A-Za-z0-9_])["']?(PASSWORD|PASSWD|TOKEN|SECRET|API_KEY)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi;
const AUTHORIZATION = /(\bAuthorization\s*:\s*)[^\r\n]+/gim;

export function redactText(input) {
  if (typeof input !== 'string' || input.length === 0) return input;
  return input
    .replace(PEM, '[clave privada redactada]')
    .replace(OPENAI, 'sk-***')
    .replace(GITHUB, (_all, prefix) => `${prefix}***`)
    .replace(AWS, 'AKIA***')
    .replace(BEARER, 'Bearer ***')
    .replace(ASSIGNMENT, (_all, before, name) => `${before}${name.toUpperCase()}=***`)
    .replace(AUTHORIZATION, (_all, prefix) => `${prefix}***`);
}

export function redactMeta(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactMeta);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactMeta(item)]));
  }
  return value;
}

export function redactFields(event) {
  return {
    ...event,
    title: redactText(event.title),
    detail: redactText(event.detail),
    tool: redactText(event.tool),
    meta: redactMeta(event.meta),
  };
}
