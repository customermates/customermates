import { afterEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" } }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import type {
  StoredSetupPhase,
  WorkspaceSetupPatch,
  WorkspaceSetupPhase,
  WorkspaceSetupRecord,
} from "../workspace-setup.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";

import { SETUP_PHASE_HEARTBEAT_MS, WorkspaceSetupBuildService } from "../workspace-setup-build.service";
import {
  SETUP_BUILD_IDLE_MS,
  SETUP_PHASE_STALE_MS,
  abandonedSetupPatch,
  emptySetupPhase,
  setupBuildStalled,
  setupPhaseRetryable,
} from "../workspace-setup-phases";
import { SETUP_ANSWER_GUIDE_KEY, setupAnswerTopics } from "../workspace-setup-answer-pages";
import { setupPageTitles } from "../workspace-setup-knowledge-brief";
import { workspaceSetupView } from "../workspace-setup-status";
import { RetryWorkspaceSetupPhaseInteractor } from "../retry-workspace-setup-phase.interactor";

const SETUP_ID = "5d0b1f9e-2c6a-4f43-9a1e-7b3c2d4e5f60";
const PAGE_ID = "8f1c7a52-3b9e-4d1a-9c2f-6e5d4c3b2a10";
const RUN_ID = "run-a";
const plan = SetupPlanSchema.parse(agencyPlan);
const answers = {
  companyName: { source: "user", confidence: 1, value: { format: "shortText", value: "Studio Example" } },
  language: { source: "user", confidence: 1, value: { format: "singleChoice", value: "en" } },
  currency: { source: "user", confidence: 1, value: { format: "singleChoice", value: "EUR" } },
  existingData: { source: "user", confidence: 1, value: { format: "singleChoice", value: "empty" } },
} as unknown as WorkspaceSetupRecord["answers"];

function phase(overrides: Partial<StoredSetupPhase> = {}): StoredSetupPhase {
  return { ...emptySetupPhase(), ...overrides };
}

function setupRecord(overrides: Partial<WorkspaceSetupRecord> = {}): WorkspaceSetupRecord {
  return {
    id: SETUP_ID,
    userId: "owner-1",
    status: "building",
    websiteUrl: null,
    crawlId: null,
    answers,
    interview: {} as WorkspaceSetupRecord["interview"],
    plan,
    planRevision: 1,
    phases: {
      knowledgeBase: phase(),
      dataModel: phase(),
      views: phase(),
      records: phase(),
      dashboard: phase(),
    },
    artifacts: {},
    created: {
      references: [],
      lists: [],
      fields: [],
      relationships: [],
      views: [],
      widgets: [],
      pages: [],
      sampleRecords: [],
      importedRecords: [],
    },
    results: { colors: null, lists: [], views: [], records: [], widgets: [], pages: [] },
    spreadsheetName: null,
    hasSpreadsheet: false,
    startedAt: new Date(),
    confirmedAt: new Date(),
    finishedAt: null,
    ...overrides,
  };
}

function memoryRepo(initial: WorkspaceSetupRecord) {
  const store = { setup: initial };
  const repo = {
    store,
    get: vi.fn(() => Promise.resolve(store.setup)),
    mutate: vi.fn((_id: string, change: (setup: WorkspaceSetupRecord) => WorkspaceSetupPatch | null) => {
      const patch = change(store.setup);
      if (patch) store.setup = { ...store.setup, ...patch };
      return Promise.resolve({ setup: store.setup, changed: Boolean(patch) });
    }),
    crawlState: vi.fn(() => Promise.resolve<unknown>({ status: "synthesizing", failureReason: null })),
    knowledgeBasePages: vi.fn(() => Promise.resolve([])),
    stopCrawl: vi.fn(() => Promise.resolve()),
    findWikiPageCreatedSince: vi.fn((_title: string, _since: Date) => Promise.resolve<string | null>(null)),
    reopenCrawlSynthesis: vi.fn(() => Promise.resolve(false)),
  };
  return repo;
}

function buildService(repo: ReturnType<typeof memoryRepo>) {
  const models = { generate: vi.fn(), drainWarnings: () => [] };
  const records = {
    getModel: vi.fn(() => Promise.resolve({ revision: 1, types: [], fields: [], relationships: [] })),
    getOperation: vi.fn(),
  };
  const createPages = { invoke: vi.fn() };
  const unused = { invoke: vi.fn() } as never;
  const service = new WorkspaceSetupBuildService(
    repo as never,
    models as never,
    records as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    () => vi.fn() as never,
    unused,
    unused,
    createPages as never,
    unused,
  );
  return { service, models, records, createPages };
}

