import { describe, expect, it } from "vitest";

import { armById } from "../arms";
import { benchmarkCaseModelSelection } from "../episode";
import { BENCHMARK_CASES } from "../fixtures";

describe("unified benchmark registry", () => {
  it("contains the complete 52-case, 58-turn suite without duplicate ids", () => {
    expect(BENCHMARK_CASES).toHaveLength(52);
    expect(BENCHMARK_CASES.reduce((total, definition) => total + definition.prompts.length, 0)).toBe(58);
    expect(new Set(BENCHMARK_CASES.map((definition) => definition.id)).size).toBe(BENCHMARK_CASES.length);
  });

  it("keeps every migrated release regression strict", () => {
    const required = BENCHMARK_CASES.filter((definition) => definition.mergeRequired);
    expect(required.map((definition) => definition.id)).toEqual([
      "M8",
      "V37",
      "V38",
      "V39",
      "V40",
      "V41",
      "V42",
      "R43",
      "U44",
      "U45",
      "U46",
      "R47",
      "R48",
      "R49",
      "R50",
      "R51",
      "R52",
    ]);
    expect(required.reduce((total, definition) => total + definition.prompts.length, 0)).toBe(19);
  });

  it("covers view context and preserves the explicit fast-model pin contract", () => {
    const byId = new Map(BENCHMARK_CASES.map((definition) => [definition.id, definition]));
    expect(byId.get("V39")?.contexts?.[0]?.pageRoute).toContain("?view={view}&");
    expect(byId.get("V41")?.contexts?.[0]).toMatchObject({
      locale: "de",
      pageRoute: expect.stringContaining("/de/contacts/{contact}"),
    });
    expect(byId.get("R49")?.contexts).toEqual([{ modelKey: "fast" }, { modelKey: "omit" }]);
    expect(benchmarkCaseModelSelection("R49", armById("shipped"))).toMatchObject({
      modelKey: "fast",
      modelConfig: { modelId: "openai/gpt-5-nano", servingProvider: "azure" },
    });
    expect(benchmarkCaseModelSelection("S1", armById("flash-lite-medium"))).toMatchObject({
      modelKey: "bench:flash-lite-medium",
      modelConfig: {
        modelId: "google/gemini-3.5-flash-lite",
        thinkingLevel: "medium",
      },
    });
  });
});
