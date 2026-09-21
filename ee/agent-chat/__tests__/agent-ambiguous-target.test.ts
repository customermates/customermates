import { describe, expect, it } from "vitest";

import {
  ambiguousTargetFromMessages,
  ambiguousTargetRefusal,
  withheldToolNamesFor,
  writeCoversEveryCandidate,
} from "../agent-ambiguous-target";

const NOVA_A = "11111111-1111-4111-8111-111111111111";
const NOVA_B = "22222222-2222-4222-8222-222222222222";

function conversation(
  resultLines: string[],
  input: Record<string, unknown> = { entity: "deal", searchTerm: "Nova Expansion" },
) {
  return [
    { role: "user", content: "Mark the Nova Expansion deal as Won." },
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "call-1", toolName: "list_records", input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          output: {
            type: "json",
            value: { ok: true, result: ["total: 2", "items[2]{id,name}:", ...resultLines].join("\n") },
          },
        },
      ],
    },
  ];
}

describe("ambiguous write targets", () => {
  it("arms when a name the user typed matches more than one record", () => {
    const target = ambiguousTargetFromMessages(
      conversation([`  ${NOVA_A},Nova Expansion`, `  ${NOVA_B},Nova Expansion Phase 2`]),
    );
    if (!target) throw new Error("expected an ambiguous target");
    expect(target).toMatchObject({ entity: "deal", phrase: "Nova Expansion" });
    expect(target.candidates).toHaveLength(2);
    expect(withheldToolNamesFor(target)).toContain("update_deals");
    expect(ambiguousTargetRefusal(target)).toContain("Nova Expansion Phase 2");
  });

  it("stays quiet when the name matches exactly one record", () => {
    const target = ambiguousTargetFromMessages(conversation([`  ${NOVA_A},Nova Expansion`]));
    expect(target).toBeNull();
    expect(withheldToolNamesFor(target)).toEqual([]);
  });

  it("stays quiet when the search phrase is not something the user wrote", () => {
    const target = ambiguousTargetFromMessages(
      conversation([`  ${NOVA_A},Kestrel one`, `  ${NOVA_B},Kestrel two`], { entity: "deal", searchTerm: "Kestrel" }),
    );
    expect(target).toBeNull();
  });

  it("stays quiet for a listing that names no record", () => {
    const target = ambiguousTargetFromMessages(
      conversation([`  ${NOVA_A},Alpha`, `  ${NOVA_B},Beta`], { entity: "deal", pageSize: 25 }),
    );
    expect(target).toBeNull();
  });

  it("lets a write through when it covers every candidate", () => {
    const target = ambiguousTargetFromMessages(
      conversation([`  ${NOVA_A},Nova Expansion`, `  ${NOVA_B},Nova Expansion Phase 2`]),
    );
    if (!target) throw new Error("expected an ambiguous target");
    expect(writeCoversEveryCandidate(target, { deals: [{ id: NOVA_A }, { id: NOVA_B }] })).toBe(true);
    expect(writeCoversEveryCandidate(target, { deals: [{ id: NOVA_A }] })).toBe(false);
  });
});
