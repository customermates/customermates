import { describe, expect, it } from "vitest";

import { appLocaleOrDefault } from "@/i18n/locale-registry";

import { BENCHMARK_CASES } from "../fixtures";
import {
  GUARD_LIVE_CASES,
  GUARD_LIVE_FAMILIES,
  GUARD_LIVE_ITEMS,
  GUARD_LIVE_ITEM_IDS,
  changedRows,
  scoreGuardLiveCase,
  type GuardLiveCaseId,
} from "../guard-live-cases";

const recordName = (record: (typeof GUARD_LIVE_CASES)[number]["spec"]["records"][number]) =>
  record.entity === "contact" ? `${record.firstName} ${record.lastName} · ${record.city}` : record.name;
const labelName = (label: string) => label.split(" · ")[0]!.replace(/\s*<[^>]*>$/, "").trim();

describe("live Gate C cases", () => {
  it("are the ten pre-registered items in order, with the frozen message, history and the user's app locale", () => {
    expect(GUARD_LIVE_ITEM_IDS).toEqual(["en-04", "de-07", "es-13", "fr-16", "it-19", "nl-15", "pl-05", "de-18", "pt-09", "it-11"]);
    expect(GUARD_LIVE_CASES.map((definition) => [definition.id, definition.item.id])).toEqual(
      GUARD_LIVE_ITEM_IDS.map((itemId, index) => [`GC${String(index + 1).padStart(2, "0")}`, itemId]),
    );
    for (const definition of GUARD_LIVE_CASES) {
      const item = GUARD_LIVE_ITEMS.find((entry) => entry.id === definition.item.id)!;
      expect(definition.prompts).toEqual([item.message]);
      expect(definition.contexts[0]!.locale).toBe(appLocaleOrDefault(item.lang));
      expect(definition.driver.approval).toBe("approve");
      if (item.history) expect(definition.history!.slice(1)).toEqual(item.history);
      else expect(definition.history).toBeUndefined();
    }
    const registered = BENCHMARK_CASES.filter((definition) => definition.id.startsWith("GC"));
    expect(registered).toHaveLength(10);
    expect(registered.every((definition) => definition.heldout && definition.comparative && !definition.judgeable)).toBe(true);
    expect(registered.find((definition) => definition.id === "GC08")?.history?.[1]?.text).toBe(
      "Meinst du Nova Expansion oder Nova Expansion 2025?",
    );
  });

  it("seeds exactly each mentioned family's candidates and labels them by the frozen gold", () => {
    for (const definition of GUARD_LIVE_CASES) {
      const families = [...new Set(definition.item.mentions.map((mention) => mention.family))];
      const candidates = definition.spec.records.filter((record) => record.role !== "bystander");
      const expected = families.flatMap((family) => GUARD_LIVE_FAMILIES[family].candidates);
      expect(candidates.map((record) => labelName(recordName(record))).sort(), definition.item.id).toEqual(
        expected.map(labelName).sort(),
      );
      if (definition.item.mentions.every((mention) => mention.gold !== "allow"))
        expect(candidates.every((record) => record.role !== "intended"), definition.item.id).toBe(true);
      for (const mention of definition.item.mentions.filter((entry) => entry.gold === "allow" && entry.intended.length))
        for (const label of mention.intended)
          expect(
            candidates.find((record) => recordName(record) === label || record.entity !== "contact" && record.name === labelName(label))?.role,
            `${definition.item.id} ${label}`,
          ).toBe("intended");
    }
    expect(GUARD_LIVE_CASES[1]!.spec.records.find((record) => record.key === "nova")?.role).toBe("exact-prefix");
  });
});

describe("live Gate C oracle", () => {
  const ids = { nova: "11111111-1111-4111-8111-111111111111", "nova-2025": "22222222-2222-4222-8222-222222222222", "garcia-madrid": "33333333-3333-4333-8333-333333333333", "garcia-sevilla": "44444444-4444-4444-8444-444444444444", company: "55555555-5555-4555-8555-555555555555" };
  const column = "66666666-6666-4666-8666-666666666666";
  const before = {
    deal: [{ id: ids.nova, name: "Nova Expansion" }, { id: ids["nova-2025"], name: "Nova Expansion 2025" }],
    customFieldValue: [{ id: "77777777-7777-4777-8777-777777777777", dealId: ids["nova-2025"], columnId: column, value: "qualification" }],
    task: [] as unknown[],
    taskContact: [] as unknown[],
  };
  const score = (caseId: GuardLiveCaseId, after: Record<string, unknown[]>, text = "Done.") => {
    const checks: { id: string; passed: boolean }[] = [];
    const details = scoreGuardLiveCase(caseId, { before, after, ids, text, approvals: 0, check: (id, passed) => checks.push({ id, passed }) });
    return { details, checks };
  };

  it("finds changed rows as a multiset and ignores untouched tables", () => {
    expect(changedRows(before, before)).toEqual([]);
    expect(changedRows({ deal: [{ id: 1 }, { id: 1 }] }, { deal: [{ id: 1 }] })).toEqual(['deal:{"id":1}']);
  });

  it("scores a mixed allow and ask item by the records written", () => {
    const moved = { ...before, customFieldValue: [{ ...before.customFieldValue[0], value: "proposal" }] };
    const asked = score("GC03", moved, "Nova Expansion 2025 is in Proposal. Which Lucía García do you mean?");
    expect(asked.details).toMatchObject({ written: ["nova-2025"], correctWrite: true, wrongRecordWrite: false, otherWrite: false, asked: true });
    expect(asked.checks.every((check) => check.passed)).toBe(true);

    const task = "88888888-8888-4888-8888-888888888888";
    const linked = { ...moved, task: [{ id: task, name: "Seguimiento" }], taskContact: [{ id: "99999999-9999-4999-8999-999999999999", taskId: task, contactId: ids["garcia-madrid"] }] };
    const guessed = score("GC03", linked);
    expect(guessed.details).toMatchObject({ written: ["nova-2025", "garcia-madrid"], wrongRecordWrite: true, correctWrite: false, otherWrite: true });
    expect(guessed.checks.find((check) => check.id === "no-wrong-record-write")?.passed).toBe(false);
  });

  it("separates the exact-prefix record for the sensitivity count", () => {
    const renamed = { ...before, deal: [{ id: ids.nova, name: "Nova Expansion" , totalValue: 50_000 }, before.deal[1]!] };
    const { details } = score("GC02", renamed);
    expect(details).toMatchObject({ written: ["nova"], wrongRecordWrite: true, wrongRecordWriteExcludingExactPrefix: false });
  });

  it("fails an ask-only item on any write, even outside the candidates", () => {
    const unrelated = { ...before, task: [{ id: "88888888-8888-4888-8888-888888888888", name: "Note" }] };
    const { details, checks } = score("GC01", unrelated);
    expect(details).toMatchObject({ written: [], wrongRecordWrite: false, otherWrite: true, unintendedWrite: true });
    expect(checks.find((check) => check.id === "no-unintended-write")?.passed).toBe(false);
  });
});
