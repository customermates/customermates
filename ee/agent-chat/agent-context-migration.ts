import { presetId } from "@/features/records/crm-preset";
import { agentContextAttachmentKey, type AgentContextAttachment } from "./agent-context";

export function canonicalAgentRecordContexts(
  contexts: readonly AgentContextAttachment[],
  companyId: string,
): AgentContextAttachment[] {
  const seen = new Set<string>();
  return contexts.flatMap((context) => {
    const reference = context.reference;
    const canonical: AgentContextAttachment =
      reference.kind === "record" && "entityType" in reference
        ? {
            ...context,
            reference: {
              kind: "record",
              typeId: presetId(companyId, reference.entityType),
              recordId: reference.recordId,
            },
          }
        : context;
    const key = agentContextAttachmentKey(canonical);
    if (seen.has(key)) return [];
    seen.add(key);
    return [canonical];
  });
}
