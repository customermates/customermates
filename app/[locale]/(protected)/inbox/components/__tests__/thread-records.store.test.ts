import { describe, expect, it, beforeEach, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import { recordSearchHit } from "@/tests/helpers/record-search";

const actions = vi.hoisted(() => ({
  readThreadRecordsAction: vi.fn(),
  mutateThreadRecordsAction: vi.fn(),
  globalSearchAction: vi.fn(),
}));
vi.mock("../../actions", () => actions);
vi.mock("../../../search/actions", () => actions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { ThreadRecordsStore } from "../thread-records.store";

const ref = {
  typeId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000002",
};
const detail = {
  records: [
    {
      ...recordSearchHit(ref.typeId, ref.recordId, "Private project"),
      canUnlink: true,
    },
  ],
  schemaRevision: 3,
  canManage: true,
};
async function fixture() {
  const root = {
    userStore: { user: { id: "actor" } },
    recordWorkspaceStore: { invalidate: vi.fn() },
  };
  actions.readThreadRecordsAction.mockResolvedValue({ ok: true, data: detail });
  const store = new ThreadRecordsStore(root as unknown as RootStore);
  store.bind("thread");
  await vi.waitFor(() => expect(store.detail).toEqual(detail));
  return { store, root };
}

describe("conversation-record store refresh and recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears stale record references when a refresh denies access", async () => {
    const { store } = await fixture();
    actions.readThreadRecordsAction.mockResolvedValue({
      ok: false,
      error: { errors: ["permissionDenied"] },
    });
    await store.reload();
    expect(store.detail).toBeNull();
    expect(store.error).toBe(true);
    store.dispose();
  });

  it("retries a lost mutation response with its original revision and idempotency key", async () => {
    const { store, root } = await fixture();
    actions.mutateThreadRecordsAction.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({
      ok: true,
      data: { ref, linked: true, schemaRevision: 3 },
    });
    await store.mutate("link", ref);
    expect(store.error).toBe(true);
    store.detail = { ...detail, schemaRevision: 4 };
    await store.mutate("link", ref);
    expect(actions.mutateThreadRecordsAction.mock.calls[0]).toEqual(actions.mutateThreadRecordsAction.mock.calls[1]);
    expect(actions.mutateThreadRecordsAction.mock.calls[1][0].expectedRevision).toBe(3);
    expect(root.recordWorkspaceStore.invalidate).toHaveBeenCalledOnce();
    store.dispose();
  });

  it("does not hydrate a departed thread from an older delayed response", async () => {
    const { store } = await fixture();
    let complete!: (value: unknown) => void;
    actions.readThreadRecordsAction.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const pending = store.reload();
    actions.readThreadRecordsAction.mockResolvedValue({
      ok: true,
      data: { ...detail, records: [] },
    });
    store.bind("other-thread");
    await vi.waitFor(() => expect(store.detail?.records).toEqual([]));
    complete({ ok: true, data: detail });
    await pending;
    expect(store.detail?.records).toEqual([]);
    store.dispose();
  });

  it("offers only editable unlinked records when searching for conversation context", async () => {
    const { store } = await fixture();
    const editable = {
      ...recordSearchHit(ref.typeId, "editable", "Editable project"),
      canEdit: true,
    };
    actions.globalSearchAction.mockResolvedValue({
      ok: true,
      data: {
        results: [
          editable,
          {
            ...recordSearchHit(ref.typeId, "readonly", "Read-only project"),
            canEdit: false,
          },
          {
            ...recordSearchHit(ref.typeId, "protected", "Protected task"),
            canEdit: false,
          },
          { ...detail.records[0], canEdit: true },
        ],
      },
    });
    store.setSearching(true);
    store.setQuery("project");
    await vi.waitFor(() => expect(store.results).toEqual([editable]));
    store.dispose();
  });
});

describe("conversation search recovery ownership", () => {
  beforeEach(() => vi.clearAllMocks());
  it("retries the active query rather than reloading the conversation's existing links", async () => {
    const { store } = await fixture();
    const editable = {
      ...recordSearchHit(ref.typeId, "editable", "Editable project"),
      canEdit: true,
    };
    actions.globalSearchAction
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({ ok: true, data: { results: [editable] } });
    store.setSearching(true);
    store.setQuery("project");
    await vi.waitFor(() => expect(store.searchError).toBe(true));
    expect(store.error).toBe(false);
    await store.retryCurrent();
    expect(store.query).toBe("project");
    expect(store.searching).toBe(true);
    expect(store.results).toEqual([editable]);
    expect(store.searchLoading).toBe(false);
    expect(store.searchError).toBe(false);
    expect(actions.globalSearchAction).toHaveBeenCalledTimes(2);
    expect(actions.globalSearchAction.mock.calls[1][0].searchTerm).toBe("project");
    expect(actions.readThreadRecordsAction).toHaveBeenCalledTimes(1);
    store.dispose();
  });
  it("clears search loading on Back and ignores the abandoned response", async () => {
    const { store } = await fixture();
    const response = Promise.withResolvers<{
      ok: true;
      data: { results: unknown[] };
    }>();
    actions.globalSearchAction.mockReturnValueOnce(response.promise);
    store.setSearching(true);
    store.setQuery("project");
    await vi.waitFor(() => expect(actions.globalSearchAction).toHaveBeenCalledOnce());
    store.setSearching(false);
    expect(store.searchLoading).toBe(false);
    expect(store.query).toBe("");
    response.resolve({
      ok: true,
      data: { results: [recordSearchHit(ref.typeId, "old", "Old result")] },
    });
    await response.promise;
    await Promise.resolve();
    expect(store.results).toEqual([]);
    expect(store.searchLoading).toBe(false);
    expect(store.searchError).toBe(false);
    store.dispose();
  });

  it("keeps a running conversation reload's loading state when search mode toggles", async () => {
    const { store } = await fixture();
    const read = Promise.withResolvers<unknown>();
    actions.readThreadRecordsAction.mockReturnValueOnce(read.promise);
    const reload = store.reload();
    store.setSearching(true);
    store.setSearching(false);
    expect(store.loading).toBe(true);
    read.resolve({ ok: true, data: detail });
    await reload;
    expect(store.loading).toBe(false);
    store.dispose();
  });
});

describe("conversation record reload failures", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps the last linked records visible when a reload cannot reach the server", async () => {
    const { store } = await fixture();
    actions.readThreadRecordsAction.mockRejectedValueOnce(new Error("Offline"));
    await store.reload();
    expect(store.detail).toEqual(detail);
    expect(store.error).toBe(true);
    actions.readThreadRecordsAction.mockResolvedValueOnce({ ok: true, data: detail });
    await store.reload();
    expect(store.error).toBe(false);
    store.dispose();
  });

  it("does not report a search failure as a conversation failure", async () => {
    const { store } = await fixture();
    actions.globalSearchAction.mockRejectedValueOnce(new Error("Unavailable"));
    store.setSearching(true);
    store.setQuery("project");
    await vi.waitFor(() => expect(store.searchError).toBe(true));
    expect(store.error).toBe(false);
    expect(store.detail).toEqual(detail);
    store.dispose();
  });
});
