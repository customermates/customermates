import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { AgentJobDetail, AgentJobSummary } from "@/features/agent-jobs/agent-job.schema";

const harness = vi.hoisted(() => ({
  getAgentJobsAction: vi.fn(),
  getAgentJobAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: harness.toastError, success: vi.fn() } }));
vi.mock("@/components/agent-keys/agent-key-actions", () => ({
  getAgentJobsAction: harness.getAgentJobsAction,
  getAgentJobAction: harness.getAgentJobAction,
}));

import { AgentRunsStore } from "../agent-runs.store";

function summary(id: string): AgentJobSummary {
  return {
    id,
    runtime: "ownKey",
    status: "succeeded",
    sourceKind: "automation",
    sourceId: null,
    model: "claude-sonnet-5-5",
    runnerId: null,
    attempts: 1,
    inputTokens: 100,
    outputTokens: 20,
    costMicrocents: null,
    error: null,
    result: { text: "Done", reason: "stop", toolCalls: 1 },
    startedAt: "2026-11-17T08:00:00.000Z",
    finishedAt: "2026-11-17T08:00:05.000Z",
    createdAt: "2026-11-17T08:00:00.000Z",
  };
}

function detail(id: string): AgentJobDetail {
  return { ...summary(id), prompt: "Do the thing", promptUntrusted: false, transcript: [] };
}

function store() {
  return new AgentRunsStore({ localeStore: { getTranslation: (key: string) => key } } as unknown as RootStore);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentRunsStore", () => {
  it("shows the first page and appends the next one with the same source filter", async () => {
    harness.getAgentJobsAction.mockResolvedValue({ ok: true, data: { jobs: [summary("b")], nextCursor: null } });
    const runs = store();
    runs.setPage({ jobs: [summary("a")], nextCursor: "cursor-1" }, { sourceKind: "automation", sourceId: "run-1" });

    expect(runs.hasMore).toBe(true);
    await runs.loadMore();

    expect(harness.getAgentJobsAction).toHaveBeenCalledWith({
      sourceKind: "automation",
      sourceId: "run-1",
      cursor: "cursor-1",
    });
    expect(runs.items.map((job) => job.id)).toEqual(["a", "b"]);
    expect(runs.hasMore).toBe(false);
    expect(runs.loadingMore).toBe(false);
  });

  it("does nothing when there is no further page and reports a failed load", async () => {
    const runs = store();
    runs.setPage({ jobs: [summary("a")], nextCursor: null });
    await runs.loadMore();
    expect(harness.getAgentJobsAction).not.toHaveBeenCalled();

    harness.getAgentJobsAction.mockResolvedValue({ ok: false, failure: { kind: "unavailable", issues: [] } });
    runs.setPage({ jobs: [summary("a")], nextCursor: "cursor-1" });
    await runs.loadMore();
    expect(runs.items.map((job) => job.id)).toEqual(["a"]);
    expect(harness.toastError).toHaveBeenCalledWith("AgentJobs.loadFailed", expect.anything());
    expect(runs.loadingMore).toBe(false);
  });

  it("opens a run, loads its transcript once and closes it again", async () => {
    harness.getAgentJobAction.mockResolvedValue({ ok: true, data: detail("a") });
    const runs = store();
    runs.setPage({ jobs: [summary("a")], nextCursor: null });

    await runs.toggle("a");
    expect(runs.expandedId).toBe("a");
    expect(runs.expanded?.prompt).toBe("Do the thing");
    expect(runs.loadingDetailId).toBeNull();

    await runs.toggle("a");
    expect(runs.expandedId).toBeNull();

    await runs.toggle("a");
    expect(runs.expandedId).toBe("a");
    expect(harness.getAgentJobAction).toHaveBeenCalledTimes(1);
  });

  it("closes a run whose transcript could not be loaded", async () => {
    harness.getAgentJobAction.mockResolvedValue({ ok: false, failure: { kind: "not_found", issues: [] } });
    const runs = store();
    runs.setPage({ jobs: [summary("a")], nextCursor: null });

    await runs.toggle("a");

    expect(runs.expandedId).toBeNull();
    expect(runs.expanded).toBeNull();
    expect(harness.toastError).toHaveBeenCalledWith("AgentJobs.loadFailed", expect.anything());
  });

  it("does not let a late answer for one run close the run opened after it or stop its spinner", async () => {
    const answers = new Map<string, (result: unknown) => void>();
    harness.getAgentJobAction.mockImplementation(
      ({ id }: { id: string }) => new Promise((resolve) => answers.set(id, resolve)),
    );
    const runs = store();
    runs.setPage({ jobs: [summary("a"), summary("b")], nextCursor: null });

    const first = runs.toggle("a");
    const second = runs.toggle("b");
    expect(runs.expandedId).toBe("b");
    expect(runs.loadingDetailId).toBe("b");

    answers.get("a")?.({ ok: false, failure: { kind: "not_found", issues: [] } });
    await first;
    expect(runs.expandedId).toBe("b");
    expect(runs.loadingDetailId).toBe("b");

    answers.get("b")?.({ ok: true, data: detail("b") });
    await second;
    expect(runs.expanded?.id).toBe("b");
    expect(runs.loadingDetailId).toBeNull();
  });

  it("drops a transcript that arrives after a new page was set", async () => {
    let answer: (result: unknown) => void = () => undefined;
    harness.getAgentJobAction.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const runs = store();
    runs.setPage({ jobs: [summary("a")], nextCursor: null });
    const opening = runs.toggle("a");

    runs.setPage({ jobs: [summary("a")], nextCursor: null }, { sourceKind: "automation", sourceId: "run-2" });
    answer({ ok: false, failure: { kind: "not_found", issues: [] } });
    await opening;

    expect(runs.loadingDetailId).toBeNull();
    expect(runs.details.size).toBe(0);
    expect(harness.toastError).not.toHaveBeenCalled();
  });

  it("forgets opened transcripts when a new page is set", async () => {
    harness.getAgentJobAction.mockResolvedValue({ ok: true, data: detail("a") });
    const runs = store();
    runs.setPage({ jobs: [summary("a")], nextCursor: null });
    await runs.toggle("a");

    runs.setPage({ jobs: [summary("a")], nextCursor: null });

    expect(runs.expandedId).toBeNull();
    expect(runs.expanded).toBeNull();
  });
});
