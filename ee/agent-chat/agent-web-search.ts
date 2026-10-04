import type { AgentSurface } from "./agent-surface-policy";

import { gateway } from "ai";

import { isUnattendedSurface } from "./agent-surface-policy";

export const AGENT_WEB_SEARCH_TOOL_NAME = "web_search";
export const AGENT_WEB_SEARCH_DEFAULT_RESULTS = 3;
export const AGENT_WEB_SEARCH_DEFAULT_CONTENT_CHARS = 1_000;
export const AGENT_WEB_SEARCH_MAX_AGE_HOURS = 24;
export const AGENT_WEB_SEARCH_LIVECRAWL_TIMEOUT_MS = 5_000;
const AGENT_WEB_SOURCE_LIMIT = 8;
export const AGENT_WEB_SOURCE_MAX_LENGTH = 1_000;

export const AGENT_WEB_SEARCH_MAX_CALLS = { chat: 3, routine: 2 } as const;

export const AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS = 1_200_000;

export type AgentWebSearchOptions = {
  allowedDomains?: readonly string[];
};

export function agentWebSearchCallLimit(surface: AgentSurface): number {
  return isUnattendedSurface(surface) ? AGENT_WEB_SEARCH_MAX_CALLS.routine : AGENT_WEB_SEARCH_MAX_CALLS.chat;
}

type AgentWebSearchStep = { content: readonly unknown[]; providerMetadata?: unknown };

function billedAgentWebSearches(step: AgentWebSearchStep): number | null {
  const billed = record(record(record(step.providerMetadata)?.gateway)?.gatewayToolCalls)?.exa_search;
  return typeof billed === "number" && Number.isSafeInteger(billed) && billed >= 0 ? billed : null;
}

function isProviderWebSearchPart(raw: unknown, type: string) {
  const part = record(raw);
  return part?.type === type && part.toolName === AGENT_WEB_SEARCH_TOOL_NAME && part.providerExecuted === true;
}

export function agentWebSearchCallsInStep(step: AgentWebSearchStep): number {
  const calls = step.content.filter((raw) => isProviderWebSearchPart(raw, "tool-call")).length;
  return Math.max(calls, billedAgentWebSearches(step) ?? 0);
}

export function agentWebSearchChargeableCallsInStep(
  step: AgentWebSearchStep,
  isSuccessfulResult: (output: unknown) => boolean,
): number {
  const billed = billedAgentWebSearches(step);
  if (billed !== null) return billed;
  return step.content.filter(
    (raw) => isProviderWebSearchPart(raw, "tool-result") && isSuccessfulResult(record(raw)?.output),
  ).length;
}

function agentWebSearchConfig(options: AgentWebSearchOptions = {}) {
  return {
    type: "auto",
    numResults: AGENT_WEB_SEARCH_DEFAULT_RESULTS,
    ...(options.allowedDomains?.length ? { includeDomains: [...options.allowedDomains] } : {}),
    contents: {
      text: {
        maxCharacters: AGENT_WEB_SEARCH_DEFAULT_CONTENT_CHARS,
        verbosity: "compact",
        includeHtmlTags: false,
      },
      highlights: false,
      maxAgeHours: AGENT_WEB_SEARCH_MAX_AGE_HOURS,
      livecrawlTimeout: AGENT_WEB_SEARCH_LIVECRAWL_TIMEOUT_MS,
      subpages: 0,
      extras: { links: 0, imageLinks: 0 },
    },
  } satisfies Parameters<typeof gateway.tools.exaSearch>[0];
}

export function getAgentWebSearchTool(options: AgentWebSearchOptions = {}) {
  return gateway.tools.exaSearch(agentWebSearchConfig(options));
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function canonicalHttpsSource(value: unknown): string | null {
  if (typeof value !== "string" || value.length > AGENT_WEB_SOURCE_MAX_LENGTH) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function addOutputSources(value: unknown, sources: Set<string>) {
  const raw = record(value);
  if (raw?.type !== undefined && raw.type !== "json") return;
  const output = raw && "value" in raw ? record(raw.value) : raw;
  if (!output) return;
  const items = Array.isArray(output.results) ? output.results : Array.isArray(output.sources) ? output.sources : [];

  for (const item of items) {
    const source = record(item);
    if (source?.type !== undefined && source.type !== "url") continue;
    const url = canonicalHttpsSource(source?.url);
    if (url) sources.add(url);
    if (sources.size >= AGENT_WEB_SOURCE_LIMIT) break;
  }
}

export function collectAgentWebSources(messages: readonly unknown[]): string[] {
  const sources = new Set<string>();

  for (const rawMessage of messages) {
    const message = record(rawMessage);
    if (!message || !Array.isArray(message.content)) continue;

    for (const rawPart of message.content) {
      const part = record(rawPart);
      if (!part) continue;

      if (part.type === "tool-result" && part.toolName === AGENT_WEB_SEARCH_TOOL_NAME)
        addOutputSources(part.output, sources);
      if (part.type === "source" && part.sourceType === "url") {
        const url = canonicalHttpsSource(part.url);
        if (url) sources.add(url);
      }
      if (sources.size >= AGENT_WEB_SOURCE_LIMIT) return [...sources];
    }
  }

  return [...sources];
}

export function agentWebSourcesFooter(sources: readonly string[], heading: string): string {
  const canonical = new Set(sources.map(canonicalHttpsSource).filter((url): url is string => Boolean(url)));
  if (canonical.size === 0) return "";

  const links = [...canonical].slice(0, AGENT_WEB_SOURCE_LIMIT).map((source) => `- <${source}>`);

  return `\n\n### ${heading}\n${links.join("\n")}`;
}
