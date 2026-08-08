const INTERNAL_REFERENCE = "[internal reference]";
const REDACTED_VALUE = "[redacted]";
const INTERNAL_DETAILS = "[internal details]";

const UUID_PATTERN = /(^|[^0-9a-f])([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?=$|[^0-9a-f])/gi;
const PARTIAL_UUID_PATTERN = /(^|[^0-9a-f])([0-9a-f]{8}-(?:[0-9a-f]{0,4}(?:-[0-9a-f]{0,4}){0,3})?)$/gi;
const PAGE_CONTEXT_BLOCK_PATTERN = /<page_context\b[^>]*>[\s\S]*?<\/page_context\s*>/gi;
const PAGE_CONTEXT_TAG_PATTERN = /<\/?page_context\b[^>]*>/gi;
const ENCODED_PAGE_CONTEXT_BLOCK_PATTERN = /&lt;page_context\b[\s\S]*?&gt;[\s\S]*?&lt;\/page_context\s*&gt;/gi;
const ENCODED_PAGE_CONTEXT_TAG_PATTERN = /&lt;\/?page_context\b[\s\S]*?&gt;/gi;
const PRIVATE_REASONING_BLOCK_PATTERN =
  /<(analysis|reasoning|think|thinking|internal_reasoning)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const PRIVATE_REASONING_TAG_PATTERN = /<\/?(?:analysis|reasoning|think|thinking|internal_reasoning)\b[^>]*>/gi;
const PRIVATE_REASONING_FENCE_PATTERN =
  /```[ \t]*(?:analysis|reasoning|thinking|chain[-_ ]of[-_ ]thought|internal)\b[^\r\n]*(?:\r?\n)?[\s\S]*?```/gi;
const PRIVATE_KEY_BLOCK_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi;
const AUTHORIZATION_HEADER_PATTERN =
  /(\b(?:authorization|proxy-authorization)\b\s*[:=]\s*)(?:bearer|basic)\s+[^\r\n]*/gi;
const COOKIE_HEADER_PATTERN = /(\b(?:cookie|set-cookie)\b\s*[:=]\s*)[^\r\n]*/gi;
const SECRET_LABEL_SOURCE =
  "(?:api[ _-]?key|password|passcode|secret|client[ _-]?secret|access[ _-]?token|refresh[ _-]?token|auth[ _-]?token|credential)";
const SECRET_ASSIGNMENT_PATTERN = new RegExp(
  `(\\b${SECRET_LABEL_SOURCE}\\b\\s*[:=]\\s*)(?!(?:\\[redacted\\]|\\[internal details\\]))(?:"[^"\\r\\n]*(?:"|$)|'[^'\\r\\n]*(?:'|$)|[^\\s,;}\\]"'\\r\\n]+)`,
  "gi",
);
const URL_CREDENTIAL_PATTERN = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]+@/gi;
const BARE_SECRET_PATTERN =
  /\b(?:sk-(?:proj-)?[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9_]{10,}|github_pat_[a-z0-9_]{10,}|xox[baprs]-[a-z0-9-]{8,}|AKIA[A-Z0-9]{16}|AIza[a-z0-9_-]{20,})\b/gi;
const JWT_PATTERN = /\beyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\b/gi;
const INTERNAL_METADATA_LABEL_SOURCE =
  "(?:provider(?:[ _-]?(?:id|name|metadata|usage))?|model[ _-]?(?:id|name)|input[ _-]?tokens?|output[ _-]?tokens?|reasoning[ _-]?tokens?|cache(?:d|[ _-]?(?:read|write))[ _-]?tokens?|token[ _-]?usage|cost[ _-]?microcents?|internal[ _-]?(?:model[ _-]?)?cost)";
const INTERNAL_METADATA_ASSIGNMENT_PATTERN = new RegExp(
  `(?:["']?\\b${INTERNAL_METADATA_LABEL_SOURCE}\\b["']?\\s*[:=]\\s*)(?:"[^"\\r\\n]*(?:"|$)|'[^'\\r\\n]*(?:'|$)|[^\\s,;}\\]"'\\r\\n]+)`,
  "gi",
);
const MODEL_ID_PATTERN = /\b(?:gpt-\d[a-z0-9_.-]*|claude-[a-z0-9_.-]+|gemini-[a-z0-9_.-]+)\b/gi;
const TOKEN_COUNT_PATTERN = /\b\d[\d,.]*\s+(?:(?:input|output|reasoning|cached)\s+)?tokens?\b/gi;
const INTERNAL_COST_PATTERN =
  /\b(?:internal\s+)?(?:model|provider)\s+cost(?:s|ed)?\s*(?::|=|is|was)?\s*(?:[$€£]\s*)?\d[\d.,]*/gi;

