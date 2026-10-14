import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  steps: [] as string[],
  syncRemaining: [] as boolean[],
  indexRemaining: [] as boolean[],
  reportFailure: vi.fn(),
}));

vi.mock("@/core/decorators/background-tenant", () => ({
  runAsBackgroundTenant: async (_userId: string, run: () => Promise<unknown>) => await run(),
}));
vi.mock("@/core/di", () => ({
  getWikiSemanticIndexService: () => ({
    syncStaleSections: () => {
      state.steps.push("sync");
      return Promise.resolve({ synced: 1, remaining: state.syncRemaining.shift() ?? false });
    },
    indexStalePages: () => {
      state.steps.push("index");
      return Promise.resolve({ indexed: 1, remaining: state.indexRemaining.shift() ?? false });
    },
  }),
}));
vi.mock("../capture-failure", () => ({
  toWorkflowFailure: (error: Error) => ({ name: error.name, message: error.message }),
  reportFailure: state.reportFailure,
}));

import { indexWikiPages } from "../index-wiki-pages";

beforeEach(() => {
  state.steps = [];
  state.syncRemaining = [];
  state.indexRemaining = [];
});

describe("index-wiki-pages workflow", () => {
  it("syncs every stale section batch before embedding, so the keyword index converges first", async () => {
    state.syncRemaining = [true, true, false];
    state.indexRemaining = [true, false];

    await indexWikiPages({ userId: "user" });

    expect(state.steps).toEqual(["sync", "sync", "sync", "index", "index"]);
  });

  it("still embeds after a section sync that leaves nothing behind", async () => {
    await indexWikiPages({ userId: "user" });

    expect(state.steps).toEqual(["sync", "index"]);
  });

  it("bounds the section sync so a page that never syncs cannot hold the workflow", async () => {
    state.syncRemaining = Array.from({ length: 500 }, () => true);

    await indexWikiPages({ userId: "user" });

    expect(state.steps.filter((step) => step === "sync").length).toBeLessThan(500);
    expect(state.steps.at(-1)).toBe("index");
  });
});
