import { describe, expect, it } from "vitest";

import {
  ambiguousTargetFromMessages,
  ambiguousTargetRefusal,
  candidateIdsIn,
  refusesAmbiguousWrite,
  withheldToolNamesFor,
} from "../agent-ambiguous-target";

const NOVA = "11111111-1111-4111-8111-111111111111";
const NOVA_2025 = "22222222-2222-4222-8222-222222222222";
const UNRELATED = "33333333-3333-4333-8333-333333333333";

type Turn = { user: string; toolName?: string; input: Record<string, unknown>; rows: string[] };

function conversation(...turns: Turn[]) {
  return turns.flatMap((turn, index) => [
    { role: "user", content: turn.user },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: `call-${index}`,
          toolName: turn.toolName ?? "list_records",
          input: turn.input,
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: `call-${index}`,
          output: {
            type: "json",
            value: { ok: true, result: [`total: ${turn.rows.length}`, "items[2]{id,name}:", ...turn.rows].join("\n") },
          },
        },
      ],
    },
  ]);
}

const novaTurn: Turn = {
  user: "Mark the Nova Expansion deal as Won.",
  input: { entity: "deal", searchTerm: "Nova Expansion" },
  rows: [`  ${NOVA},Nova Expansion`, `  ${NOVA_2025},Nova Expansion 2025`],
};

describe("ambiguous write targets", () => {
  it("arms on a complete name that another record's name contains, and withholds only that entity's update tool", () => {
    const target = ambiguousTargetFromMessages(conversation(novaTurn));
    if (!target) throw new Error("expected an ambiguous target");
    expect(target).toMatchObject({ entity: "deal", phrase: "Nova Expansion" });
    expect(target.candidates).toHaveLength(2);
    expect(withheldToolNamesFor(target)).toEqual(["update_deals"]);
    expect(ambiguousTargetRefusal(target)).toContain("Nova Expansion 2025");
  });

  it("does not arm on a rule that selects a set, so a bulk update of the matching records goes through", () => {
    const target = ambiguousTargetFromMessages(
      conversation({
        user: "Set every task whose name starts with 'Renewal check' and whose due date is past to Done.",
        input: { entity: "task", searchTerm: "Renewal check" },
        rows: [
          `  ${NOVA},Renewal check Aster`,
          `  ${NOVA_2025},Renewal check Boreal`,
          `  ${UNRELATED},Renewal check Cygnus`,
        ],
      }),
    );
    expect(target).toBeNull();
    expect(withheldToolNamesFor(target)).toEqual([]);
    expect(refusesAmbiguousWrite(target, false, { tasks: [{ id: NOVA }] })).toBe(false);
  });

  it("disarms on a clarifying follow-up, because only the latest user message is read", () => {
    const followUp: Turn = {
      user: "The 2025 one.",
      input: { entity: "deal", searchTerm: "Nova Expansion" },
      rows: novaTurn.rows,
    };
    expect(ambiguousTargetFromMessages(conversation(novaTurn, followUp))).toBeNull();
  });

  it("does not arm when the user names one candidate in full and no other name contains it", () => {
    const target = ambiguousTargetFromMessages(conversation({ ...novaTurn, user: "Mark Nova Expansion 2025 as Won." }));
    expect(target).toBeNull();
  });

  it("refuses a write aimed at exactly one candidate and allows one covering several or none", () => {
    const target = ambiguousTargetFromMessages(conversation(novaTurn));
    if (!target) throw new Error("expected an ambiguous target");
    expect(refusesAmbiguousWrite(target, false, { deals: [{ id: NOVA }] })).toBe(true);
    expect(refusesAmbiguousWrite(target, false, { deals: [{ id: NOVA }, { id: NOVA_2025 }] })).toBe(false);
    expect(refusesAmbiguousWrite(target, false, { ids: [UNRELATED], entity: "contact" })).toBe(false);
    expect(refusesAmbiguousWrite(target, true, { deals: [{ id: NOVA }] })).toBe(false);
    expect(candidateIdsIn(target, { a: NOVA, b: [NOVA_2025, UNRELATED] })).toBe(2);
  });

  it("reads a quoted name that contains a comma", () => {
    const target = ambiguousTargetFromMessages(
      conversation({
        user: "Rename the Acme deal.",
        input: { entity: "deal", searchTerm: "Acme" },
        rows: [`  ${NOVA},Acme`, `  ${NOVA_2025},"Acme, Inc renewal"`],
      }),
    );
    if (!target) throw new Error("expected an ambiguous target");
    expect(target.candidates.map((candidate) => candidate.name)).toEqual(["Acme", "Acme, Inc renewal"]);
  });

  it("reads search_records only when it names a single entity", () => {
    const single = ambiguousTargetFromMessages(
      conversation({
        ...novaTurn,
        toolName: "search_records",
        input: { entities: ["deal"], searchTerm: "Nova Expansion" },
      }),
    );
    const several = ambiguousTargetFromMessages(
      conversation({
        ...novaTurn,
        toolName: "search_records",
        input: { entities: ["deal", "contact"], searchTerm: "Nova Expansion" },
      }),
    );
    expect(single?.entity).toBe("deal");
    expect(several).toBeNull();
  });

  it("stays quiet when the search phrase is not something the user wrote", () => {
    const target = ambiguousTargetFromMessages(
      conversation({ ...novaTurn, input: { entity: "deal", searchTerm: "Kestrel" } }),
    );
    expect(target).toBeNull();
  });
});
