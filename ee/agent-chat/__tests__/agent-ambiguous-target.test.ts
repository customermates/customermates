import { decode, encode } from "@toon-format/toon";
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
const request = (latestUserText: string, previousAssistantText = "", earlierUserText = ""): AmbiguityRequest =>
  ambiguityRequestOf([
    { role: "user", text: earlierUserText },
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

  it("never arms on a name the user governs with a set word or a name rule", () => {
    for (const text of [
      "Set both Nova Expansion deals to Won.",
      "Set both Nova Expansion deals and the Kestrel deal to Won.",
      "Set both Nova Expansion to Won, then archive Kestrel and Falcon.",
      "Close both Nova Expansion.",
      "Set all the Nova Expansion deals to Won.",
      "Set all our Nova Expansion deals to Won.",
      "Mark all open Nova Expansion deals as won.",
      "Set all overdue open Nova Expansion deals to Won.",
      "Archive all the Nova Expansion.",
      "Archive all our Nova Expansion.",
      "Archivia tutti i nostri Nova Expansion.",
      "Set the two Nova Expansion deals to Won.",
      "Assign both Nova Expansion deals to Max Klein as owner.",
      "Weise beide Nova Expansion Deals Max Klein zu.",
      "Set every deal whose name starts with 'Nova Expansion' to Won.",
      "Setze jeden Deal, dessen Name mit 'Nova Expansion' beginnt, auf Gewonnen.",
    ])
      expect(ambiguousTargetsFromMessages(reads(novaSearch), request(text)), text).toEqual([]);

    for (const text of [
      "Mark the Nova Expansion deal as Won and all Kestrel deals as Lost.",
      "Show me all activities of Nova Expansion and mark it Won.",
      "Update the deal named Nova Expansion to Won.",
      "Update the deal with the name Nova Expansion to Won.",
      "Update all records named in the list and mark Nova Expansion as Won.",
      "Mark both Nova Expansion and Kestrel as Won.",
      "Show me all activities of Nova Expansion, then mark it Won.",
      "All Nova Expansion tasks are done, so mark the deal as Won.",
      "Two Nova Expansion stakeholders signed today, mark the deal as Won.",
      "Alles zu Nova Expansion ist erledigt, setze den Deal auf gewonnen.",
      "The invoice due from Nova Expansion was paid, so mark the deal as Won.",
      "Payment due from Nova Expansion; mark the deal as Won.",
      "Mark the payment due from Nova Expansion",
      "Set all very old overdue Nova Expansion deals to Won.",
      "First of all mark Nova Expansion as won",
      "They all signed Nova Expansion, mark it as won.",
      "Congrats to all on Nova Expansion! Mark it as won.",
      "Hi all mark Nova Expansion as won",
      "Todos firmaron Nova Expansion, márcalo como ganado.",
      "Gracias a todos por Nova Expansion, márcalo como ganado.",
      "Merci à tous pour Nova Expansion, passe-le en gagné.",
      "Ils ont tous signé Nova Expansion, passe-le en gagné.",
      "Grazie a tutti per Nova Expansion, segnalo come vinto.",
      "Hanno tutti firmato Nova Expansion, segnalo come vinto.",
      "Danke an alle für Nova Expansion, bitte auf gewonnen setzen.",
      "Glückwunsch an alle zu Nova Expansion! Bitte auf Gewonnen setzen.",
      "Alles klar Nova Expansion auf gewonnen setzen",
      "Segna i due deal Nova Expansion e Kestrel come vinti.",
      "Update both Nova Expansion's value and stage.",
      "Link all contacts to the deal called Nova Expansion.",
      "Verknüpfe alle Kontakte mit dem Deal namens Nova Expansion.",
      "Ordne alle offenen Aufgaben dem Deal mit dem Namen Nova Expansion zu.",
      "Associe toutes les tâches au deal nommé Nova Expansion.",
      "Update Nova Expansion: 2025 forecast is 30000.",
      "Alles klar, Nova Expansion bitte auf Gewonnen setzen.",
      "OK, that's all. Nova Expansion: mark it as Won.",
    ])
      expect(ambiguousTargetsFromMessages(reads(novaSearch), request(text)), text).toHaveLength(1);

    const targets = ambiguousTargetsFromMessages(reads(novaSearch), C34);
    expect(refusingTarget(targets, false, { deals: [{ id: NOVA }, { id: NOVA_2025 }] })).toBeNull();
    expect(ambiguousTargetRefusal(targets[0])).not.toContain("all of them");
  });

  it("lets a rule-selected write through even when the rule picks one record", () => {
    const renewal = reads({
      input: { entity: "task", searchTerm: "Renewal check" },
      result: table([
        [NOVA, "Renewal check"],
        [NOVA_2025, "Renewal check Aster"],
        [UNRELATED, "Renewal check Boreal"],
      ]),
    });
    expect(
      ambiguousTargetsFromMessages(
        renewal,
        request(
          "Set the Status of every task whose name starts with 'Renewal check' and whose Due date is in the past to Done.",
        ),
      ),
    ).toEqual([]);
    const siblings = (name: string): [string, string][] => [
      [NOVA, name],
      [NOVA_2025, `${name} Aster`],
      [UNRELATED, `${name} Boreal`],
    ];
    const followUps = siblings("Follow up");
    const followUpRead = reads({ input: { entity: "task", searchTerm: "Follow up" }, result: table(followUps) });
    expect(
      ambiguousTargetsFromMessages(
        followUpRead,
        request("Set every task named Follow up whose due date has passed to Done."),
      ),
    ).toEqual([]);
    const nachfassen = reads({
      input: { entity: "task", searchTerm: "Nachfassen" },
      result: table(siblings("Nachfassen")),
    });
    for (const text of [
      "Setze alle überfälligen Aufgaben namens Nachfassen auf Erledigt.",
      "Setze sämtliche überfälligen Aufgaben namens Nachfassen auf Erledigt.",
      "Setze alle überfälligen Aufgaben mit dem Namen Nachfassen auf Erledigt.",
    ])
      expect(ambiguousTargetsFromMessages(nachfassen, request(text)), text).toEqual([]);

    for (const text of [
      "Close all Follow up tasks.",
      "Set every overdue task with the name Follow up to Done.",
      "Set all overdue tasks whose name is Follow up to Done.",
      "Set all overdue high priority open tasks named Follow up to Done.",
      "Close all tasks whose name contains the phrase Follow up.",
    ])
      expect(ambiguousTargetsFromMessages(followUpRead, request(text)), text).toEqual([]);

    const localized = (name: string, text: string) =>
      ambiguousTargetsFromMessages(
        reads({ input: { entity: "task", searchTerm: name }, result: table(siblings(name)) }),
        request(text),
      );
    expect(localized("Seguimiento", "Marca como hechas todas las tareas vencidas con el nombre Seguimiento.")).toEqual(
      [],
    );
    expect(localized("Relance", "Marque comme terminées toutes les tâches en retard avec le nom Relance.")).toEqual([]);
    expect(localized("Relance", "Passe chaque tâche nommée Relance dont l'échéance est dépassée à Terminé.")).toEqual(
      [],
    );
    expect(localized("Richiamo", "Segna come completate tutte le attività scadute con il nome Richiamo.")).toEqual([]);
    expect(localized("Follow up", "Close the task with the name Follow up.")).toHaveLength(1);
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
    const armed = (read: Read, latest: string, previous = "", earlier = "") =>
      Number(ambiguousTargetsFromMessages(reads(read), request(latest, previous, earlier)).length > 0);

    it("arms on a written name another candidate contains, however the model searched for it", () => {
      const broad = search(
        [
          [NOVA, "Nova Expansion"],
          [NOVA_2025, "Nova Expansion 2025"],
          [UNRELATED, "Nova West"],
        ],
        "Nova",
      );
      const [target] = ambiguousTargetsFromMessages(reads(broad), C34);
      expect(target?.phrase).toBe("Nova Expansion");
      expect(target?.candidates.map((candidate) => candidate.id)).toEqual([NOVA, NOVA_2025]);
      expect(
        armed(
          search([
            [NOVA, "HP"],
            [NOVA_2025, "HP Enterprise"],
          ]),
          "Mark the HP deal as won",
        ),
      ).toBe(1);
      expect(
        armed(
          search([
            [NOVA, "腾讯"],
            [NOVA_2025, "腾讯音乐"],
          ]),
          "把腾讯的交易标记为赢单",
        ),
      ).toBe(1);
      expect(
        armed(
          search(
            [
              [NOVA, "Renewal call"],
              [NOVA_2025, "Renewal call follow-up"],
            ],
            "Renewal",
          ),
          "Mark the renewal tasks due this week as done",
        ),
      ).toBe(0);
      expect(
        armed(
          search(
            [
              [NOVA, "Kestrel"],
              [NOVA_2025, "Merlin"],
            ],
            "Kestrel",
          ),
          "Setze Kestrels Deal auf Gewonnen",
        ),
      ).toBe(0);
      const contacts: Read = {
        input: {
          entity: "contact",
          filters: [
            { field: "firstName", operator: "equals", value: "Alex" },
            { field: "lastName", operator: "equals", value: "Müller" },
          ],
        },
        result: table([
          [NOVA, "Alex Müller"],
          [NOVA_2025, "Alex Müller Jr"],
        ]),
      };
      expect(armed(contacts, "Update Alex Müller's phone number to +49 30 1234")).toBe(1);
    });

    it("treats a name as held by another only on word boundaries", () => {
      const schmidt: Read = {
        input: { entity: "contact", searchTerm: "Anna Schmidt" },
        result: table([
          [NOVA, "Anna Schmidt"],
          [NOVA_2025, "Johanna Schmidt"],
        ]),
      };
      expect(armed(schmidt, "Update Anna Schmidt's phone number to +49 30 1234")).toBe(0);
      const workshops = search(
        Array.from({ length: 12 }, (_, index): [string, string] => [
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          `Workshop ${index + 1}`,
        ]),
        "Workshop",
      );
      expect(armed(workshops, "Mark Workshop 1 as done")).toBe(0);
      expect(armed(workshops, "Mark Workshop 1 through Workshop 5 as done")).toBe(0);
      expect(
        armed(
          search([
            [NOVA, "Bauer GmbH"],
            [NOVA_2025, "Neubauer GmbH"],
          ]),
          "Setze Bauer GmbH auf Gewonnen",
        ),
      ).toBe(0);
      expect(
        armed(
          search([
            [NOVA, "Müller-Bau"],
            [NOVA_2025, "Müller-Bau 2025"],
          ]),
          "Mark the Müller-Bau deal as won.",
        ),
      ).toBe(1);
    });

    it("keeps a target armed over the candidates the user did not name in full", () => {
      const three = search([
        [NOVA, "Nova Expansion"],
        [NOVA_2025, "Nova Expansion 2025"],
        [UNRELATED, "Nova Expansion Pilot"],
      ]);
      const [target] = ambiguousTargetsFromMessages(
        reads(three),
        request("Mark the Nova Expansion deal as Won and move Nova Expansion Pilot to Lost."),
      );
      expect(target?.candidates.map((candidate) => candidate.id)).toEqual([NOVA, NOVA_2025]);
      expect(refusingTarget([target], false, { deals: [{ id: NOVA }] })).toBe(target);
      expect(refusingTarget([target], false, { deals: [{ id: NOVA }, { id: UNRELATED }] })).toBe(target);
      expect(armed(search(novaRows), "Mark Nova Expansion as Won and Nova Expansion 2025 as Lost.")).toBe(0);
      expect(armed(three, "Mark Nova Expansion 2025 as Won.")).toBe(0);
      expect(
        armed(
          search([
            [NOVA, "Nova"],
            [NOVA_2025, "Nova East"],
            [UNRELATED, "Nova Eastern"],
          ]),
          "Mark Nova East as won",
        ),
      ).toBe(0);
      expect(armed(nova, "Mark Nova East\uFE0F as won")).toBe(0);
      expect(
        armed(
          search(
            [
              [NOVA, "Nova-East"],
              [NOVA_2025, "Nova East 2"],
            ],
            "Nova",
          ),
          "Delete Nova East",
        ),
      ).toBe(1);
      expect(armed(search(novaRows), "Setze den Nova-Expansion-2025-Deal auf Gewonnen.")).toBe(0);
      expect(armed(nova, "Delete Nova, not \u{10428}Nova East")).toBe(1);
      expect(armed(nova, "Delete Nova, not Nova East\u{10428}")).toBe(1);
    });

    it("takes a longer candidate named in full in any spelling as a clear choice", () => {
      const cafeNord = search([
        [NOVA, "Café Nord"],
        [NOVA_2025, "Café Nord 2025"],
      ]);
      expect(armed(cafeNord, "Mark Cafe Nord 2025 as won.")).toBe(0);
      expect(armed(cafeNord, "Cafe Nord 2025", "Two deals match: Café Nord and Café Nord 2025. Which one?")).toBe(0);
      expect(armed(cafeNord, "Cafe Nord", "Two deals match: Café Nord and Café Nord 2025. Which one?")).toBe(0);
      const strasse = search(
        [
          [NOVA, "Müller"],
          [NOVA_2025, "Müller Straße"],
          [UNRELATED, "Müller Pilot"],
        ],
        "Müller",
      );
      expect(armed(strasse, "Setze Müller Strasse auf Gewonnen")).toBe(0);
      expect(armed(strasse, "Setze Müller Strasse auf Gewonnen und Mueller auf Verloren")).toBe(1);
      const acmeEurope = search([
        [NOVA, "Acme Inc."],
        [NOVA_2025, "Acme Inc. Europe"],
      ]);
      expect(armed(acmeEurope, "Update the address of Acme Inc Europe to Main Street 5")).toBe(0);
      expect(armed(acmeEurope, "Update the address of Acme Inc. Europe to Main Street 5")).toBe(0);
      const kestrel = search([
        [NOVA, "Kestrel"],
        [NOVA_2025, "Kestrel Renewal"],
      ]);
      expect(armed(kestrel, "Kestrel: renewal confirmed, mark the deal as Won.")).toBe(1);
      const nested = search(
        [
          [NOVA, "Nova"],
          [NOVA_2025, "Nova Expansion"],
          [UNRELATED, "Nova Expansion 2025"],
        ],
        "Nova",
      );
      expect(armed(nested, "Mark Nova Expansion and Nova Expansion 2025 as Won.")).toBe(0);
      expect(armed(nested, "Mark Nova and Nova Expansion 2025 as Won.")).toBe(1);
      expect(armed(nested, "Mark Nova Expansion as Won.")).toBe(1);
      const muellerBau = search([
        [NOVA, "Müller Bau"],
        [NOVA_2025, "Müller Bau 2025"],
      ]);
      expect(armed(muellerBau, "Mark Mueller Bau 2025 as won.")).toBe(0);
      expect(armed(muellerBau, "Mark Mueller Bau as won.")).toBe(1);
    });

    it("never lets records the turn created stand for an ambiguous name", () => {
      const created = [NOVA, NOVA_2025, UNRELATED];
      const messages = [
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "create-1", toolName: "create_tasks", input: { tasks: [] } }],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "create-1",
              output: {
                type: "json",
                value: {
                  ok: true,
                  result: encode({ items: created.map((id) => ({ id, name: "Verlängerung besprechen" })) }),
                },
              },
            },
          ],
        },
        ...reads({
          input: { entity: "task", searchTerm: "Verlängerung besprechen" },
          result: table([
            ...created.map((id): [string, string] => [id, "Verlängerung besprechen"]),
            ["44444444-4444-4444-8444-444444444444", "Verlängerung besprechen 2025"],
          ]),
        }),
      ];
      const text = "Lege für jeden dieser Deals eine Aufgabe Verlängerung besprechen an.";
      expect(ambiguousTargetsFromMessages(messages, request(text))).toEqual([]);
      const oneCreated = [
        messages[0],
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "create-1",
              output: {
                type: "json",
                value: { ok: true, result: encode({ items: [{ id: NOVA, name: "Verlängerung besprechen" }] }) },
              },
            },
          ],
        },
        ...reads({
          input: { entity: "task", searchTerm: "Verlängerung besprechen" },
          result: table([
            [NOVA, "Verlängerung besprechen"],
            [NOVA_2025, "Verlängerung besprechen 2025"],
          ]),
        }),
      ];
      expect(ambiguousTargetsFromMessages(oneCreated, request(text))).toEqual([]);
      expect(ambiguousTargetsFromMessages(oneCreated.slice(2), request(text))).toHaveLength(1);
      expect(ambiguousTargetsFromMessages(messages.slice(2), request(text))).toHaveLength(1);
    });

    it("needs two candidates listed before taking a reply as a choice", () => {
      expect(armed(search(novaRows), "Mark Nova Expansion as Won.", "Nova Expansion is worth EUR 24,000.")).toBe(1);
    });

    it("leaves records with identical names to the model and guards only a shorter name", () => {
      const twins: Read = {
        input: { entity: "contact", searchTerm: "Alex Müller" },
        result: table([
          [NOVA, "Alex Müller"],
          [NOVA_2025, "Alex Müller"],
        ]),
      };
      expect(armed(twins, "Update Alex Müller's phone number to +12025550199.")).toBe(0);
      expect(armed(twins, "Update the contact named Alex Müller")).toBe(0);
      expect(
        armed(
          search([
            [NOVA, "Müller"],
            [NOVA_2025, "Müller"],
          ]),
          "Setze Müllers Deal auf Gewonnen",
        ),
      ).toBe(0);
      const expansions = search(
        [
          [NOVA, "Nova"],
          [NOVA_2025, "Nova Expansion"],
          [UNRELATED, "Nova Expansion"],
        ],
        "Nova",
      );
      expect(armed(expansions, "Mark the Nova Expansion deal as Won.")).toBe(0);
      const novas = search([
        [NOVA, "Nova"],
        [NOVA_2025, "Nova"],
        [UNRELATED, "Nova East"],
      ]);
      const [target] = ambiguousTargetsFromMessages(reads(novas), request("Delete the Nova deal."));
      expect(target?.candidates.map((candidate) => candidate.id)).toEqual([NOVA, NOVA_2025, UNRELATED]);
      expect(refusingTarget([target], false, { ids: [NOVA] })).toBe(target);
      expect(armed(novas, "Nova", "Did you mean one of the two Nova deals or Nova East?")).toBe(0);
      expect(armed(novas, "Delete Nova East.")).toBe(0);
      const alexes = search([
        [NOVA, "Alex Müller"],
        [NOVA_2025, "Alex Müller Jr"],
      ]);
      expect(armed(alexes, "Update all of Alex Müller's details: phone +49 30 1234.")).toBe(1);
    });

    it("arms on the spellings people type for a stored name", () => {
      const zurich = search(
        [
          [NOVA, "Außenstelle Zürich"],
          [NOVA_2025, "Außenstelle Zürich 2025"],
        ],
        "Zürich",
      );
      expect(armed(zurich, "Setze den Deal Aussenstelle Zürich auf Gewonnen.")).toBe(1);
      const alexes = search(
        [
          [NOVA, "Alex Müller"],
          [NOVA_2025, "Alex Müller Jr"],
        ],
        "Alex",
      );
      expect(armed(alexes, "Update Alex Mueller's phone number")).toBe(1);
      expect(armed(alexes, "Update Alex Muller's phone number")).toBe(1);
      const acme = search(
        [
          [NOVA, "Acme Inc."],
          [NOVA_2025, "Acme Inc. Europe"],
        ],
        "Acme",
      );
      expect(armed(acme, "Update the address of Acme Inc to Main Street 5")).toBe(1);
      const cafeNova = search(
        [
          [NOVA, "Café Nova"],
          [NOVA_2025, "Café Nova 2025"],
        ],
        "Nova",
      );
      expect(armed(cafeNova, "Mark Cafe Nova as won")).toBe(1);
      const cafeNord = search([
        [NOVA, "Café Nord"],
        [NOVA_2025, "Café Nord 2025"],
        [UNRELATED, "Café Nord Pilot"],
      ]);
      for (const text of [
        "Alles klar, Cafe Nord auf Gewonnen setzen.",
        "Thanks all! Mark Cafe Nord as Won.",
        "Merci à tous. Passe Cafe Nord à gagné.",
        "Mark Cafe Nord 2025 as won. Thanks all, Cafe Nord as lost.",
      ])
        expect(armed(cafeNord, text), text).toBe(1);
      const mullerKg = search([
        [NOVA, "Müller GmbH & Co. KG"],
        [NOVA_2025, "Müller GmbH & Co. KG 2025"],
      ]);
      expect(armed(mullerKg, "Alles klar, Müller GmbH & Co KG auf Gewonnen setzen.")).toBe(1);
      const muellerBau = search([
        [NOVA, "Müller Bau"],
        [NOVA_2025, "Müller Bau 2025"],
      ]);
      expect(armed(muellerBau, "Setze alle Mueller Bau Deals auf Gewonnen.")).toBe(0);
    });

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
      expect(armed(dongfang, "东方红星期一的交易删了")).toBe(1);
      expect(armed(dongfang, "删除新东方红星")).toBe(1);
      expect(armed(dongfang, "东方红星\u{E0100}期一的交易删了")).toBe(1);
      expect(armed(dongfang, "东方红星")).toBe(0);
    });

    it("never takes a plural or a longer name's stem as naming the shorter candidate", () => {
      const adam = search([
        [NOVA, "Adam"],
        [NOVA_2025, "Adam Consulting"],
      ]);
      expect(armed(adam, "Adams", "Did you mean Adam or Adam Consulting?")).toBe(1);
      expect(
        armed(
          threeNovas,
          "Delete the Nova deal.",
          "I moved both Novas: Nova East to Negotiation and Nova West to Won.",
        ),
      ).toBe(1);
      const duplicates = search([
        [NOVA, "Nova"],
        [NOVA_2025, "Nova Expansion"],
        [UNRELATED, "Nova Expansion"],
      ]);
      const listing =
        "Es gibt drei passende Deals: Nova, Nova Expansion (Org B) und Nova Expansion (Org C). Welchen meinen Sie?";
      expect(armed(duplicates, "Nova Expansions Deal auf Gewonnen setzen", listing)).toBe(1);
      expect(armed(duplicates, "Nova, bitte", listing)).toBe(0);
      const expansion = search(
        [
          [NOVA, "Nova"],
          [NOVA_2025, "Nova Expansion"],
        ],
        "Nova",
      );
      expect(armed(expansion, "Nova Expansions Deal auf Gewonnen setzen", "Nova oder Nova Expansion?")).toBe(1);
    });

    it("arms on a phrase the user inflected or wrote without spaces around it", () => {
      const muller = search([
        [NOVA, "Müller"],
        [NOVA_2025, "Müller GmbH"],
      ]);
      expect(armed(muller, "Setze Müllers Deal auf Gewonnen")).toBe(1);
      expect(armed(nova, "Poista Novan kauppa")).toBe(1);
      expect(armed(nova, "Lösche den Novadeal.")).toBe(1);
      expect(armed(search(novaRows, "Nova Expansion"), "Setze den Nova-Expansion-Deal auf Gewonnen.")).toBe(1);
      expect(armed(nova, "Close these as lost:\nNova\nEast Frisia Wind\nKestrel")).toBe(1);
      expect(armed(search(novaRows, "Nova Expansion"), "Mark the Nova\nExpansion deal as Won")).toBe(1);
      expect(armed(nova, "After the renovation, delete the Nova deal.")).toBe(1);
      for (const before of [
        "删除",
        "取引の",
        "ディール",
        "ลบดีล",
        "ລົບ",
        "លុប",
        "ဖျက်",
        "بـ",
        "ب",
        "ו",
        "የ",
        "ܕ",
        "❤️",
        "1️⃣",
      ])
        expect(armed(nova, `${before}Nova`), before).toBe(1);
    });

    it("compares typographic apostrophes and any kind of space as their plain forms", () => {
      const obrien = search([
        [NOVA, "O'Brien"],
        [NOVA_2025, "O'Brien Consulting"],
      ]);
      for (const apostrophe of ["’", "´", "`", "′", "ʹ"])
        expect(armed(obrien, `Delete the O${apostrophe}Brien deal`), apostrophe).toBe(1);

      const east = search([
        [NOVA, "Nova East"],
        [NOVA_2025, "Nova East 2"],
      ]);
      expect(armed(east, "Nova\u3000East を削除")).toBe(1);
      expect(armed(east, "Delete Nova\u00a0East")).toBe(1);
      expect(armed(east, "Delete Nova  East,\nplease")).toBe(1);
      expect(armed(east, "Delete Nova  East 2")).toBe(0);
      expect(armed(nova, "Ｎｏｖａを削除")).toBe(1);
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
      expect(armed(decomposed, "Now mark Café as won.", "I moved Café Nord to Negotiation.")).toBe(1);
      expect(
        armed(
          search(
            [
              [NOVA, "Café"],
              [NOVA_2025, "Café Nord"],
            ],
            "Cafe\u0301",
          ),
          "Delete the Café deal.",
        ),
      ).toBe(1);
      expect(
        armed(
          search([
            [NOVA, "Cafe\u0301"],
            [NOVA_2025, "Cafe\u0301 Nord"],
          ]),
          "Café Nords Angebot, bitte",
          "Did you mean Café or Café Nord?",
        ),
      ).toBe(1);
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
    const listForm = encode({
      total: 2,
      items: [
        { id: NOVA, name: "Nova Expansion", totalValue: 24_000 },
        { id: NOVA_2025, name: "Nova Expansion 2025" },
      ],
    });
    const [listed] = ambiguousTargetsFromMessages(
      reads({ ...novaSearch, result: `${listForm}\n  - id: 33333333-3333` }),
      C34,
    );
    expect(listed?.candidates).toHaveLength(2);
  });

  it("reads search_records per entity, whichever entities it searched", () => {
    const result = encode({
      searchTerm: "Nova Expansion",
      results: [
        { entity: "deal", total: 2, items: novaRows.map(([id, name]) => ({ id, name })) },
        { entity: "contact", total: 1, items: [{ id: UNRELATED, name: "Nova Expansion" }] },
      ],
    });
    for (const input of [
      { entities: ["deal"], searchTerm: "Nova Expansion" },
      { entities: ["deal", "contact"], searchTerm: "Nova Expansion" },
      { searchTerm: "Nova Expansion" },
    ]) {
      const targets = ambiguousTargetsFromMessages(reads({ toolName: "search_records", input, result }), C34);
      expect(targets.map((target) => target.entity)).toEqual(["deal"]);
      expect(targets[0].candidates.map((candidate) => candidate.id)).toEqual([NOVA, NOVA_2025]);
    }
    expect(
      ambiguousTargetsFromMessages(
        reads({ toolName: "search_records", input: { entities: ["contact"], searchTerm: "Nova Expansion" }, result }),
        C34,
      ),
    ).toEqual([]);
  });

  it("arms on any list or search read, whatever it looked up, and on no other tool", () => {
    for (const input of [
      { entity: "deal" },
      { entity: "deal", searchTerm: "Kestrel" },
      { entity: "deal", filters: [{ field: "organizationIds", operator: "hasSome", value: [UNRELATED] }] },
    ])
      expect(ambiguousTargetsFromMessages(reads({ ...novaSearch, input }), C34)).toHaveLength(1);

    expect(
      ambiguousTargetsFromMessages(reads({ ...novaSearch, toolName: "get_records", input: { entity: "deal" } }), C34),
    ).toEqual([]);
  });

  it("reads a truncated search_records result section by section", () => {
    const result = encode({
      searchTerm: "Nova",
      results: [
        { entity: "deal", total: 2, items: novaRows.map(([id, name]) => ({ id, name })) },
        {
          entity: "organization",
          total: 3,
          items: [
            { id: UNRELATED, name: "Nova Analytics" },
            { id: "44444444-4444-4444-8444-444444444444", name: "Nova Logistics" },
            { id: "55555555-5555-4555-8555-555555555555", name: "Nova Retail" },
          ],
        },
      ],
    });
    const truncated = `${result.slice(0, result.indexOf("44444444") + 12)}\n[truncated: 4,012 more characters]`;
    expect(() => decode(truncated)).toThrow();
    expect(
      ambiguousTargetsFromMessages(
        reads({
          toolName: "search_records",
          input: { entities: ["organization"], searchTerm: "Nova" },
          result: truncated,
        }),
        C34,
      ),
    ).toEqual([]);
    for (const input of [{ searchTerm: "Nova" }, { entities: ["organization", "deal"], searchTerm: "Nova" }]) {
      const [target] = ambiguousTargetsFromMessages(
        reads({ toolName: "search_records", input, result: truncated }),
        C34,
      );
      expect(target?.entity).toBe("deal");
      expect(target?.candidates.map((candidate) => candidate.id)).toEqual([NOVA, NOVA_2025]);
    }
  });

  it("stays cheap on a long request over many same-named rows", () => {
    const rows = Array.from({ length: 100 }, (_, index): [string, string] => [
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      index === 99 ? "Nova East" : "Nova",
    ]);
    const started = performance.now();
    ambiguousTargetsFromMessages(
      reads({ input: { entity: "deal", searchTerm: "Nova" }, result: table(rows) }),
      request("all nova ".repeat(2_222)),
    );
    expect(performance.now() - started).toBeLessThan(2_000);
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
