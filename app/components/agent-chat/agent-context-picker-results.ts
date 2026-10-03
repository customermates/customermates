import type { RecordSearchHit } from "@/features/records/record-search.schema";

import type { AgentContextCandidate } from "./agent-context-registry";

import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";

function resultKey(item: RecordSearchHit): string {
  return agentContextAttachmentKey({
    kind: "record",
    typeId: item.ref.typeId,
    recordId: item.ref.recordId,
  });
}

export function dedupeRecordSearchResults(
  results: readonly RecordSearchHit[],
  preferredCandidates: readonly AgentContextCandidate[],
): RecordSearchHit[] {
  const seen = new Set(preferredCandidates.map((candidate) => agentContextAttachmentKey(candidate.context)));

  return results.filter((item) => {
    const key = resultKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
