import type { ModelMessage } from "ai";
import type { WikiCatalog } from "@/features/wiki/wiki.schema";
import { AGENT_REPLAY_HISTORY_MAX_BYTES } from "./agent-replay-budget";

const WIKI_REFERENCE_MAX_BYTES = 6000;
const encodedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function serializeAgentWikiCatalog(catalog: WikiCatalog): string {
  const wiki = {
    items: catalog.items.map(({ id, title, excerpt }) => ({ id, title, excerpt })),
    total: catalog.total,
    page: catalog.page,
    nextPage: catalog.nextPage,
    truncated: catalog.truncated,
    entriesShortened: false,
  };
  let serialized = JSON.stringify({ wiki });
  while (encodedBytes(agentWikiContextMessages(serialized)) > WIKI_REFERENCE_MAX_BYTES) {
    const candidates = wiki.items.flatMap((item) => (["title", "excerpt"] as const).map((key) => ({ item, key })));
    candidates.sort((left, right) => encodedBytes(right.item[right.key]) - encodedBytes(left.item[left.key]));
    const largest = candidates.find(({ item, key }) => item[key].length > 1);
    if (!largest) throw new Error("Workspace Wiki catalog exceeds its reference envelope.");
    const characters = Array.from(largest.item[largest.key]);
    largest.item[largest.key] = characters.slice(0, Math.floor(characters.length / 2)).join("") + "…";
    wiki.entriesShortened = true;
    serialized = JSON.stringify({ wiki });
  }
  return serialized;
}

export function agentWikiReplayBudget(catalog?: string | null): number {
  return Math.max(0, AGENT_REPLAY_HISTORY_MAX_BYTES - (catalog ? encodedBytes(agentWikiContextMessages(catalog)) : 0));
}

export function agentWikiContextMessages(catalog?: string | null): ModelMessage[] {
  if (!catalog) return [];
  return [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "workspace-wiki-catalog",
          toolName: "get_workspace_context",
          input: { wikiPage: 1 },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "workspace-wiki-catalog",
          toolName: "get_workspace_context",
          output: { type: "text", value: catalog },
        },
      ],
    },
  ];
}
