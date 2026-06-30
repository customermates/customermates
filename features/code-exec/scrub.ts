// Best-effort redaction of secrets that sandboxed code might print, so they
// can't flow back through the model context. Defense in depth — the sandbox has
// no secrets in its environment to begin with.
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic keys
  /sk-[A-Za-z0-9]{20,}/g, // OpenAI-style keys
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /postgres(?:ql)?:\/\/[^\s'"]+/gi, // DB connection strings
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWTs
];

export function scrubSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}