const run = <T>(fn: () => Promise<T>) => runWithTenant(createMockUser(), fn);
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

afterEach(() => {
  vi.useRealTimers();
});

describe("claiming a build phase", () => {
  it("lets only the run that claimed a waiting Knowledge Base resume it until its claim goes stale", async () => {
    const repo = memoryRepo(setupRecord({ crawlId: "crawl-1" }));
    const { service } = buildService(repo);

    expect(await run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, "run-a"))).toBe("wait");
    expect(repo.store.setup.phases.knowledgeBase).toMatchObject({
      status: "running",
      attempts: 1,
      claimToken: "run-a",
    });
    expect(await run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, "run-b"))).toBe("busy");
    expect(await run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, "run-a"))).toBe("wait");
    expect(repo.crawlState).toHaveBeenCalledTimes(2);

    repo.store.setup = {
      ...repo.store.setup,
      phases: {
        ...repo.store.setup.phases,
        knowledgeBase: phase({
          ...repo.store.setup.phases.knowledgeBase,
          claimedAt: ago(SETUP_PHASE_STALE_MS + 1_000),
        }),
      },
    };
    expect(await run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, "run-b"))).toBe("wait");
    expect(repo.store.setup.phases.knowledgeBase).toMatchObject({ claimToken: "run-b", attempts: 1 });
  });

  it("does not settle a phase over the run that took it over while the work was running", async () => {
    const repo = memoryRepo(setupRecord({ crawlId: "crawl-1" }));
    repo.crawlState.mockImplementation(() => {
      repo.store.setup = {
        ...repo.store.setup,
        phases: {
          ...repo.store.setup.phases,
          knowledgeBase: phase({ attempts: 1, claimedAt: new Date().toISOString() }),
        },
      };
      return Promise.resolve({ status: "completed", failureReason: null });
    });
    const { service } = buildService(repo);

    expect(await run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, "run-a"))).toBe("skip");
    expect(repo.store.setup.phases.knowledgeBase).toMatchObject({ status: "pending", attempts: 1 });
    expect(repo.store.setup.results.pages).toEqual([]);
  });

  it("refreshes its claim while a long step works, so only a dead step goes stale", async () => {
    vi.useFakeTimers();
    const repo = memoryRepo(setupRecord({ crawlId: "crawl-1" }));
    let finishCrawl: (value: unknown) => void = () => undefined;
    repo.crawlState.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCrawl = resolve;
        }),
    );
    const { service } = buildService(repo);
    const started = Date.now();

    const result = run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, "run-a"));
    await vi.advanceTimersByTimeAsync(SETUP_PHASE_HEARTBEAT_MS * 3);
    expect(new Date(repo.store.setup.phases.knowledgeBase?.claimedAt ?? 0).getTime()).toBe(
      started + SETUP_PHASE_HEARTBEAT_MS * 3,
    );
    finishCrawl({ status: "completed", failureReason: null });
    expect(await result).toBe("settled");
    expect(repo.store.setup.phases.knowledgeBase).toMatchObject({ status: "completed", claimedAt: null });
    expect(repo.store.setup.phases.knowledgeBase).not.toHaveProperty("claimToken");
    expect(SETUP_PHASE_STALE_MS).toBeGreaterThanOrEqual(SETUP_PHASE_HEARTBEAT_MS * 3);
  });
});

