import type { GlobalSearchResultItem } from "@/features/search/global-search.interactor";

import type { AgentContextCandidate } from "./agent-context-registry";

import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";

function resultKey(item: GlobalSearchResultItem): string {
  return agentContextAttachmentKey({
    kind: "record",
    entityType: item.type,
    recordId: item.id,
  });
}

export function dedupeRecordSearchResults(
  results: readonly GlobalSearchResultItem[],
  preferredCandidates: readonly AgentContextCandidate[],
): GlobalSearchResultItem[] {
  const seen = new Set(preferredCandidates.map((candidate) => agentContextAttachmentKey(candidate.context)));

  return results.filter((item) => {
    const key = resultKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
