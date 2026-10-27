import { describe, expect, it } from "vitest";

import { solutionTemplatesFromSeeds } from "@/prisma/seeds/solutions/solution-templates-source";

import { SOLUTION_CATALOG } from "../solution-catalog";
import { SOLUTION_TEMPLATES } from "../solution-templates";

describe("solution templates", () => {
  it("match the demo workspace seeds (run yarn solution-templates:generate after changing them)", () => {
    expect(SOLUTION_TEMPLATES).toEqual(solutionTemplatesFromSeeds());
  });

  it("cover every solution of the catalog with a pipeline", () => {
    for (const { id } of SOLUTION_CATALOG) {
      expect(SOLUTION_TEMPLATES[id].lists.length, id).toBeGreaterThan(0);
      expect(SOLUTION_TEMPLATES[id].stages.length, id).toBeGreaterThan(1);
    }
  });
});
