import type { RootStore } from "@/core/stores/root.store";
import type { WikiPageProposalReviewItem } from "@/features/wiki/wiki-page-proposal.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  report: vi.fn(),
}));

vi.mock("../../actions", () => ({
  getWikiPageProposalsAction: harness.list,
  approveWikiPageProposalAction: harness.approve,
  rejectWikiPageProposalAction: harness.reject,
}));
vi.mock("sonner", () => ({ toast: { success: harness.toastSuccess, error: harness.toastError } }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: harness.report }));

import { WikiProposalsStore } from "../wiki-proposals.store";

const PAGE_ID = "10000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-10-08T09:00:00.000Z");

function proposal(id: string, overrides: Partial<WikiPageProposalReviewItem> = {}): WikiPageProposalReviewItem {
  return {
    id,
    action: "update",
    status: "pending",
    pageId: PAGE_ID,
    title: null,
    markdown: "Refund within 30 days.",
    kind: null,
    whenToUse: null,
    baseUpdatedAt: createdAt,
    routineId: "20000000-0000-4000-8000-000000000001",
    routineName: "Weekly FAQ refresh",
    routineRunId: "30000000-0000-4000-8000-000000000001",
    conversationId: "40000000-0000-4000-8000-000000000001",
    reviewedAt: null,
    createdAt,
    updatedAt: createdAt,
    currentPage: {
      id: PAGE_ID,
      title: "Refunds",
      markdown: "Refund within 14 days.",
      kind: "knowledge",
      whenToUse: null,
      createdAt,
      updatedAt: createdAt,
    },
    stale: false,
    ...overrides,
  };
}

const first = proposal("50000000-0000-4000-8000-000000000001");
const second = proposal("50000000-0000-4000-8000-000000000002", { action: "delete", markdown: null });

const rootStore = {
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;

async function loaded(onApplied = vi.fn()) {
  const store = new WikiProposalsStore(rootStore, onApplied);
  store.bind();
  await vi.waitFor(() => expect(store.requestState).toBe("idle"));
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.list.mockResolvedValue({ ok: true, data: { items: [first, second], total: 2 } });
  harness.approve.mockResolvedValue({ ok: true, data: { ...first, status: "approved" } });
  harness.reject.mockResolvedValue({ ok: true, data: { ...second, status: "rejected" } });
});

describe("Knowledge Base proposal review", () => {
  it("loads pending proposals with their count once bound", async () => {
    const store = await loaded();

    expect(store.total).toBe(2);
    expect(store.items.map(({ id }) => id)).toEqual([first.id, second.id]);
    expect(harness.list).toHaveBeenCalledOnce();
  });

  it("approves a proposal, refreshes the Knowledge Base and drops it from the queue", async () => {
    const onApplied = vi.fn();
    const store = await loaded(onApplied);
    store.setOpen(true);
    store.select(first.id);
    harness.list.mockResolvedValue({ ok: true, data: { items: [second], total: 1 } });

    expect(await store.approve(first.id)).toBe(true);

    expect(harness.approve).toHaveBeenCalledExactlyOnceWith({ id: first.id });
    expect(store.items.map(({ id }) => id)).toEqual([second.id]);
    expect(store.total).toBe(1);
    expect(store.selected).toBeNull();
    expect(onApplied).toHaveBeenCalledOnce();
    expect(harness.toastSuccess).toHaveBeenCalledWith("Wiki.proposals.approved", expect.anything());
    expect(store.reviewingId).toBeNull();
  });

  it("rejects without refreshing pages", async () => {
    const onApplied = vi.fn();
    const store = await loaded(onApplied);

    expect(await store.reject(second.id)).toBe(true);

    expect(harness.reject).toHaveBeenCalledExactlyOnceWith({ id: second.id });
    expect(store.items.map(({ id }) => id)).toEqual([first.id]);
    expect(onApplied).not.toHaveBeenCalled();
    expect(harness.toastSuccess).toHaveBeenCalledWith("Wiki.proposals.rejected", expect.anything());
  });

  it("shows why a stale approval failed and reloads the queue so the proposal is marked stale", async () => {
    const store = await loaded();
    harness.approve.mockResolvedValue({
      ok: false,
      failure: {
        kind: "conflict",
        issues: [{ code: "custom", path: ["id"], message: "The page changed.", customCode: "wikiProposalStale" }],
      },
    });
    harness.list.mockResolvedValue({ ok: true, data: { items: [{ ...first, stale: true }, second], total: 2 } });

    expect(await store.approve(first.id)).toBe(false);

    expect(harness.toastError).toHaveBeenCalledWith("The page changed.");
    expect(store.items[0]).toMatchObject({ id: first.id, stale: true });
    expect(store.total).toBe(2);
  });

  it("ignores a second decision while one is in flight", async () => {
    const store = await loaded();
    let release: (value: unknown) => void = () => {};
    harness.approve.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const pending = store.approve(first.id);
    expect(await store.reject(second.id)).toBe(false);
    release({ ok: true, data: { ...first, status: "approved" } });
    await pending;

    expect(harness.reject).not.toHaveBeenCalled();
  });

  it("marks the queue as failed when loading breaks", async () => {
    harness.list.mockResolvedValue({ ok: false, error: {} });
    const store = new WikiProposalsStore(rootStore);
    store.bind();

    await vi.waitFor(() => expect(store.requestState).toBe("failed"));
    expect(store.items).toEqual([]);
  });
});
