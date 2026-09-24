import { AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS } from "@/core/data-view/ai-manageable-surfaces";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { dataViewNavigationHref, dataViewNavigationRanges } from "@/core/data-view/data-view-links";
import { DATA_VIEW_PATHS, ENTITY_TIMELINE_PARENT_PATHS } from "@/core/data-view/data-view-paths";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { parse, postprocess, preprocess } from "micromark";
import { decodeString } from "micromark-util-decode-string";

const INTERNAL_REFERENCE = "[internal reference]";
const REDACTED_VALUE = "[redacted]";
const INTERNAL_DETAILS = "[internal details]";

const UUID_PATTERN = /(^|[^0-9a-f])([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?=$|[^0-9a-f])/gi;
const PARTIAL_UUID_PATTERN = /(^|[^0-9a-f])([0-9a-f]{8}-(?:[0-9a-f]{0,4}(?:-[0-9a-f]{0,4}){0,3})?)$/gi;
const SAVED_VIEW_PATHS = AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS.map((surfaceKey) => DATA_VIEW_PATHS[surfaceKey]).filter(
  (path): path is string => path !== null,
);
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UUID_SOURCE = "[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}";
const VIEW_KEY_SOURCE = `(?:__all__|${UUID_SOURCE})`;
const LOCALE_PREFIX_SOURCE = `(?:(?:${APP_LOCALES.map(escapePattern).join("|")})/)?`;
const SAVED_VIEW_URL_PATTERN = new RegExp(
  `(^|[\\s(\\[<"'\\x60])(/${LOCALE_PREFIX_SOURCE}(?:(?:${SAVED_VIEW_PATHS.map((path) => escapePattern(path.slice(1))).join("|")})\\?view=${VIEW_KEY_SOURCE}|(?:${ENTITY_TIMELINE_PARENT_PATHS.map((path) => escapePattern(path.slice(1))).join("|")})/${UUID_SOURCE}\\?view=${VIEW_KEY_SOURCE}&viewSurface=${escapePattern(SURFACE.entityTimeline)}))(?=$|[\\s)\\]>"'\\x60!,.:;?])`,
  "g",
);
const VIEW_URL_STREAM_PATTERN = /[^\s()[\]<>"'`]*(?:\?|&)view=[^\s()[\]<>"'`]*/g;
const MAX_LOCALE_PREFIX_LENGTH = Math.max(...APP_LOCALES.map((locale) => locale.length + 1));
const MAX_STANDALONE_VIEW_URL_LENGTH =
  Math.max(...SAVED_VIEW_PATHS.map((path) => path.length)) + MAX_LOCALE_PREFIX_LENGTH + "?view=".length + 36;
const MAX_TIMELINE_VIEW_URL_LENGTH =
  Math.max(...ENTITY_TIMELINE_PARENT_PATHS.map((path) => path.length)) +
  MAX_LOCALE_PREFIX_LENGTH +
  1 +
  36 +
  "?view=".length +
  36 +
  "&viewSurface=".length +
  SURFACE.entityTimeline.length;
const MAX_SAVED_VIEW_URL_LENGTH = Math.max(MAX_STANDALONE_VIEW_URL_LENGTH, MAX_TIMELINE_VIEW_URL_LENGTH);
const PROTECTED_STREAM_CONTEXT_CHARS = 2;

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
const TOOL_PROTOCOL_PATTERN =
  /(?:^|\s)(?:assistant[ \t]+)?to[ \t]*=[ \t]*[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+[ \t]*(?:\((?:json|tool|code)\)|\r?\n[ \t]*[{[])/i;
const TOOL_PROTOCOL_PREFIX_PATTERN =
  /(?:^|\s)(?:assistant[ \t]+)?to[ \t]*=[ \t]*[a-z][a-z0-9_.-]*(?:[ \t]*\([a-z]*|[ \t]*\r?\n[ \t]*)?$/i;

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
const STREAM_TAIL_LENGTH = Math.max(
  64,
  MAX_SAVED_VIEW_URL_LENGTH + 2,
  ...PRIVATE_MARKERS.map((marker) => marker.length - 1),
);

const PROTECTED_STREAM_PATTERNS = [
  VIEW_URL_STREAM_PATTERN,
  SAVED_VIEW_URL_PATTERN,
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

type TextRange = { start: number; end: number };
type MarkdownContainer = TextRange & { type: string };
type CanonicalDestination = TextRange & { href: string };
type DataViewLink = TextRange & { label: TextRange };
type DataViewAutolink = TextRange & { href: string };

function modelAuthoredDataViewHref(value: string) {
  try {
    const target = new URL(value, "https://model-authored.invalid");
    if (!target.searchParams.has("view")) return null;
    const localePrefix = APP_LOCALES.find((locale) => target.pathname.startsWith(`/${locale}/`));
    const pathname = localePrefix ? target.pathname.slice(localePrefix.length + 1) : target.pathname;
    const knownPath =
      SAVED_VIEW_PATHS.includes(pathname) ||
      ENTITY_TIMELINE_PARENT_PATHS.some((parentPath) => pathname.startsWith(`${parentPath}/`));
    return knownPath ? `${pathname}${target.search}` : null;
  } catch {
    return null;
  }
}

function normalizedMarkdownIdentifier(value: string) {
  return decodeString(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function parsedMarkdownUrlRanges(value: string, origin?: string) {
  const canonicalDestinations: CanonicalDestination[] = [];
  const containers: MarkdownContainer[] = [];
  const dataViewAutolinks: DataViewAutolink[] = [];
  const dataViewDefinitionIdentifiers = new Set<string>();
  const dataViewDefinitions: TextRange[] = [];
  const dataViewLinks: DataViewLink[] = [];
  const definitionIdentifiers = new Map<number, string>();
  const definitionTitles: TextRange[] = [];
  const destinations: TextRange[] = [];
  const embeddedUrls: TextRange[] = [];
  const htmlContent: TextRange[] = [];
  const labels: TextRange[] = [];
  const opaqueContent: TextRange[] = [];
  const referenceLinks: Array<DataViewLink & { identifier: string }> = [];
  const structuralContexts: TextRange[] = [];
  const events = postprocess(
    parse()
      .document()
      .write(preprocess()(value, undefined, true)),
  );

  for (const [phase, token] of events) {
    if (phase !== "enter") continue;
    const start = token.start.offset;
    const end = token.end.offset;
    if (start === undefined || end === undefined) continue;
    if (["blockQuote", "listOrdered", "listUnordered"].includes(token.type)) {
      structuralContexts.push({ start, end });
      continue;
    }
    if (token.type === "label") {
      labels.push({ start, end });
      continue;
    }
    if (["codeFenced", "codeIndented", "codeText", "htmlFlow", "htmlText"].includes(token.type)) {
      opaqueContent.push({ start, end });
      if (["htmlFlow", "htmlText"].includes(token.type)) htmlContent.push({ start, end });
      continue;
    }
    if (["autolink", "definition", "image", "link"].includes(token.type)) {
      containers.push({ start, end, type: token.type });
      continue;
    }
    if (["definitionLabelString", "referenceString"].includes(token.type)) {
      const parent = containers
        .filter((container) => start >= container.start && end <= container.end)
        .sort((left, right) => left.end - left.start - (right.end - right.start))[0];
      if (!parent) continue;
      const identifier = normalizedMarkdownIdentifier(value.slice(start, end));
      if (token.type === "definitionLabelString" && parent.type === "definition")
        definitionIdentifiers.set(parent.start, identifier);
      else if (token.type === "referenceString" && parent.type === "link") {
        const label = labels.find((candidate) => candidate.start >= parent.start && candidate.end <= parent.end);
        if (label) referenceLinks.push({ start: parent.start, end: parent.end, label, identifier });
      }
      continue;
    }
    if (
      ![
        "autolinkProtocol",
        "definitionDestinationString",
        "definitionTitleString",
        "resourceDestinationString",
        "resourceTitleString",
      ].includes(token.type)
    )
      continue;
    embeddedUrls.push({ start, end });
    if (token.type === "definitionTitleString") definitionTitles.push({ start, end });
    if (!["autolinkProtocol", "definitionDestinationString", "resourceDestinationString"].includes(token.type))
      continue;

    const parent = containers
      .filter((container) => start >= container.start && end <= container.end)
      .sort((left, right) => left.end - left.start - (right.end - right.start))[0];
    if (!parent || !["autolink", "definition", "link"].includes(parent.type)) continue;
    const decodedDestination = decodeString(value.slice(start, end));
    const navigationHref = dataViewNavigationHref(decodedDestination, { origin });
    const modelAuthoredHref = modelAuthoredDataViewHref(decodedDestination);
    const dataViewHref = navigationHref ?? modelAuthoredHref;
    if (!dataViewHref) continue;
    destinations.push({ start, end });
    if (parent.type === "link") {
      const label = labels.find((candidate) => candidate.start >= parent.start && candidate.end <= parent.end);
      if (label) dataViewLinks.push({ start: parent.start, end: parent.end, label });
    } else if (parent.type === "autolink")
      dataViewAutolinks.push({ start: parent.start, end: parent.end, href: dataViewHref });
    else {
      const identifier = definitionIdentifiers.get(parent.start);
      if (identifier) {
        dataViewDefinitionIdentifiers.add(identifier);
        dataViewDefinitions.push({ start: parent.start, end: parent.end });
      }
    }
    if (navigationHref && /^https?:\/\//i.test(decodedDestination)) {
      canonicalDestinations.push({
        start: parent.type === "autolink" ? parent.start : start,
        end: parent.type === "autolink" ? parent.end : end,
        href: navigationHref,
      });
    }
  }

  const streamContainers = containers.map((container) => {
    if (container.type !== "definition") return container;
    const lineStart = value.lastIndexOf("\n", container.start - 1) + 1;
    const contextStart = structuralContexts
      .filter((context) => container.start >= context.start && container.end <= context.end)
      .reduce((start, context) => Math.min(start, context.start), lineStart);
    return { ...container, start: contextStart };
  });
  const streamOpaqueContent = opaqueContent.map((range) => {
    const lineStart = value.lastIndexOf("\n", range.start - 1) + 1;
    const contextStart = structuralContexts
      .filter((context) => range.start >= context.start && range.end <= context.end)
      .reduce((start, context) => Math.min(start, context.start), lineStart);
    return { start: contextStart, end: range.end };
  });

  for (const reference of referenceLinks)
    if (dataViewDefinitionIdentifiers.has(reference.identifier)) dataViewLinks.push(reference);

  return {
    canonicalDestinations,
    containers,
    dataViewAutolinks,
    dataViewDefinitions,
    dataViewLinks,
    definitionTitles,
    destinations,
    embeddedUrls,
    htmlContent,
    opaqueContent,
    streamContainers,
    streamOpaqueContent,
  };
}

function unwrapModelAuthoredDataViewLinks(value: string) {
  const markdown = parsedMarkdownUrlRanges(value);
  return [
    ...markdown.dataViewLinks.map((link) => ({
      start: link.start,
      end: link.end,
      text: plainModelAuthoredDataViewLinkLabel(value.slice(link.label.start + 1, link.label.end - 1)),
    })),
    ...markdown.dataViewDefinitions.map((definition) => ({ ...definition, text: "" })),
  ]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (plainValue, replacement) =>
        `${plainValue.slice(0, replacement.start)}${replacement.text}${plainValue.slice(replacement.end)}`,
      value,
    );
}

function isAlreadyRedactedDataViewDestination(value: string, appBaseUrl?: string) {
  const decodedValue = decodeString(value);
  const candidate =
    decodedValue.startsWith("<") && decodedValue.endsWith(">") ? decodedValue.slice(1, -1) : decodedValue;
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(candidate);
  if ((!absolute && !candidate.startsWith("/")) || candidate.startsWith("//")) return false;

  try {
    const base = new URL(appBaseUrl ?? "https://model-authored.invalid");
    const target = new URL(candidate, base);
    if (
      (absolute && (!appBaseUrl || target.origin !== base.origin)) ||
      target.username ||
      target.password ||
      target.hash
    )
      return false;
    const pathname = decodeURIComponent(target.pathname);
    const localePrefix = APP_LOCALES.find((locale) => pathname.startsWith(`/${locale}/`));
    const localPath = localePrefix ? pathname.slice(localePrefix.length + 1) : pathname;
    if (target.searchParams.get("view") !== INTERNAL_REFERENCE) return false;

    const queryKeys = [...target.searchParams.keys()];
    if (SAVED_VIEW_PATHS.includes(localPath)) return queryKeys.length === 1 && queryKeys[0] === "view";
    if (
      queryKeys.length !== 2 ||
      queryKeys[0] !== "view" ||
      queryKeys[1] !== "viewSurface" ||
      target.searchParams.get("viewSurface") !== SURFACE.entityTimeline
    )
      return false;
    const parentPath = ENTITY_TIMELINE_PARENT_PATHS.find((path) => localPath.startsWith(`${path}/`));
    return Boolean(parentPath && localPath.slice(parentPath.length + 1) === INTERNAL_REFERENCE);
  } catch {
    return false;
  }
}

function closingMarkdownDestinationIndex(value: string, start: number) {
  let depth = 1;
  for (let cursor = start; cursor < value.length; cursor += 1) {
    if (isEscaped(value, cursor)) continue;
    if (value[cursor] === "(") depth += 1;
    else if (value[cursor] === ")") depth -= 1;
    if (depth === 0) return cursor;
  }
  return null;
}

function unwrapAlreadyRedactedDataViewLinks(value: string, appBaseUrl?: string) {
  const opaqueContent = parsedMarkdownUrlRanges(value).opaqueContent;
  let output = "";
  let copiedUntil = 0;
  let cursor = 0;

  while (cursor < value.length) {
    const labelStart = value.indexOf("[", cursor);
    if (labelStart < 0) break;
    const opaque = opaqueContent.find((range) => labelStart >= range.start && labelStart < range.end);
    if (opaque) {
      cursor = opaque.end;
      continue;
    }
    if (value[labelStart - 1] === "!" && !isEscaped(value, labelStart - 1)) {
      cursor = labelStart + 1;
      continue;
    }
    const labelEnd = closingLabelIndex(value, labelStart);
    if (labelEnd === null || value[labelEnd + 1] !== "(") {
      cursor = labelStart + 1;
      continue;
    }
    const destinationEnd = closingMarkdownDestinationIndex(value, labelEnd + 2);
    if (destinationEnd === null) break;
    const destination = value.slice(labelEnd + 2, destinationEnd);
    if (!isAlreadyRedactedDataViewDestination(destination, appBaseUrl)) {
      cursor = labelEnd + 1;
      continue;
    }
    const label = plainModelAuthoredDataViewLinkLabel(value.slice(labelStart + 1, labelEnd));
    output += `${value.slice(copiedUntil, labelStart)}${label}`;
    copiedUntil = destinationEnd + 1;
    cursor = copiedUntil;
  }

  return copiedUntil === 0 ? value : `${output}${value.slice(copiedUntil)}`;
}

function redactModelAuthoredDataViewHref(href: string) {
  return href.replace(/([?&]view=)[^&\s]+/, `$1${INTERNAL_REFERENCE}`);
}

function neutralizeBareModelAuthoredDataViewUrls(value: string) {
  const markdown = parsedMarkdownUrlRanges(value);
  const bareDestinations = dataViewNavigationRanges(value).filter(
    (range) =>
      ![...markdown.containers, ...markdown.opaqueContent, ...markdown.htmlContent].some(
        (container) => range.start >= container.start && range.end <= container.end,
      ),
  );
  return [
    ...markdown.dataViewAutolinks.map((range) => ({
      start: range.start,
      end: range.end,
      text: redactModelAuthoredDataViewHref(range.href),
    })),
    ...bareDestinations.map((range) => ({
      start: range.start,
      end: range.end,
      text: redactModelAuthoredDataViewHref(range.href),
    })),
  ]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (plainValue, replacement) =>
        `${plainValue.slice(0, replacement.start)}${replacement.text}${plainValue.slice(replacement.end)}`,
      value,
    );
}

function canonicalizeSameOriginDataViewLinks(value: string, origin?: string) {
  if (!origin) return value;
  const markdown = parsedMarkdownUrlRanges(value, origin);
  const bareDestinations = dataViewNavigationRanges(value, { origin }).filter(
    (range) =>
      ![...markdown.containers, ...markdown.opaqueContent, ...markdown.htmlContent].some(
        (container) => range.start >= container.start && range.end <= container.end,
      ),
  );
  return [...markdown.canonicalDestinations, ...bareDestinations]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (canonicalValue, destination) =>
        `${canonicalValue.slice(0, destination.start)}${destination.href}${canonicalValue.slice(destination.end)}`,
      value,
    );
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

function toolProtocolStart(value: string) {
  return TOOL_PROTOCOL_PATTERN.exec(value)?.index ?? null;
}

function incompleteToolProtocolStart(value: string) {
  return TOOL_PROTOCOL_PREFIX_PATTERN.exec(value)?.index ?? null;
}

function isEscaped(value: string, index: number) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function markdownLinkStartBefore(value: string, match: RegExpMatchArray) {
  const matchStart = match.index ?? 0;
  const urlStart = matchStart + (match[1]?.length ?? 0);
  if (value[urlStart] !== "/" || value[urlStart - 1] !== "(" || value[urlStart - 2] !== "]") return null;

  for (let cursor = urlStart - 3; cursor >= 0; cursor -= 1) {
    if (value[cursor] !== "[") continue;
    while (cursor > 0 && value[cursor - 1] === "\\") cursor -= 1;
    return cursor;
  }
  return null;
}

function closingLabelIndex(value: string, start: number) {
  let depth = 1;
  for (let cursor = start + 1; cursor < value.length; cursor += 1) {
    if (isEscaped(value, cursor)) continue;
    if (value[cursor] === "[") depth += 1;
    else if (value[cursor] === "]") depth -= 1;
    if (depth === 0) return cursor;
  }
  return null;
}

function canStartDefinition(value: string, labelStart: number) {
  const lineStart = value.lastIndexOf("\n", labelStart - 1) + 1;
  return /^[ \t]{0,3}$/.test(value.slice(lineStart, labelStart));
}

function unresolvedMarkdownContainerStart(value: string, markdown: ReturnType<typeof parsedMarkdownUrlRanges>) {
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    if (value[cursor] !== "[" || isEscaped(value, cursor)) continue;
    const parsedContainer = markdown.containers.find(
      (container) => cursor >= container.start && cursor < container.end,
    );
    if (parsedContainer) {
      if (
        parsedContainer.type === "definition" &&
        !markdown.definitionTitles.some(
          (title) => title.start >= parsedContainer.start && title.end <= parsedContainer.end,
        )
      ) {
        return (
          markdown.streamContainers.find(
            (container) => container.type === "definition" && container.end === parsedContainer.end,
          )?.start ?? parsedContainer.start
        );
      }
      cursor = parsedContainer.end - 1;
      continue;
    }
    const opaque = markdown.opaqueContent.find((range) => cursor >= range.start && cursor < range.end);
    if (opaque) {
      cursor = opaque.end - 1;
      continue;
    }

    const labelEnd = closingLabelIndex(value, cursor);
    if (labelEnd === null || value[labelEnd + 1] === undefined) return cursor;
    if (value[labelEnd + 1] === "(")
      return value[cursor - 1] === "!" && !isEscaped(value, cursor - 1) ? cursor - 1 : cursor;
    if (value[labelEnd + 1] === ":" && canStartDefinition(value, cursor)) return cursor;
    cursor = labelEnd;
  }
  return null;
}

function unresolvedCodeSpanStart(value: string, markdown: ReturnType<typeof parsedMarkdownUrlRanges>) {
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    if (value[cursor] !== "`" || isEscaped(value, cursor)) continue;
    const opaque = markdown.opaqueContent.find((range) => cursor >= range.start && cursor < range.end);
    if (opaque) {
      cursor = opaque.end - 1;
      continue;
    }
    let runEnd = cursor + 1;
    while (value[runEnd] === "`") runEnd += 1;
    const runLength = runEnd - cursor;
    for (let candidate = runEnd; candidate < value.length; candidate += 1) {
      if (value[candidate] !== "`" || isEscaped(value, candidate)) continue;
      let candidateEnd = candidate + 1;
      while (value[candidateEnd] === "`") candidateEnd += 1;
      if (candidateEnd - candidate === runLength) {
        cursor = candidateEnd - 1;
        break;
      }
      candidate = candidateEnd - 1;
    }
    if (cursor < runEnd) return cursor;
  }
  return null;
}

function unresolvedHtmlStart(value: string, markdown: ReturnType<typeof parsedMarkdownUrlRanges>) {
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    if (value[cursor] !== "<" || isEscaped(value, cursor)) continue;
    const parsedRange = [...markdown.containers, ...markdown.opaqueContent].find(
      (range) => cursor >= range.start && cursor < range.end,
    );
    if (parsedRange) {
      cursor = parsedRange.end - 1;
      continue;
    }
    const next = value[cursor + 1];
    if (next === undefined || /[!/?A-Za-z]/.test(next)) return cursor;
  }
  return null;
}

function indentedContinuationContextStart(value: string, boundary: number) {
  if (boundary <= 0) return null;
  if (/^\r?\n(?: {4}|\t)/.test(value.slice(boundary))) return value.lastIndexOf("\n", boundary - 1) + 1;
  if (value[boundary - 1] === "\n" && /^(?: {4}|\t)/.test(value.slice(boundary)))
    return value.lastIndexOf("\n", boundary - 2) + 1;
  return null;
}

function protectStreamBoundary(value: string, requestedEnd: number) {
  let safeEnd = requestedEnd;
  const markdown = parsedMarkdownUrlRanges(value);
  while (true) {
    const previousSafeEnd = safeEnd;
    for (const range of markdown.streamContainers)
      if (range.start < safeEnd && range.end > safeEnd) safeEnd = range.start;
    for (const range of markdown.streamOpaqueContent)
      if (range.start < safeEnd && range.end >= safeEnd) safeEnd = range.start;
    const unresolvedContextStart = earliest(
      earliest(unresolvedMarkdownContainerStart(value, markdown), unresolvedCodeSpanStart(value, markdown)),
      unresolvedHtmlStart(value, markdown),
    );
    if (unresolvedContextStart !== null && unresolvedContextStart < safeEnd) safeEnd = unresolvedContextStart;
    const continuationContextStart = indentedContinuationContextStart(value, safeEnd);
    if (continuationContextStart !== null && continuationContextStart < safeEnd) safeEnd = continuationContextStart;

    for (const pattern of PROTECTED_STREAM_PATTERNS) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
        const end = match.index + match[0].length;
        const protectedStart =
          markdownLinkStartBefore(value, match) ?? Math.max(0, match.index - PROTECTED_STREAM_CONTEXT_CHARS);
        if (protectedStart >= safeEnd || end <= safeEnd) continue;
        safeEnd = protectedStart;
        break;
      }
    }

    if (
      safeEnd > 0 &&
      safeEnd < value.length &&
      !/\s/.test(value[safeEnd] ?? "") &&
      !/\s/.test(value[safeEnd - 1] ?? "")
    )
      while (safeEnd > 0 && !/\s/.test(value[safeEnd - 1] ?? "")) safeEnd -= 1;
    if (safeEnd === previousSafeEnd) return safeEnd;
  }
}

function redactCompleteAgentVisibleText(value: string) {
  return value
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
    .replace(INTERNAL_COST_PATTERN, INTERNAL_DETAILS);
}

function sanitizeTextFragment(value: string) {
  const withoutClosedPrivateContent = stripClosedPrivateContent(value);
  const unsafeStart = earliest(
    earliest(
      openPrivateContentStart(withoutClosedPrivateContent),
      incompletePrivateMarkerStart(withoutClosedPrivateContent),
    ),
    toolProtocolStart(withoutClosedPrivateContent),
  );
  const complete = replaceUuid(
    redactCompleteAgentVisibleText(
      unsafeStart === null ? withoutClosedPrivateContent : withoutClosedPrivateContent.slice(0, unsafeStart),
    ),
  );
  return replacePartialUuidTail(complete);
}

function plainModelAuthoredDataViewLinkLabel(value: string) {
  const decodedLabel = decodeString(value);
  const plainLabel = agentPlainTextPreview(decodedLabel, decodedLabel.length);
  return sanitizeTextFragment(plainLabel).replace(/[<>]/g, "");
}

function sanitizeVisibleText(value: string, appBaseUrl?: string) {
  const canonicalValue = canonicalizeSameOriginDataViewLinks(value, appBaseUrl);
  const withoutPreviouslyRedactedLinks = unwrapAlreadyRedactedDataViewLinks(canonicalValue, appBaseUrl);
  const withoutModelAuthoredLinks = unwrapModelAuthoredDataViewLinks(withoutPreviouslyRedactedLinks);
  return neutralizeBareModelAuthoredDataViewUrls(sanitizeTextFragment(withoutModelAuthoredLinks));
}

export function sanitizeAgentVisibleText(value: string) {
  return sanitizeVisibleText(value);
}

export function sanitizeAgentVisibleTextForApp(value: string, appBaseUrl: string) {
  return sanitizeVisibleText(value, appBaseUrl);
}

const LEGACY_USER_PAGE_CONTEXT_PREFIX =
  /^(?:\uFEFF)?[ \t]*<page_context[ \t]+route="[^"\r\n]{0,500}"[ \t]*\/>[ \t]*(?:\r?\n)?/i;

export function stripLegacyUserPageContextPrefix(value: string) {
  return value.replace(LEGACY_USER_PAGE_CONTEXT_PREFIX, "");
}

const MARKDOWN_BLOCK_PREFIX_PATTERN = /^[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d{1,9}[.)][ \t]+)/gm;
const MARKDOWN_RULE_LINE_PATTERN = /^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm;
const MARKDOWN_FENCE_PATTERN = /^[ \t]{0,3}(?:`{3,}|~{3,}).*$/gm;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]*\)/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]*\)/g;
const MARKDOWN_BOLD_ITALIC_PATTERN = /(\*{1,3})(?=\S)([\s\S]*?\S)\1/g;
const MARKDOWN_STRIKETHROUGH_PATTERN = /~~(?=\S)([\s\S]*?\S)~~/g;
const MARKDOWN_UNDERSCORE_EMPHASIS_PATTERN = /(?<![\w\\])(_{1,3})(?=\S)([\s\S]*?\S)\1(?![\w])/g;
const MARKDOWN_CODE_PATTERN = /`+([^`]+)`+/g;

export function agentPlainTextPreview(value: string, maxChars: number) {
  const plain = value
    .replace(MARKDOWN_FENCE_PATTERN, " ")
    .replace(MARKDOWN_RULE_LINE_PATTERN, " ")
    .replace(MARKDOWN_BLOCK_PREFIX_PATTERN, "")
    .replace(MARKDOWN_IMAGE_PATTERN, "$1")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(MARKDOWN_CODE_PATTERN, "$1")
    .replace(MARKDOWN_BOLD_ITALIC_PATTERN, "$2")
    .replace(MARKDOWN_STRIKETHROUGH_PATTERN, "$1")
    .replace(MARKDOWN_UNDERSCORE_EMPHASIS_PATTERN, "$2")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, maxChars);
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
  private toolProtocolRemoved = false;

  constructor(private readonly appBaseUrl?: string) {}

  get removedToolProtocol() {
    return this.toolProtocolRemoved;
  }

  push(value: string) {
    if (this.finished || this.toolProtocolRemoved) return "";
    this.buffer += value;

    const protocolStart = toolProtocolStart(this.buffer);
    if (protocolStart !== null) {
      const visible = sanitizeVisibleText(this.buffer.slice(0, protocolStart), this.appBaseUrl);
      this.buffer = "";
      this.toolProtocolRemoved = true;
      return visible;
    }

    const requestedEnd = Math.max(0, this.buffer.length - STREAM_TAIL_LENGTH);
    const unsafeStart = earliest(
      earliest(openPrivateContentStart(this.buffer), incompletePrivateMarkerStart(this.buffer)),
      incompleteToolProtocolStart(this.buffer),
    );
    const safeEnd = protectStreamBoundary(this.buffer, Math.min(requestedEnd, unsafeStart ?? this.buffer.length));
    const visible = sanitizeVisibleText(this.buffer.slice(0, safeEnd), this.appBaseUrl);
    this.buffer = this.buffer.slice(safeEnd);
    return visible;
  }

  finish() {
    if (this.finished) return "";
    this.finished = true;

    const protocolStart = toolProtocolStart(this.buffer);
    if (protocolStart !== null) {
      const visible = sanitizeVisibleText(this.buffer.slice(0, protocolStart), this.appBaseUrl);
      this.buffer = "";
      this.toolProtocolRemoved = true;
      return visible;
    }

    const visible = sanitizeVisibleText(this.buffer, this.appBaseUrl);
    this.buffer = "";
    return visible;
  }
}