const PRIVATE_MARKERS = [
  "<page_context",
  "</page_context",
  "&lt;page_context",
  "&lt;/page_context",
  "<analysis",
  "</analysis",
  "<reasoning",
  "</reasoning",
  "<think",
  "</think",
  "<thinking",
  "</thinking",
  "<internal_reasoning",
  "</internal_reasoning",
  "```analysis",
  "```reasoning",
  "```thinking",
  "```chain-of-thought",
  "```internal",
  "-----begin ",
] as const;
const STREAM_TAIL_LENGTH = Math.max(64, ...PRIVATE_MARKERS.map((marker) => marker.length - 1));

const PROTECTED_STREAM_PATTERNS = [
  UUID_PATTERN,
  PAGE_CONTEXT_BLOCK_PATTERN,
  PAGE_CONTEXT_TAG_PATTERN,
  ENCODED_PAGE_CONTEXT_BLOCK_PATTERN,
  ENCODED_PAGE_CONTEXT_TAG_PATTERN,
  PRIVATE_REASONING_BLOCK_PATTERN,
  PRIVATE_REASONING_FENCE_PATTERN,
  PRIVATE_KEY_BLOCK_PATTERN,
  AUTHORIZATION_HEADER_PATTERN,
  COOKIE_HEADER_PATTERN,
  SECRET_ASSIGNMENT_PATTERN,
  URL_CREDENTIAL_PATTERN,
  BARE_SECRET_PATTERN,
  JWT_PATTERN,
  INTERNAL_METADATA_ASSIGNMENT_PATTERN,
  MODEL_ID_PATTERN,
  TOKEN_COUNT_PATTERN,
  INTERNAL_COST_PATTERN,
] as const;

function earliest(current: number | null, candidate: number | null) {
  if (candidate === null) return current;
  return current === null ? candidate : Math.min(current, candidate);
}

function replaceUuid(value: string) {
  return value.replace(UUID_PATTERN, (_match, prefix: string) => `${prefix}${INTERNAL_REFERENCE}`);
}

function replacePartialUuidTail(value: string) {
  return value.replace(PARTIAL_UUID_PATTERN, (_match, prefix: string) => `${prefix}${INTERNAL_REFERENCE}`);
}

function stripClosedPrivateContent(value: string) {
  return value
    .replace(PRIVATE_REASONING_BLOCK_PATTERN, "")
    .replace(PRIVATE_REASONING_FENCE_PATTERN, "")
    .replace(PAGE_CONTEXT_BLOCK_PATTERN, "")
    .replace(ENCODED_PAGE_CONTEXT_BLOCK_PATTERN, "")
    .replace(PRIVATE_KEY_BLOCK_PATTERN, REDACTED_VALUE);
}

const PRIVATE_REASONING_CLOSE_PATTERNS: Record<string, RegExp> = {
  analysis: /<\/analysis\s*>/i,
  reasoning: /<\/reasoning\s*>/i,
  think: /<\/think\s*>/i,
  thinking: /<\/thinking\s*>/i,
  internal_reasoning: /<\/internal_reasoning\s*>/i,
};

function openPrivateContentStart(value: string) {
  let start: number | null = null;

  const reasoningOpen = /<(analysis|reasoning|think|thinking|internal_reasoning)\b[^>]*>/gi;
  for (const match of value.matchAll(reasoningOpen)) {
    const close = PRIVATE_REASONING_CLOSE_PATTERNS[(match[1] ?? "").toLowerCase()];
    if (!close || !close.test(value.slice((match.index ?? 0) + match[0].length)))
      start = earliest(start, match.index ?? 0);
  }

  const fenceOpen = /```[ \t]*(?:analysis|reasoning|thinking|chain[-_ ]of[-_ ]thought|internal)\b[^\r\n]*/gi;
  for (const match of value.matchAll(fenceOpen))
    if (!value.slice((match.index ?? 0) + match[0].length).includes("```")) start = earliest(start, match.index ?? 0);

  const pageOpen = /<page_context\b[^>]*>/gi;
  for (const match of value.matchAll(pageOpen)) {
    if (
      match[0].trimEnd().endsWith("/>") ||
      /<\/page_context\s*>/i.test(value.slice((match.index ?? 0) + match[0].length))
    )
      continue;
    start = earliest(start, match.index ?? 0);
  }

  const privateKeyStart = value.search(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i);
  if (privateKeyStart >= 0 && !/-----END [A-Z0-9 ]*PRIVATE KEY-----/i.test(value.slice(privateKeyStart)))
    start = earliest(start, privateKeyStart);

  return start;
}

