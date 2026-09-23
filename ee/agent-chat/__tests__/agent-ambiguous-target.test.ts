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
const request = (latestUserText: string, previousAssistantText = ""): AmbiguityRequest =>
  ambiguityRequestOf([
    { role: "assistant", text: previousAssistantText },
    { role: "user", text: latestUserText },
  ]);
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

  it("does not take a reply as a choice when it names a candidate the previous message never listed", () => {
    const threeRows: [string, string][] = [
      [NOVA, "Nova"],
      [NOVA_2025, "Nova East"],
      [UNRELATED, "Nova West"],
    ];
    const targets = ambiguousTargetsFromMessages(
      reads({ input: { entity: "deal", searchTerm: "Nova" }, result: table(threeRows) }),
      request("Delete the Nova deal.", "I moved Nova East to Negotiation and Nova West to Won."),
    );
    expect(targets).toHaveLength(1);
  });

  describe("name matching", () => {
    const search = (rows: [string, string][], searchTerm = rows[0][1]): Read => ({
      input: { entity: "deal", searchTerm },
      result: table(rows),
    });
    const nova = search([
      [NOVA, "Nova"],
      [NOVA_2025, "Nova East"],
    ]);
    const threeNovas = search([
      [NOVA, "Nova"],
      [NOVA_2025, "Nova East"],
      [UNRELATED, "Nova West"],
    ]);
    const cafe = search([
      [NOVA, "Café"],
      [NOVA_2025, "Café Nord"],
    ]);
    const armed = (read: Read, latest: string, previous = "") =>
      ambiguousTargetsFromMessages(reads(read), request(latest, previous)).length;

    it("never counts a name found inside another word as a mention", () => {
      expect(armed(nova, "Delete the Nova deal.", "The renovation budget for Nova East is 12,000.")).toBe(1);
      expect(armed(nova, "Plan the renovation deal.")).toBe(0);
      expect(armed(nova, "Plan the re\u200cnovation deal.")).toBe(0);
      expect(armed(threeNovas, "The Nova Eastern one", "Did you mean Nova East or Nova West?")).toBe(1);
      expect(
        armed(
          search([
            [NOVA, "Acme"],
            [NOVA_2025, "Acme Pro"],
          ]),
          "Delete the Acme deal, see the Acme Profile note",
        ),
      ).toBe(1);
      const dongfang = search([
        [NOVA, "东方红"],
        [NOVA_2025, "东方红星"],
      ]);
      expect(armed(dongfang, "把东方红星期一的交易删了")).toBe(1);
      expect(armed(dongfang, "delete东方红")).toBe(1);
      expect(armed(dongfang, "东方红星")).toBe(0);
    });

    it("never takes a plural or a longer name's stem as naming the shorter candidate", () => {
      const adam = search([
        [NOVA, "Adam"],
        [NOVA_2025, "Adams Consulting"],
      ]);
      expect(armed(adam, "Adams", "Did you mean Adam or Adams Consulting?")).toBe(1);
      expect(
        armed(
          threeNovas,
          "Delete the Nova deal.",
          "I moved both Novas: Nova East to Negotiation and Nova West to Won.",
        ),
      ).toBe(1);
    });

    it("arms on a phrase the user inflected or wrote without spaces around it", () => {
      const muller = search([
        [NOVA, "Müller"],
        [NOVA_2025, "Müller GmbH"],
      ]);
      expect(armed(muller, "Setze Müllers Deal auf Gewonnen")).toBe(1);
      expect(armed(nova, "Poista Novan kauppa")).toBe(1);
      expect(armed(nova, "Lösche den Novadeal.")).toBe(1);
      for (const before of ["删除", "取引の", "ディール", "ลบดีล", "ລົບ", "លុប", "ဖျက်", "❤️", "1️⃣"])
        expect(armed(nova, `${before}Nova`), before).toBe(1);
    });

    it("takes a name set off from its neighbours as a clear choice", () => {
      expect(armed(nova, "Mark Nova East's deal as won.")).toBe(0);
      expect(armed(nova, "删除 Nova East的交易")).toBe(0);
      expect(armed(nova, "Nova", "您是指Nova还是Nova East？")).toBe(0);
    });

    it("treats combining marks as part of a word and compares composed text", () => {
      const ram = search([
        [NOVA, "राम"],
        [NOVA_2025, "राम ट्रेडर्स"],
      ]);
      expect(armed(ram, "राम का सौदा हटाओ", "रामायण बजट राम ट्रेडर्स के लिए 12,000 है।")).toBe(1);
      expect(armed(ram, "राम का सौदा हटाओ", "राम या राम ट्रेडर्स?")).toBe(0);
      expect(armed(nova, "Delete the Nova deal.", "The Nova\u0308 budget for Nova East is 12,000.")).toBe(1);
      expect(armed(cafe, "Delete the Cafe\u0301 deal.")).toBe(1);
      expect(armed(cafe, "Cafe\u0301", "Cafe\u0301 or Cafe\u0301 Nord?")).toBe(0);
      const decomposed = search(
        [
          [NOVA, "Cafe\u0301"],
          [NOVA_2025, "Cafe\u0301 Nord"],
        ],
        "Café",
      );
      expect(armed(decomposed, "Delete the Café deal.")).toBe(1);
      expect(armed(decomposed, "Delete the Café Nord deal.")).toBe(0);
    });
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