describe("waiting for the data model operation", () => {
  it("hands a long record operation to the next step instead of waiting in one step", async () => {
    vi.useFakeTimers();
    const operation = { operationId: "operation-1", since: new Date().toISOString() };
    const repo = memoryRepo(
      setupRecord({
        artifacts: { dataModelOperation: operation, references: [], brand: null },
        phases: {
          ...setupRecord().phases,
          dataModel: phase({ status: "running", attempts: 1, claimedAt: new Date().toISOString(), claimToken: RUN_ID }),
        },
      }),
    );
    const { service, records } = buildService(repo);
    records.getOperation.mockResolvedValue({ state: "running" });

    const waiting = run(() => service.runPhase(SETUP_ID, "dataModel", false, RUN_ID));
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await waiting).toBe("wait");
    expect(repo.store.setup.phases.dataModel?.status).toBe("running");
    expect(repo.store.setup.artifacts.dataModelOperation).toEqual(operation);

    records.getOperation.mockResolvedValue({ state: "completed" });
    expect(await run(() => service.runPhase(SETUP_ID, "dataModel", false, RUN_ID))).toBe("settled");
    expect(repo.store.setup.phases.dataModel?.status).toBe("completed");
    expect(repo.store.setup.artifacts).not.toHaveProperty("dataModelOperation");
  });

  it("gives up on an operation that outlived the overall wait and retries the phase", async () => {
    const repo = memoryRepo(
      setupRecord({
        artifacts: {
          dataModelOperation: { operationId: "operation-1", since: ago(5 * 60 * 1_000) },
          references: [],
          brand: null,
        },
        phases: {
          ...setupRecord().phases,
          dataModel: phase({ status: "running", attempts: 1, claimedAt: new Date().toISOString(), claimToken: RUN_ID }),
        },
      }),
    );
    const { service, records } = buildService(repo);
    records.getOperation.mockResolvedValue({ state: "running" });

    expect(await run(() => service.runPhase(SETUP_ID, "dataModel", false, RUN_ID))).toBe("wait");
    expect(repo.store.setup.phases.dataModel).toMatchObject({ status: "pending", error: "error" });
    expect(repo.store.setup.artifacts).not.toHaveProperty("dataModelOperation");
  });
});

describe("writing the Knowledge Base from the answers", () => {
  async function topicKeys() {
    const copy = await setupPageTitles("en");
    return [...setupAnswerTopics(plan, answers, copy.title).map((topic) => topic.key), SETUP_ANSWER_GUIDE_KEY];
  }

  it("records a page a crashed step created instead of writing it a second time", async () => {
    const keys = await topicKeys();
    expect(keys.length).toBeGreaterThan(1);
    const intendedAt = ago(30_000);
    const repo = memoryRepo(
      setupRecord({
        artifacts: {
          answerPages: {
            planned: keys.length,
            pages: keys.map((key) => ({ key, title: `Page ${key}`, pageId: null, intendedAt })),
          },
        },
      }),
    );
    repo.findWikiPageCreatedSince.mockResolvedValue(PAGE_ID);
    const { service, models, createPages } = buildService(repo);

    expect(await run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, RUN_ID))).toBe("settled");
    expect(createPages.invoke).not.toHaveBeenCalled();
    expect(models.generate).not.toHaveBeenCalled();
    expect(repo.findWikiPageCreatedSince).toHaveBeenCalledWith(`Page ${keys[0]}`, expect.any(Date));
    expect(repo.findWikiPageCreatedSince.mock.calls[0][1].getTime()).toBeLessThan(new Date(intendedAt).getTime());
    expect(repo.store.setup.phases.knowledgeBase?.status).toBe("completed");
    expect(repo.store.setup.results.pages).toHaveLength(keys.length);
  });

  it("writes a page again when the crashed step never created it", async () => {
    const keys = await topicKeys();
    const repo = memoryRepo(
      setupRecord({
        artifacts: {
          answerPages: {
            planned: keys.length,
            pages: [{ key: keys[0], title: "Lost page", pageId: null, intendedAt: ago(30_000) }],
          },
        },
      }),
    );
    const { service, models } = buildService(repo);
    models.generate.mockResolvedValue({ ok: false, failure: "generation" });

    await run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, RUN_ID));
    expect(repo.findWikiPageCreatedSince).toHaveBeenCalledWith("Lost page", expect.any(Date));
    expect(models.generate.mock.calls.some(([args]) => String(args.prompt).includes("Page title:"))).toBe(true);
  });
});

