import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import manifest from "@/core/solutions/solution-capture-manifest.json";
import provenance from "@/core/solutions/solution-capture-provenance.json";
import stage from "@/core/solutions/solution-stage-captures.json";
import {
  type SolutionCaptureManifest,
  type SolutionCaptureProvenance,
  checkSolutionCaptureManifest,
} from "@/core/solutions/solution-captures";
import { SOLUTION_CATALOG, SOLUTION_DATA_LOCALES } from "@/core/solutions/solution-catalog";
import { type SolutionStageCaptures, checkSolutionStageCaptures } from "@/core/solutions/solution-stage";
import { solutionNavRouteForPlanItem, solutionTargetPath } from "@/scripts/lib/solution-nav-routes";

function readFacts(src: string) {
  const file = join(REPO_ROOT, "public", src);
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  return { bytes: buffer.byteLength, sha256: createHash("sha256").update(new Uint8Array(buffer)).digest("hex") };
}

const captures = stage as SolutionStageCaptures;

describe("solution stage captures", () => {
  it("keeps the stage routes in step with the seed definitions", () => {
    for (const solution of SOLUTION_CATALOG) {
      for (const tab of solution.stage) {
        for (const dataLocale of SOLUTION_DATA_LOCALES) {
          const resolved = solutionTargetPath(solution, tab.target, dataLocale);
          expect(resolved.fallback, `${solution.id}:${tab.id}:${dataLocale}`).toBeUndefined();
          expect(captures.routes[solution.id]?.[tab.id]?.[dataLocale], `${solution.id}:${tab.id}:${dataLocale}`).toBe(
            resolved.path,
          );
        }
      }
    }
  });

  it("ships only valid stage captures and keeps them within the shared solution capture budget", () => {
    const main = checkSolutionCaptureManifest(
      manifest as SolutionCaptureManifest,
      provenance as SolutionCaptureProvenance,
      { allowPlaceholders: true, navRoute: solutionNavRouteForPlanItem, readFile: readFacts },
    );
    const result = checkSolutionStageCaptures(captures, {
      baseBytes: main.totalBytes,
      readFile: readFacts,
      requireAll: false,
    });
    expect(result.problems, result.problems.join("\n")).toEqual([]);
  });
});
