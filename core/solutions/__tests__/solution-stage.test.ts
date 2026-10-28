import { assert, describe, expect, it } from "vitest";

import { SOLUTION_CAPTURE_BUDGET_BYTES } from "@/core/solutions/solution-captures";
import { SOLUTION_CATALOG, findSolution } from "@/core/solutions/solution-catalog";
import {
  SOLUTION_STAGE_IMAGE_SIZE,
  type SolutionStageCaptureEntry,
  type SolutionStageCaptures,
  type SolutionStageRoutes,
  checkSolutionStageCaptures,
  solutionStageCaptureSrc,
  solutionStagePlan,
  solutionStagePoster,
  solutionStageRoute,
} from "@/core/solutions/solution-stage";

const consultants = findSolution("consultants");
const catalog = [consultants];

const routes: SolutionStageRoutes = {
  consultants: {
    calendar: { de: "/calendar", en: "/calendar" },
    dashboard: { de: "/dashboard", en: "/dashboard" },
    engagements: { de: "/records/b?view=2", en: "/records/a?view=1" },
    inbox: { de: "/inbox?threadId=latest", en: "/inbox?threadId=latest" },
  },
};

function captured(bytes = 10): SolutionStageCaptures {
  const entries: SolutionStageCaptureEntry[] = solutionStagePlan(routes, catalog).map((item) => ({
    ...SOLUTION_STAGE_IMAGE_SIZE,
    bytes,
    key: item.key,
    route: item.route,
    sha256: item.key,
    src: item.src,
  }));
  return { capturedOn: "2026-10-25", entries, environment: "test", routes, sourceRevision: "abc" };
}

function readFileFor(captures: SolutionStageCaptures) {
  const facts = new Map(captures.entries.map((entry) => [entry.src, { bytes: entry.bytes, sha256: entry.sha256 }]));
  return (src: string) => facts.get(src) ?? null;
}

describe("solution product stage", () => {
  it("gives every solution four tabs that open on the dashboard and end on the calendar", () => {
    for (const solution of SOLUTION_CATALOG) {
      expect(solution.stage, solution.id).toHaveLength(4);
      expect(solution.stage[0].id).toBe("dashboard");
      expect(solution.stage[3].target).toEqual({ kind: "calendar" });
      expect(new Set(solution.stage.map((tab) => tab.id)).size).toBe(4);
    }
  });

  it("captures every tab but the dashboard per public locale and theme", () => {
    const plan = solutionStagePlan(routes, catalog);
    expect(plan).toHaveLength(3 * consultants.publicLocales.length * 2);
    expect(plan.some((item) => item.tab === "dashboard")).toBe(false);
    expect(plan.find((item) => item.key === "consultants:engagements:de:dark")?.src).toBe(
      solutionStageCaptureSrc("consultants", "engagements", "de", "dark"),
    );
  });

  it("opens each tab in the workspace of the page's data locale", () => {
    expect(solutionStageRoute(routes, consultants, "engagements", "de")).toBe("/de/w/beratung/records/b?view=2");
    expect(solutionStageRoute(routes, consultants, "engagements", "fr")).toBe("/fr/w/consultants/records/a?view=1");
    expect(solutionStageRoute(routes, consultants, "pipeline", "en")).toBeUndefined();
  });

  it("returns a poster only when both themes were captured", () => {
    const captures = captured();
    const src = solutionStagePoster(captures, "consultants", "calendar", "en")?.dark.src;
    assert(src);
    expect(new URL(src, "https://example.test").pathname).toBe(
      solutionStageCaptureSrc("consultants", "calendar", "en", "dark"),
    );
    const lightOnly = {
      ...captures,
      entries: captures.entries.filter((entry) => entry.key !== "consultants:calendar:en:dark"),
    };
    expect(solutionStagePoster(lightOnly, "consultants", "calendar", "en")).toBeNull();
  });

  it("changes the rendered poster URL when a recapture changes its checksum", () => {
    const captures = captured();
    const first = solutionStagePoster(captures, "consultants", "inbox", "en")?.light.src;
    assert(first);
    const recaptured = {
      ...captures,
      entries: captures.entries.map((entry) => ({ ...entry, sha256: "new-capture" })),
    };
    const next = solutionStagePoster(recaptured, "consultants", "inbox", "en")?.light.src;
    assert(next);
    expect(next).not.toBe(first);
    expect(new URL(next, "https://example.test").pathname).toBe(
      solutionStageCaptureSrc("consultants", "inbox", "en", "light"),
    );
    expect(new URL(next, "https://example.test").searchParams.get("v")).toBe("new-capture");
  });

  it("accepts missing captures as fallbacks unless every capture is required", () => {
    const empty = { ...captured(), entries: [] };
    const relaxed = checkSolutionStageCaptures(empty, {
      baseBytes: 0,
      catalog,
      readFile: () => null,
      requireAll: false,
    });
    expect(relaxed.problems).toEqual([]);
    expect(relaxed.missing).toHaveLength(solutionStagePlan(routes, catalog).length);
    const strict = checkSolutionStageCaptures(empty, { baseBytes: 0, catalog, readFile: () => null, requireAll: true });
    expect(strict.problems.length).toBe(relaxed.missing.length);
  });

  it("counts the stage against the shared solution capture budget", () => {
    const captures = captured(100);
    const options = { catalog, readFile: readFileFor(captures), requireAll: true };
    expect(checkSolutionStageCaptures(captures, { ...options, baseBytes: 0 }).problems).toEqual([]);
    const over = checkSolutionStageCaptures(captures, { ...options, baseBytes: SOLUTION_CAPTURE_BUDGET_BYTES });
    expect(over.problems.some((problem) => problem.includes("budget"))).toBe(true);
  });

  it("flags captures of a stale route or the wrong size", () => {
    const captures = captured();
    const [first, ...rest] = captures.entries;
    const stale = { ...captures, entries: [{ ...first, route: "/en/w/other/calendar", width: 10 }, ...rest] };
    const result = checkSolutionStageCaptures(stale, {
      baseBytes: 0,
      catalog,
      readFile: readFileFor(captures),
      requireAll: true,
    });
    expect(result.problems).toHaveLength(2);
  });
});
