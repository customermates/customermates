import { gateway } from "ai";

export const AGENT_WEB_SEARCH_TOOL_NAME = "web_search";
export const AGENT_WEB_SEARCH_RELEASED = false;
export const AGENT_WEB_SEARCH_MAX_RESULTS = 3;
export const AGENT_WEB_SEARCH_MAX_TOKENS = 1_024;
export const AGENT_WEB_SEARCH_USD_PER_REQUEST = 0.005;
const AGENT_WEB_SOURCE_LIMIT = 8;
export const AGENT_WEB_SOURCE_MAX_LENGTH = 1_000;

export type AgentWebSearchOptions = {
  allowedDomains?: readonly string[];
};

export function getAgentWebSearchTool(options: AgentWebSearchOptions = {}) {
  return gateway.tools.perplexitySearch({
    maxResults: AGENT_WEB_SEARCH_MAX_RESULTS,
    maxTokens: AGENT_WEB_SEARCH_MAX_TOKENS,
    maxTokensPerPage: 512,
    ...(options.allowedDomains?.length ? { searchDomainFilter: [...options.allowedDomains] } : {}),
  });
}

function record(value: unknown): Record<string, unknown> | null {
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
      if (part.type === "tool-result" && part.toolName === "read_public_page") {
        const raw = record(part.output);
        const output = raw && "value" in raw ? record(raw.value) : raw;
        const url = output?.ok === true ? canonicalHttpsSource(output.url) : null;
        if (url) sources.add(url);
      }
      if (part.type === "source" && part.sourceType === "url") {
        const url = canonicalHttpsSource(part.url);
        if (url) sources.add(url);
      }
      if (sources.size >= AGENT_WEB_SOURCE_LIMIT) return [...sources];
    }
  }

  return [...sources];
}

export function agentWebSourcesFooter(sources: readonly string[]): string {
  const canonical = new Set(sources.map(canonicalHttpsSource).filter((url): url is string => Boolean(url)));
  if (canonical.size === 0) return "";

  const links = [...canonical].slice(0, AGENT_WEB_SOURCE_LIMIT).map((source) => `- <${source}>`);

  return `\n\n### Sources\n${links.join("\n")}`;
}
