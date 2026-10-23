import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import manifest from "@/core/solutions/solution-capture-manifest.json";
import provenance from "@/core/solutions/solution-capture-provenance.json";
import {
  SOLUTION_NAV_CAPTURE_CLIP,
  SOLUTION_NAV_CAPTURE_VIEWPORT,
  SOLUTION_NAV_IMAGE_SIZE,
  type SolutionCaptureManifest,
  type SolutionCaptureProvenance,
  checkSolutionCaptureManifest,
} from "@/core/solutions/solution-captures";
import { solutionNavRouteForPlanItem } from "@/scripts/lib/solution-nav-routes";

const CAPTURE_RUN_PENDING = false;

function readFacts(src: string) {
  const file = join(REPO_ROOT, "public", src);
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  return { bytes: buffer.byteLength, sha256: createHash("sha256").update(new Uint8Array(buffer)).digest("hex") };
}

describe("solution captures", () => {
  it("ships a light and dark capture and navigation preview for every published solution view, within budget", () => {
    const result = checkSolutionCaptureManifest(
      manifest as SolutionCaptureManifest,
      provenance as SolutionCaptureProvenance,
      { allowPlaceholders: CAPTURE_RUN_PENDING, navRoute: solutionNavRouteForPlanItem, readFile: readFacts },
    );
    expect(result.problems, result.problems.join("\n")).toEqual([]);
  });

  it("captures every navigation preview with the current window, clip and image size", () => {
    const nav = (provenance as SolutionCaptureProvenance).nav;
    expect(nav?.viewport).toEqual(SOLUTION_NAV_CAPTURE_VIEWPORT);
    expect(nav?.clip).toEqual(SOLUTION_NAV_CAPTURE_CLIP);
    expect(nav?.image).toEqual(SOLUTION_NAV_IMAGE_SIZE);
    for (const entry of (manifest as SolutionCaptureManifest).entries)
      expect({ height: entry.nav.height, width: entry.nav.width }).toEqual(SOLUTION_NAV_IMAGE_SIZE);
  });
});
