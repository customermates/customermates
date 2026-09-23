import { encode } from "@toon-format/toon";
import { describe, expect, it } from "vitest";

import {
  ambiguityRequestOf,
  ambiguousTargetRefusal,
  ambiguousTargetsFromMessages,
  candidateIdsIn,
  mergeAmbiguousTarget,
  refusingTarget,
  type AmbiguityRequest,
} from "../agent-ambiguous-target";

const NOVA = "11111111-1111-4111-8111-111111111111";
const NOVA_2025 = "22222222-2222-4222-8222-222222222222";
const UNRELATED = "33333333-3333-4333-8333-333333333333";

type Read = { toolName?: string; input: Record<string, unknown>; result: string };

function reads(...entries: Read[]) {
  return entries.flatMap((entry, index) => [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: `call-${index}`,
          toolName: entry.toolName ?? "list_records",
          input: entry.input,
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: `call-${index}`,
          output: { type: "json", value: { ok: true, result: entry.result } },
        },
      ],
    },
  ]);
}

const table = (rows: [string, string][]) =>
  [`total: ${rows.length}`, `items[${rows.length}]{id,name}:`, ...rows.map(([id, name]) => `  ${id},${name}`)].join(
    "\n",
  );

const novaRows: [string, string][] = [
  [NOVA, "Nova Expansion"],
  [NOVA_2025, "Nova Expansion 2025"],
];
const novaSearch: Read = { input: { entity: "deal", searchTerm: "Nova Expansion" }, result: table(novaRows) };
const request = (latestUserText: string, previousAssistantText = ""): AmbiguityRequest => ({
  latestUserText: latestUserText.toLowerCase(),
  previousAssistantText: previousAssistantText.toLowerCase(),
});
const C34 = request("Mark the Nova Expansion deal as Won.");

