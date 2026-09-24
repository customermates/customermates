import { describe, expect, it } from "vitest";

import { BENCHMARK_CASES } from "../fixtures";

describe("benchmark case N15", () => {
  it("tells the judge that pageSize 50 is served exactly and never refused, so a correct reply reports no rejection", () => {
    const facts = BENCHMARK_CASES.find((definition) => definition.id === "N15")?.judgeFacts ?? [];

    expect(facts.some((fact) => fact.includes("list_records serves pageSize 50 exactly and never refuses it"))).toBe(true);
    expect(facts.some((fact) => fact.includes("a correct reply has no 'REJECTED: pageSize' line"))).toBe(true);
    expect(facts.join(" ")).toContain("COUNT: 9");
  });
});