function incompletePrivateMarkerStart(value: string) {
  const lower = value.toLowerCase();
  let start: number | null = null;

  for (const marker of PRIVATE_MARKERS) {
    const fullStart = lower.lastIndexOf(marker);
    if (fullStart >= 0) {
      const tail = lower.slice(fullStart);
      if (
        ((marker.startsWith("<") || marker.startsWith("&lt;")) &&
          !tail.includes(marker.startsWith("&lt;") ? "&gt;" : ">")) ||
        (marker === "-----begin " && !tail.includes("-----"))
      )
        start = earliest(start, fullStart);
    }

    for (let length = Math.min(marker.length - 1, lower.length); length > 0; length -= 1) {
      if (!lower.endsWith(marker.slice(0, length))) continue;
      start = earliest(start, lower.length - length);
      break;
    }
  }

  return start;
}

function protectStreamBoundary(value: string, requestedEnd: number) {
  let safeEnd = requestedEnd;
  let changed = true;

  while (changed) {
    changed = false;
    for (const pattern of PROTECTED_STREAM_PATTERNS) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
        const end = match.index + match[0].length;
        if (match.index >= safeEnd || end <= safeEnd) continue;
        safeEnd = match.index;
        changed = true;
        break;
      }
    }
  }

  return safeEnd;
}

function redactCompleteAgentVisibleText(value: string) {
  return replaceUuid(
    value
      .replace(PAGE_CONTEXT_TAG_PATTERN, "")
      .replace(ENCODED_PAGE_CONTEXT_TAG_PATTERN, "")
      .replace(PRIVATE_REASONING_TAG_PATTERN, "")
      .replace(AUTHORIZATION_HEADER_PATTERN, `$1${REDACTED_VALUE}`)
      .replace(COOKIE_HEADER_PATTERN, `$1${REDACTED_VALUE}`)
      .replace(URL_CREDENTIAL_PATTERN, `$1${REDACTED_VALUE}@`)
      .replace(SECRET_ASSIGNMENT_PATTERN, `$1${REDACTED_VALUE}`)
      .replace(BARE_SECRET_PATTERN, REDACTED_VALUE)
      .replace(JWT_PATTERN, REDACTED_VALUE)
      .replace(INTERNAL_METADATA_ASSIGNMENT_PATTERN, INTERNAL_DETAILS)
      .replace(MODEL_ID_PATTERN, INTERNAL_DETAILS)
      .replace(TOKEN_COUNT_PATTERN, INTERNAL_DETAILS)
      .replace(INTERNAL_COST_PATTERN, INTERNAL_DETAILS),
  );
}

export function sanitizeAgentVisibleText(value: string) {
  const withoutClosedPrivateContent = stripClosedPrivateContent(value);
  const unsafeStart = earliest(
    openPrivateContentStart(withoutClosedPrivateContent),
    incompletePrivateMarkerStart(withoutClosedPrivateContent),
  );
  const complete = redactCompleteAgentVisibleText(
    unsafeStart === null ? withoutClosedPrivateContent : withoutClosedPrivateContent.slice(0, unsafeStart),
  );
  return replacePartialUuidTail(complete);
}

const LEGACY_USER_PAGE_CONTEXT_PREFIX =
  /^(?:\uFEFF)?[ \t]*<page_context[ \t]+route="[^"\r\n]{0,500}"[ \t]*\/>[ \t]*(?:\r?\n)?/i;

export function stripLegacyUserPageContextPrefix(value: string) {
  return value.replace(LEGACY_USER_PAGE_CONTEXT_PREFIX, "");
}

export function sanitizeAgentConversationTitle(value: string | null | undefined) {
  if (!value) return null;
  const title = sanitizeAgentVisibleText(stripLegacyUserPageContextPrefix(value))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return title || null;
}

export class AgentVisibleTextStreamSanitizer {
  private buffer = "";
  private finished = false;

  push(value: string) {
    if (this.finished) return "";
    this.buffer += value;

    const requestedEnd = Math.max(0, this.buffer.length - STREAM_TAIL_LENGTH);
    const privateStart = earliest(openPrivateContentStart(this.buffer), incompletePrivateMarkerStart(this.buffer));
    const safeEnd = protectStreamBoundary(this.buffer, Math.min(requestedEnd, privateStart ?? this.buffer.length));
    const visible = sanitizeAgentVisibleText(this.buffer.slice(0, safeEnd));
    this.buffer = this.buffer.slice(safeEnd);
    return visible;
  }

  finish() {
    if (this.finished) return "";
    this.finished = true;

    const visible = sanitizeAgentVisibleText(this.buffer);
    this.buffer = "";
    return visible;
  }
}
