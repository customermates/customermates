import { describe, expect, it } from "vitest";
import { presetId } from "@/features/records/crm-preset";
import { TOOL_RECORD_ID, TOOL_TYPE_ID } from "@/tests/helpers/record-tools";
import {
  agentContextProviderPrefix,
  agentContextsFromMessageParts,
  type AgentContextAttachment,
} from "../agent-context";
import { canonicalAgentRecordContexts } from "../agent-context-migration";

describe("historical assistant record contexts", () => {
  it("decodes all five historical kinds without changing stored transcript text or parts", () => {
    for (const entityType of ["contact", "organization", "deal", "service", "task"] as const) {
      const parts = [
        { type: "text", text: "Keep my original text" },
        {
          type: "context",
          context: { reference: { kind: "record", entityType, recordId: TOOL_RECORD_ID }, label: "Original label" },
        },
      ];
      const original = structuredClone(parts);
      const decoded = canonicalAgentRecordContexts(agentContextsFromMessageParts(parts), "workspace-a");
      expect(decoded).toEqual([
        {
          reference: { kind: "record", typeId: presetId("workspace-a", entityType), recordId: TOOL_RECORD_ID },
          label: "Original label",
        },
      ]);
      expect(agentContextProviderPrefix(decoded)).toContain(`typeId="${presetId("workspace-a", entityType)}"`);
      expect(agentContextProviderPrefix(decoded)).not.toContain("entityType");
      expect(parts).toEqual(original);
    }
  });
  it("scopes legacy identities to the authenticated workspace and deduplicates mixed historical references", () => {
    const legacy: AgentContextAttachment = {
      reference: { kind: "record", entityType: "deal", recordId: TOOL_RECORD_ID },
      label: "Deal",
    };
    const canonical = canonicalAgentRecordContexts([legacy], "workspace-a");
    expect(canonicalAgentRecordContexts([legacy, ...canonical], "workspace-a")).toEqual(canonical);
    expect(canonicalAgentRecordContexts([legacy], "workspace-b")).not.toEqual(canonical);
    const custom: AgentContextAttachment = {
      reference: { kind: "record", typeId: TOOL_TYPE_ID, recordId: TOOL_RECORD_ID },
      label: "Renamed",
    };
    expect(canonicalAgentRecordContexts([legacy, custom], "workspace-a")).toHaveLength(2);
    expect(canonicalAgentRecordContexts([custom], "workspace-b")).toEqual([custom]);
  });
});