describe("ambiguous write targets", () => {
  it("arms on a complete name that another record's name contains, and refuses a write to exactly one candidate", () => {
    const [target] = ambiguousTargetsFromMessages(reads(novaSearch), C34);
    expect(target).toMatchObject({ entity: "deal", phrase: "Nova Expansion" });
    expect(target.candidates).toHaveLength(2);
    expect(ambiguousTargetRefusal(target)).toContain("Nova Expansion 2025");
    expect(refusingTarget([target], false, { deals: [{ id: NOVA }] })).toBe(target);
    expect(refusingTarget([target], false, { deals: [{ id: NOVA }, { id: NOVA_2025 }] })).toBeNull();
    expect(refusingTarget([target], false, { ids: [UNRELATED], entity: "contact" })).toBeNull();
    expect(refusingTarget([target], true, { deals: [{ id: NOVA }] })).toBeNull();
    expect(candidateIdsIn(target, { a: NOVA, b: [NOVA_2025, UNRELATED] })).toBe(2);
  });

  it("lets a request for every match write to all candidates in one call", () => {
    const targets = ambiguousTargetsFromMessages(reads(novaSearch), request("Set both Nova Expansion deals to Won."));
    expect(targets).toHaveLength(1);
    expect(refusingTarget(targets, false, { deals: [{ id: NOVA }, { id: NOVA_2025 }] })).toBeNull();
  });

  it("stays armed through a later read of another phrase or a narrowing re-read", () => {
    const messages = reads(
      novaSearch,
      { input: { entity: "deal", searchTerm: "Kestrel" }, result: table([[UNRELATED, "Kestrel"]]) },
      {
        input: { entity: "deal", filters: [{ field: "name", operator: "equals", value: "Nova Expansion" }] },
        result: table([[NOVA, "Nova Expansion"]]),
      },
    );
    const targets = ambiguousTargetsFromMessages(
      messages,
      request("Mark the Nova Expansion deal as Won and the Kestrel deal as Lost."),
    );
    expect(targets.map((target) => target.phrase)).toEqual(["Nova Expansion"]);
    expect(refusingTarget(targets, false, { deals: [{ id: NOVA }] })).not.toBeNull();
  });

  it("does not arm on a rule that selects a set, so a bulk update of the matching records goes through", () => {
    const targets = ambiguousTargetsFromMessages(
      reads({
        input: { entity: "task", searchTerm: "Renewal check" },
        result: table([
          [NOVA, "Renewal check Aster"],
          [NOVA_2025, "Renewal check Boreal"],
          [UNRELATED, "Renewal check Cygnus"],
        ]),
      }),
      request("Set every task whose name starts with 'Renewal check' and whose due date is past to Done."),
    );
    expect(targets).toEqual([]);
  });

  it("does not arm when the user names one candidate in full and no other name contains it", () => {
    expect(ambiguousTargetsFromMessages(reads(novaSearch), request("Mark Nova Expansion 2025 as Won."))).toEqual([]);
  });

  it("accepts an answer to the clarifying question, including the shorter name", () => {
    const asked = "Two deals match: Nova Expansion and Nova Expansion 2025. Which one do you mean?";
    expect(
      ambiguousTargetsFromMessages(
        reads(novaSearch),
        request("I meant just Nova Expansion, the one without a year", asked),
      ),
    ).toEqual([]);
    expect(
      ambiguousTargetsFromMessages(reads(novaSearch), request("I meant just Nova Expansion, the one without a year")),
    ).toHaveLength(1);
    expect(ambiguousTargetsFromMessages(reads(novaSearch), request("The 2025 one.", asked))).toEqual([]);
  });

  it("stays armed when the previous answer only mentioned the longer name", () => {
    expect(
      ambiguousTargetsFromMessages(
        reads(novaSearch),
        request("Now mark Nova Expansion as Won.", "I moved Nova Expansion 2025 to Negotiation. Anything else?"),
      ),
    ).toHaveLength(1);
  });

  it("takes a reply naming one candidate after an answer that listed both as a choice, asked or not", () => {
    for (const previous of [
      "I found two deals: Nova Expansion and Nova Expansion 2025. Please let me know which one you mean.",
      "Nova Expansion and Nova Expansion 2025.",
    ]) {
      expect(ambiguousTargetsFromMessages(reads(novaSearch), request("Mark Nova Expansion as Won.", previous))).toEqual(
        [],
      );
    }
  });

  it("widens an armed target with a later read's candidates and never narrows it", () => {
    const [wide] = ambiguousTargetsFromMessages(
      reads({
        input: { entity: "deal", searchTerm: "Nova" },
        result: table([
          [NOVA, "Nova"],
          [NOVA_2025, "Nova East"],
          [UNRELATED, "Nova West"],
        ]),
      }),
      request("Mark the Nova deal as Won."),
    );
    const [narrow] = ambiguousTargetsFromMessages(
      reads({
        input: { entity: "deal", searchTerm: "Nova" },
        result: table([
          [NOVA, "Nova"],
          [NOVA_2025, "Nova East"],
        ]),
      }),
      request("Mark the Nova deal as Won."),
    );
    const merged = mergeAmbiguousTarget(wide, narrow);
    expect(merged.candidates.map((candidate) => candidate.id)).toEqual([NOVA, NOVA_2025, UNRELATED]);
    expect(refusingTarget([merged], false, { deals: [{ id: UNRELATED }] })).toBe(merged);
    expect(refusingTarget([merged], false, { deals: [{ id: UNRELATED }, { id: NOVA_2025 }] })).toBeNull();
  });

  it("reads candidates from the list form TOON uses when rows have different keys", () => {
    const result = encode({
      total: 2,
      items: [
        { id: NOVA, name: "Nova Expansion", totalValue: 24_000, weightedValue: 12_000 },
        { id: NOVA_2025, name: "Nova Expansion 2025", totalValue: 18_000 },
      ],
    });
    expect(result).toContain("- id:");
    const [target] = ambiguousTargetsFromMessages(reads({ ...novaSearch, result }), C34);
    expect(target?.candidates.map((candidate) => candidate.id)).toEqual([NOVA, NOVA_2025]);
  });

  it("reads a quoted name that contains a comma", () => {
    const [target] = ambiguousTargetsFromMessages(
      reads({
        input: { entity: "deal", searchTerm: "Acme" },
        result: encode({
          total: 2,
          items: [
            { id: NOVA, name: "Acme" },
            { id: NOVA_2025, name: "Acme, Inc renewal" },
          ],
        }),
      }),
      request("Rename the Acme deal."),
    );
    expect(target?.candidates.map((candidate) => candidate.name)).toEqual(["Acme", "Acme, Inc renewal"]);
  });

  it("falls back to row patterns when a truncated result no longer decodes", () => {
    const [target] = ambiguousTargetsFromMessages(reads({ ...novaSearch, result: `${table(novaRows)}\n  333` }), C34);
    expect(target?.candidates).toHaveLength(2);
  });

  it("reads search_records only when it names a single entity", () => {
    const result = encode({
      searchTerm: "Nova Expansion",
      results: [{ entity: "deal", total: 2, items: novaRows.map(([id, name]) => ({ id, name })) }],
    });
    const single = ambiguousTargetsFromMessages(
      reads({ toolName: "search_records", input: { entities: ["deal"], searchTerm: "Nova Expansion" }, result }),
      C34,
    );
    const several = ambiguousTargetsFromMessages(
      reads({
        toolName: "search_records",
        input: { entities: ["deal", "contact"], searchTerm: "Nova Expansion" },
        result,
      }),
      C34,
    );
    expect(single.map((target) => target.entity)).toEqual(["deal"]);
    expect(several).toEqual([]);
  });

  it("stays quiet when the search phrase is not something the user wrote", () => {
    expect(
      ambiguousTargetsFromMessages(reads({ ...novaSearch, input: { entity: "deal", searchTerm: "Kestrel" } }), C34),
    ).toEqual([]);
  });

  it("takes the request from the turn's own messages, never from a continuation prompt", () => {
    expect(
      ambiguityRequestOf([
        { role: "user", text: "Which deals are open?" },
        { role: "assistant", text: "Nova Expansion and Nova Expansion 2025." },
        { role: "user", text: "Mark the Nova Expansion deal as Won." },
      ]),
    ).toEqual({
      latestUserText: "mark the nova expansion deal as won.",
      previousAssistantText: "nova expansion and nova expansion 2025.",
    });
  });
});