describe("releasing an abandoned build", () => {
  it("fails the phases its own run claimed and their dependents, and leaves other runs' live claims", () => {
    const now = new Date();
    const setup = setupRecord({
      phases: {
        knowledgeBase: phase({ status: "running", attempts: 1, claimedAt: now.toISOString(), claimToken: "run-a" }),
        dataModel: phase({ status: "running", attempts: 1, claimedAt: now.toISOString(), claimToken: "run-b" }),
        views: phase(),
        records: phase(),
        dashboard: phase(),
      },
    });

    const first = abandonedSetupPatch(setup, now, undefined, "run-a");
    expect(first?.status).toBeUndefined();
    const released = { ...setup, ...first };
    expect(released.phases.knowledgeBase).toMatchObject({ status: "failed", error: "error", claimedAt: null });
    expect(released.phases.knowledgeBase).not.toHaveProperty("claimToken");
    expect(released.phases.dataModel?.status).toBe("running");
    expect(released.phases.views?.status).toBe("pending");

    const second = abandonedSetupPatch(released, now, undefined, "run-b");
    expect(second?.status).toBe("failed");
    const statuses = (["dataModel", "views", "records", "dashboard"] as WorkspaceSetupPhase[]).map((key) => [
      second?.phases?.[key]?.status,
      second?.phases?.[key]?.error,
    ]);
    expect(statuses).toEqual([
      ["failed", "error"],
      ["failed", "dependency"],
      ["failed", "dependency"],
      ["failed", "dependency"],
    ]);
  });
});

