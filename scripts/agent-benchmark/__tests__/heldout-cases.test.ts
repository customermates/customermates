import { describe, expect, it } from "vitest";

import { DOCS_HELDOUT_LIVE_SPECS } from "../classifier-eval/heldout/docs-heldout";
import { ROUTING_HELDOUT } from "../classifier-eval/heldout/routing-heldout";
import { BENCHMARK_CASES } from "../fixtures";
import {
  HELDOUT_DOCS_CASES,
  HELDOUT_ROUTING_CASES,
  scoreHeldoutCase,
  toolsetsCalledInTurn,
  type HeldoutCaseId,
} from "../heldout-cases";

function score(caseId: string, turnTools: string[][], unchanged = true, noMutatingTools = true) {
  const checks: { id: string; passed: boolean; gate?: string }[] = [];
  scoreHeldoutCase(caseId as HeldoutCaseId, {
    turnTools: turnTools.map((names) => names.map((name) => ({ name }))),
    unchanged,
    noMutatingTools,
    check: (id, passed, gate) => checks.push({ id, passed, gate }),
  });
  return checks;
}

describe("held-out live cases", () => {
  it("turns every docs live spec into one read-only case in the user's language and locale", () => {
    expect(HELDOUT_DOCS_CASES.map((definition) => definition.id)).toEqual(DOCS_HELDOUT_LIVE_SPECS.map((spec) => spec.id));
    for (const [index, definition] of HELDOUT_DOCS_CASES.entries()) {
      const spec = DOCS_HELDOUT_LIVE_SPECS[index]!;
      expect(definition.prompts).toEqual([spec.prompt]);
      expect(definition.contexts).toEqual([{ locale: spec.locale, pageRoute: `/${spec.locale}/contacts` }]);
      expect(definition.judgeFacts[0]).toBe(spec.goldFact);
      expect(definition.judgeFacts[1]).toContain(spec.page);
    }
    expect(score("DH01", [["search_docs"]])).toEqual([
      { id: "business-state-unchanged", passed: true, gate: "safety" },
      { id: "no-mutating-tool-attempt", passed: true, gate: "safety" },
    ]);
    expect(score("DH01", [[]], false, false).every((check) => !check.passed)).toBe(true);
  });

  it("turns every routing item into one case with its prompts in order", () => {
    expect(HELDOUT_ROUTING_CASES).toHaveLength(ROUTING_HELDOUT.length);
    for (const [index, definition] of HELDOUT_ROUTING_CASES.entries()) {
      const item = ROUTING_HELDOUT[index]!;
      expect(definition.id).toBe(`RH${String(index + 1).padStart(2, "0")}`);
      expect(definition.prompts).toEqual(item.prompts);
      expect(definition.needs).toHaveLength(item.prompts.length);
    }
  });

  it("requires a tool of each needed set per turn and never counts load_toolset alone", () => {
    const views = HELDOUT_ROUTING_CASES.find((definition) => definition.item.id === "r-de-01")!;
    expect(score(views.id, [["load_toolset", "manage_data_views"]])).toEqual([
      { id: "turn-1:uses-views", passed: true, gate: undefined },
    ]);
    expect(score(views.id, [["load_toolset"]])[0]?.passed).toBe(false);
    const multi = HELDOUT_ROUTING_CASES.find((definition) => definition.item.id === "r-mr-06")!;
    const checks = score(multi.id, [["list_records"], ["manage_data_views"], ["list_records"]]);
    expect(checks.map((check) => [check.id, check.passed])).toEqual([
      ["turn-2:uses-views", true],
      ["turn-3:uses-routines", false],
    ]);
    const none = HELDOUT_ROUTING_CASES.find((definition) => definition.item.toolsets.length === 0)!;
    expect(score(none.id, none.prompts.map(() => []))).toEqual([]);
    expect([...toolsetsCalledInTurn([{ name: "manage_webhooks" }, { name: "list_records" }])]).toEqual(["webhooks"]);
  });

  it("keeps held-out cases comparative, unjudged by the rubric and out of the merge suite", () => {
    const heldout = BENCHMARK_CASES.filter((definition) => definition.heldout === true);
    expect(heldout.every((definition) => definition.comparative === true && definition.judgeable === false)).toBe(true);
    expect(heldout.some((definition) => definition.mergeRequired)).toBe(false);
  });
});
