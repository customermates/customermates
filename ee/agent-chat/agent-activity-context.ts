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
        return (
          data.title ??
          data.name ??
          [data.firstName, data.lastName].filter((part) => typeof part === "string").join(" ")
        );
      })
    : [];
}

const RECORD_MUTATIONS: Record<string, string | undefined> = {
  create_contacts: "contacts",
  update_contacts: "contacts",
  create_organizations: "organizations",
  update_organizations: "organizations",
  create_deals: "deals",
  update_deals: "deals",
  create_services: "services",
  update_services: "services",
  create_tasks: "tasks",
  update_tasks: "tasks",
};

export function agentToolInputContext(toolName: string, input: unknown) {
  const data = record(input);
  const resource = RECORD_MUTATIONS[toolName];
  if (resource) return context(namedItems(Array.isArray(input) ? input : data[resource]));
  if (toolName === "manage_wiki_pages")
    return context(data.action === "create" ? namedItems(data.pages) : [data.title ?? data.query]);
  if (toolName === WIKI_WEBSITE_IMPORT_TOOL_NAME) return context([websiteLabel(data.url)]);
  if (toolName === "web_search" || toolName === "search_docs") return context([data.query]);
  if (toolName === "search_records" || toolName === "list_records") return context([data.searchTerm]);
  if (["manage_routines", "manage_widgets", "manage_data_views"].includes(toolName))
    return context([data.name ?? data.title]);
  if (toolName === "manage_custom_columns") return context([data.label]);
  return undefined;
}

const RESULT_CONTEXT_TOOLS = new Set([
  "get_docs_page",
  "manage_wiki_pages",
  "get_records",
  "manage_routines",
  "manage_widgets",
  "manage_data_views",
  ...Object.keys(RECORD_MUTATIONS),
]);

export function agentToolOutputContext(toolName: string | undefined, structuredContent: unknown) {
  if (!toolName || !RESULT_CONTEXT_TOOLS.has(toolName)) return undefined;
  const data = record(structuredContent);
  if (toolName === "get_records") {
    const items = Array.isArray(data.items) ? data.items.slice(0, 100) : [];
    return context(
      namedItems(
        items.flatMap((item) => {
          const entry = record(item);
          if (entry.error) return [];
          return ["contact", "organization", "deal", "service", "task"].flatMap((key) =>
            entry[key] ? [entry[key]] : [],
          );
        }),
      ),
    );
  }
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
