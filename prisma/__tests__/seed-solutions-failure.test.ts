import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SeedContext } from "../seeds/context";
import type { SolutionSeedCounts } from "../seeds/solutions/seed-solution";
import type { SolutionWorkspacePlan } from "../seeds/solutions/seed-solutions";

const seeding = vi.hoisted(() => ({
  started: [] as string[],
  finished: [] as string[],
  behaviour: (_slug: string): Promise<void> => Promise.resolve(),
}));

vi.mock("../seeds/solutions/seed-solution", () => ({
  seedSolutionWorkspace: async (_context: unknown, workspace: { slug: string }): Promise<SolutionSeedCounts> => {
    seeding.started.push(workspace.slug);
    await seeding.behaviour(workspace.slug);
    seeding.finished.push(workspace.slug);
    return { slug: workspace.slug, created: 1, updated: 0, deleted: 0, unchanged: 0, durationMs: 1 };
  },
}));

const { seedSolutionWorkspaces } = await import("../seeds/solutions/seed-solutions");

const context = {} as SeedContext;

function plans(count: number): SolutionWorkspacePlan[] {
  return Array.from({ length: count }, (_, index) => ({
    workspace: { slug: `workspace-${index}`, team: index === 0 },
    content: {},
    model: {},
  })) as unknown as SolutionWorkspacePlan[];
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("seeding the demo workspaces after a failure", () => {
  beforeEach(() => {
    seeding.started.length = 0;
    seeding.finished.length = 0;
    seeding.behaviour = () => wait(15);
  });

  it("returns every workspace in plan order when nothing fails", async () => {
    const results = await seedSolutionWorkspaces(context, plans(12));
    expect(results.map(({ slug }) => slug)).toEqual(plans(12).map(({ workspace }) => workspace.slug));
  });

  it("stops starting workspaces after a failure and settles the ones in flight before it rethrows", async () => {
    seeding.behaviour = async (slug) => {
      await wait(slug === "workspace-3" ? 5 : 40);
      if (slug === "workspace-3") throw new Error("boom");
    };
    await expect(seedSolutionWorkspaces(context, plans(30))).rejects.toThrow("boom");
    expect(seeding.finished).not.toContain("workspace-3");
    expect(seeding.started.length).toBeLessThan(30);
    expect(seeding.started.filter((slug) => slug !== "workspace-3").toSorted()).toEqual(seeding.finished.toSorted());
  });

  it("stops after the team workspace fails, before any other workspace starts", async () => {
    seeding.behaviour = (slug) =>
      slug === "workspace-0" ? Promise.reject(new Error("team failed")) : Promise.resolve();
    await expect(seedSolutionWorkspaces(context, plans(8))).rejects.toThrow("team failed");
    expect(seeding.started).toEqual(["workspace-0"]);
  });

  it("stops at an aborted signal and reports its reason", async () => {
    const stop = new AbortController();
    seeding.behaviour = async (slug) => {
      await wait(20);
      if (slug === "workspace-2") stop.abort(new Error("the lock was lost"));
    };
    await expect(seedSolutionWorkspaces(context, plans(30), { signal: stop.signal })).rejects.toThrow(
      "the lock was lost",
    );
    expect(seeding.started.length).toBeLessThan(30);
    expect(seeding.started.toSorted()).toEqual(seeding.finished.toSorted());
  });

  it("stops starting workspaces once the budget is spent and fails with the budget message", async () => {
    seeding.behaviour = () => wait(30);
    await expect(seedSolutionWorkspaces(context, plans(40), { budgetMs: 50 })).rejects.toThrow("50 ms budget");
    expect(seeding.started.length).toBeLessThan(40);
    expect(seeding.started.toSorted()).toEqual(seeding.finished.toSorted());
  });
});