describe("a build no run works on anymore", () => {
  const idle = new Date(Date.now() - SETUP_BUILD_IDLE_MS - 60_000);

  it("counts as stalled only without a live claim and without recent phase activity", () => {
    const now = new Date();
    expect(setupBuildStalled(setupRecord({ confirmedAt: idle }), now)).toBe(true);
    expect(setupBuildStalled(setupRecord(), now)).toBe(false);
    const live = setupRecord({
      confirmedAt: idle,
      phases: {
        ...setupRecord().phases,
        dataModel: phase({ status: "running", attempts: 1, claimedAt: now.toISOString() }),
      },
    });
    expect(setupBuildStalled(live, now)).toBe(false);
    const onlyKnowledgeBase = setupRecord({
      confirmedAt: idle,
      phases: {
        ...setupRecord().phases,
        knowledgeBase: phase({ status: "running", attempts: 1, claimedAt: now.toISOString() }),
      },
    });
    expect(setupBuildStalled(onlyKnowledgeBase, now)).toBe(true);
    const queued = setupRecord({
      confirmedAt: idle,
      phases: { ...setupRecord().phases, records: phase({ attempts: 1, claimedAt: ago(10_000) }) },
    });
    expect(setupBuildStalled(queued, now)).toBe(false);
    expect(setupBuildStalled(setupRecord({ confirmedAt: idle, status: "failed" }), now)).toBe(false);
  });

  it("shows its unsettled phases as failed and lets each be retried", () => {
    const now = new Date();
    const setup = setupRecord({
      confirmedAt: idle,
      phases: { ...setupRecord().phases, knowledgeBase: phase({ status: "completed", attempts: 1 }) },
    });
    expect(setupPhaseRetryable(setup, "dataModel", now)).toBe(true);
    expect(setupPhaseRetryable(setup, "views", now)).toBe(true);
    expect(setupPhaseRetryable(setup, "knowledgeBase", now)).toBe(false);
    expect(setupPhaseRetryable(setupRecord(), "dataModel", now)).toBe(false);

    const view = workspaceSetupView(setup, null, { usedMicrocents: 0, heldMicrocents: 0 }, 100, now);
    expect(view.status).toBe("failed");
    expect(view.currentPhase).toBeNull();
    expect(view.phases.map((entry) => [entry.key, entry.status, entry.error])).toEqual([
      ["knowledgeBase", "completed", null],
      ["dataModel", "failed", "error"],
      ["views", "failed", "dependency"],
      ["records", "failed", "dependency"],
      ["dashboard", "failed", "dependency"],
    ]);
  });

  it("restarts a stalled pending phase once and starts a new build run", async () => {
    const repo = memoryRepo(setupRecord({ confirmedAt: idle }));
    const background = { dispatch: vi.fn(() => Promise.resolve()) };
    const retry = new RetryWorkspaceSetupPhaseInteractor(repo as never, { start: vi.fn() }, background, {
      require: vi.fn(() => Promise.resolve(null)),
    });

    expect(await run(() => retry.invoke({ setupId: SETUP_ID, phase: "dataModel" }))).toEqual({
      ok: true,
      data: { setupId: SETUP_ID },
    });
    expect(background.dispatch).toHaveBeenCalledWith("build-workspace-setup", {
      setupId: SETUP_ID,
      userId: expect.any(String),
    });
    expect(repo.store.setup.phases.dataModel).toMatchObject({ status: "pending", claimedAt: expect.any(String) });
    expect(setupBuildStalled(repo.store.setup, new Date())).toBe(false);

    const again = await run(() => retry.invoke({ setupId: SETUP_ID, phase: "dataModel" }));
    expect(again.ok).toBe(false);
    expect(background.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe("finishing a build", () => {
  it("completes the setup once every phase but the Knowledge Base settled and keeps writing the Knowledge Base", async () => {
    const done = phase({ status: "completed", attempts: 1, finishedAt: ago(1_000) });
    const repo = memoryRepo(
      setupRecord({
        crawlId: "crawl-1",
        phases: { knowledgeBase: phase(), dataModel: done, views: done, records: done, dashboard: done },
      }),
    );
    repo.crawlState.mockResolvedValue({ status: "completed", failureReason: null });
    const { service } = buildService(repo);

    expect(await run(() => service.finish(SETUP_ID))).toBe(true);
    expect(repo.store.setup.status).toBe("completed");
    const finishedAt = repo.store.setup.finishedAt;
    expect(finishedAt).toBeInstanceOf(Date);

    expect(await run(() => service.runPhase(SETUP_ID, "knowledgeBase", false, "run-a"))).toBe("settled");

    expect(repo.store.setup.phases.knowledgeBase?.status).toBe("completed");
    expect(repo.store.setup.status).toBe("completed");
    expect(repo.store.setup.finishedAt).toBe(finishedAt);
  });

  it("keeps a completed setup completed when its Knowledge Base fails afterwards and lets only that be retried", async () => {
    const done = phase({ status: "completed", attempts: 1, finishedAt: ago(1_000) });
    const repo = memoryRepo(
      setupRecord({
        status: "completed",
        finishedAt: new Date(Date.now() - 1_000),
        crawlId: "crawl-1",
        phases: { knowledgeBase: phase({ attempts: 3 }), dataModel: done, views: done, records: done, dashboard: done },
      }),
    );
    repo.crawlState.mockResolvedValue({ status: "failed", failureReason: "aiUnavailable" });
    const { service } = buildService(repo);

    expect(await run(() => service.runPhase(SETUP_ID, "knowledgeBase", true, "run-a"))).toBe("settled");

    expect(repo.store.setup.status).toBe("completed");
    expect(repo.store.setup.phases.knowledgeBase).toMatchObject({ status: "failed", error: "aiUnavailable" });
    expect(setupPhaseRetryable(repo.store.setup, "knowledgeBase", new Date())).toBe(true);
    expect(setupPhaseRetryable(repo.store.setup, "records", new Date())).toBe(false);
  });

  it("abandons a Knowledge Base whose run died after the setup completed, without reopening the setup", () => {
    const done = phase({ status: "completed", attempts: 1, finishedAt: ago(1_000) });
    const setup = setupRecord({
      status: "completed",
      finishedAt: new Date(Date.now() - 1_000),
      phases: {
        knowledgeBase: phase({
          status: "running",
          attempts: 1,
          claimedAt: new Date().toISOString(),
          claimToken: "run-a",
        }),
        dataModel: done,
        views: done,
        records: done,
        dashboard: done,
      },
    });

    const patch = abandonedSetupPatch(setup, new Date(), undefined, "run-a");

    expect(patch?.status).toBeUndefined();
    expect(patch?.phases?.knowledgeBase).toMatchObject({ status: "failed", error: "error" });
  });

  it("shows a build whose phases all settled as finished before the setup record says so", () => {
    const done = phase({ status: "completed", attempts: 1, finishedAt: ago(1_000) });
    const failed = phase({ status: "failed", error: "generation", attempts: 3, finishedAt: ago(1_000) });
    const settled = (records: StoredSetupPhase) =>
      setupRecord({ phases: { knowledgeBase: done, dataModel: done, views: done, records, dashboard: done } });

    expect(workspaceSetupView(settled(done), null, { usedMicrocents: 0, heldMicrocents: 0 }, 1).status).toBe(
      "completed",
    );
    expect(workspaceSetupView(settled(failed), null, { usedMicrocents: 0, heldMicrocents: 0 }, 1).status).toBe(
      "failed",
    );
  });
});
