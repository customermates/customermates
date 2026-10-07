import { z } from "zod";

import { sanitizeAgentPlainText } from "./agent-output-safety";
import { WIKI_WEBSITE_IMPORT_TOOL_NAME } from "./tool-identity";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function websiteLabel(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return undefined;
  }
}

function label(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = sanitizeAgentPlainText(value.replace(/https?:\/\/[^\s<>]+/gi, (url) => websiteLabel(url) ?? ""))
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? (text.length > 80 ? `${text.slice(0, 79)}…` : text) : undefined;
}

export const AgentActivityContextSchema = z
  .object({
    labels: z
      .array(z.string().max(80).transform(label).pipe(z.string().min(1)))
      .min(1)
      .max(3),
    additionalCount: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export type AgentActivityContext = z.infer<typeof AgentActivityContextSchema>;

function context(values: unknown[]): AgentActivityContext | undefined {
  const labels = [...new Set(values.map(label).filter((value): value is string => Boolean(value)))];
  return labels.length
    ? {
        labels: labels.slice(0, 3),
        ...(labels.length > 3 ? { additionalCount: Math.min(100, labels.length - 3) } : {}),
      }
    : undefined;
}

function namedItems(value: unknown) {
  return Array.isArray(value)
    ? value.slice(0, 100).map((item) => {
        const data = record(item);
        return data.title ?? data.name;
      })
    : [];
}

export function agentToolInputContext(toolName: string, input: unknown) {
  const data = record(input);
  if (toolName === "manage_wiki_pages")
    return context(data.action === "create" ? namedItems(data.pages) : [data.title ?? data.query]);
  if (toolName === WIKI_WEBSITE_IMPORT_TOOL_NAME) return context([websiteLabel(data.url)]);
  if (toolName === "web_search" || toolName === "search_docs") return context([data.query]);
  if (toolName === "search_crm_records") return context([data.searchTerm]);
  if (toolName === "query_crm_records") return context([data.search]);
  if (["manage_routines", "manage_widgets", "manage_data_views"].includes(toolName))
    return context([data.name ?? data.title]);
  return undefined;
}

const RESULT_CONTEXT_TOOLS = new Set([
  "get_docs_page",
  "manage_wiki_pages",
  "manage_routines",
  "manage_widgets",
  "manage_data_views",
]);

export function agentToolOutputContext(toolName: string | undefined, structuredContent: unknown) {
  if (!toolName || !RESULT_CONTEXT_TOOLS.has(toolName)) return undefined;
  const data = record(structuredContent);
  return context(data.title || data.name ? [data.title ?? data.name] : namedItems(data.items));
}

export function readAgentToolResultContext(toolName: string | undefined, output: unknown) {
  if (!toolName || !RESULT_CONTEXT_TOOLS.has(toolName)) return undefined;
  const envelope = record(output);
  const result = "value" in envelope ? record(envelope.value) : envelope;
  if (result.ok !== true) return undefined;
  const parsed = AgentActivityContextSchema.safeParse(result.activityContext);
  return parsed.success ? parsed.data : undefined;
}
