import { observable } from "mobx";
import type { RootStore } from "@/core/stores/root.store";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getIdentityRecordChoicesAction: vi.fn(),
  getRecordAction: vi.fn(),
  mutateRecordAction: vi.fn(),
}));
vi.mock("../../actions", () => actions);
vi.mock("../../../records/actions", () => actions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { ThreadParticipantsStore } from "../thread-participants.store";

const ref = { typeId: "10000000-0000-4000-8000-000000000001", recordId: "10000000-0000-4000-8000-000000000002" };
const person = { ref, title: "Ada", avatarUrl: null, canEdit: true, identityId: "email" };
const createType = { typeId: ref.typeId, label: "Person", nameFieldIds: ["first", "last"] };
function makeStore() {
  const root = {
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "actor", companyId: "workspace" } },
    recordWorkspaceStore: { invalidate: vi.fn().mockResolvedValue(undefined) },
    messagingThreadDetailStore: {
      refresh: vi.fn().mockResolvedValue(undefined),
      thread: {
        id: "thread",
        provider: "mail",
        participants: [{ identifier: "ada@example.test", displayName: "Ada", records: [person] }],
      },
    },
  };
  return { store: new ThreadParticipantsStore(root as unknown as RootStore), root };
}
beforeEach(() => vi.resetAllMocks());

describe("inbox identity controls", () => {
  it("clears loading and retries without offering creation after a failed search", async () => {
    actions.getIdentityRecordChoicesAction.mockRejectedValueOnce(new Error("offline"));
    const { store } = makeStore();
    store.activeIdentifier = "ada@example.test";
    store.query = "Ada";
    await store.retrySearch();
    expect(store.isLoading).toBe(false);
    expect(store.searchError).toBe(true);
    expect(store.showCreate).toBe(false);
    actions.getIdentityRecordChoicesAction.mockResolvedValueOnce({
      records: [],
      createTypes: [createType],
      schemaRevision: 3,
    });
    await store.retrySearch();
    expect(store.isLoading).toBe(false);
    expect(store.searchError).toBe(false);
    expect(store.showCreate).toBe(true);
  });

  it("retries a lost response with the same validated mutation and idempotency key", async () => {
    const { store, root } = makeStore();
    store.activeIdentifier = "ada@example.test";
    actions.getRecordAction.mockResolvedValue({
      ok: true,
      data: { ref, schemaRevision: 3, version: 7, identities: [] },
    });
    actions.mutateRecordAction
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ ok: true, data: { status: "completed", refs: [ref], schemaRevision: 3 } });
    await store.link("ada@example.test", observable(ref));
    expect(store.activeIdentifier).toBe("ada@example.test");
    await store.link("ada@example.test", observable(ref));
    expect(actions.getRecordAction).toHaveBeenCalledTimes(1);
    expect(Object.getOwnPropertySymbols(actions.mutateRecordAction.mock.calls[0][0].mutation.ref)).toEqual([]);
    expect(actions.mutateRecordAction.mock.calls[0]).toEqual(actions.mutateRecordAction.mock.calls[1]);
    expect(actions.mutateRecordAction.mock.calls[0][0]).toMatchObject({
      expectedRevision: 3,
      mutation: {
        action: "update",
        ref,
        expectedVersion: 7,
        identities: [{ provider: "mail", value: "ada@example.test" }],
      },
    });
    expect(root.messagingThreadDetailStore.refresh).toHaveBeenCalledTimes(1);
  });

  it("removes only the requested channel and preserves other identity inputs", async () => {
    const { store } = makeStore();
    actions.getRecordAction.mockResolvedValue({
      ok: true,
      data: {
        schemaRevision: 2,
        version: 8,
        identities: [
          { id: "email", provider: "google", value: "ada@example.test" },
          { id: "social", provider: "linkedin", value: "ada", messagingId: "opaque" },
        ],
      },
    });
    actions.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "completed", refs: [ref], schemaRevision: 2 },
    });
    await store.unlink("ada@example.test", ref);
    expect(actions.mutateRecordAction.mock.calls[0][0].mutation.identities).toEqual([
      { provider: "linkedin", value: "ada", messagingId: "opaque", displayName: undefined, profileUrl: undefined },
    ]);
  });

  it("unlinks a retained alias by canonical identity ID after the identifier changes", async () => {
    const { store } = makeStore();
    actions.getRecordAction.mockResolvedValue({
      ok: true,
      data: {
        schemaRevision: 2,
        version: 9,
        identities: [
          { id: "email", provider: "google", value: "new-ada@example.test" },
          { id: "other", provider: "mail", value: "team@example.test" },
        ],
      },
    });
    actions.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "completed", refs: [ref], schemaRevision: 2 },
    });
    await store.unlink("ada@example.test", ref);
    expect(actions.mutateRecordAction.mock.calls[0][0].mutation.identities).toEqual([
      {
        provider: "mail",
        value: "team@example.test",
        messagingId: undefined,
        displayName: undefined,
        profileUrl: undefined,
      },
    ]);
  });

  it("does not claim a queued change has already reached the inbox", async () => {
    const { store, root } = makeStore();
    store.createTypes = [createType];
    store.schemaRevision = 4;
    actions.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "pending", operationId: "operation", schemaRevision: 4 },
    });
    await store.createAndAssign("ada@example.test", "Ada Lovelace");
    expect(store.pendingOperationId).toBe("operation");
    expect(root.messagingThreadDetailStore.refresh).not.toHaveBeenCalled();
    expect(actions.mutateRecordAction.mock.calls[0][0].mutation).toMatchObject({
      action: "create",
      typeId: ref.typeId,
      assignedUserIds: ["actor"],
      fields: [
        { fieldId: "first", value: { kind: "text", value: "Ada" } },
        { fieldId: "last", value: { kind: "text", value: "Lovelace" } },
      ],
    });
    await store.operationCompleted();
    expect(root.messagingThreadDetailStore.refresh).toHaveBeenCalledTimes(1);
    expect(store.pendingOperationId).toBeNull();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("participant mutation ownership", () => {
  beforeEach(() => {
    actions.getIdentityRecordChoicesAction.mockResolvedValue({
      canManage: true,
      records: [],
      createTypes: [],
      schemaRevision: 3,
    });
    actions.getRecordAction.mockResolvedValue({
      ok: true,
      data: { ref, schemaRevision: 3, version: 7, identities: [] },
    });
  });

  it("invalidates an accepted earlier write without clearing another thread's search", async () => {
    const { store, root } = makeStore();
    const wait = deferred<{ ok: true; data: { status: "completed"; refs: (typeof ref)[]; schemaRevision: number } }>();
    actions.mutateRecordAction.mockReturnValueOnce(wait.promise);
    const mutation = store.link("ada@example.test", ref);
    await vi.waitFor(() => expect(actions.mutateRecordAction).toHaveBeenCalledOnce());
    store.bind("another-thread");
    store.activeIdentifier = "other@example.test";
    store.query = "Another search";
    wait.resolve({ ok: true, data: { status: "completed", refs: [ref], schemaRevision: 3 } });
    await mutation;
    expect(store.activeIdentifier).toBe("other@example.test");
    expect(store.query).toBe("Another search");
    expect(store.pending).toBe(false);
    expect(root.recordWorkspaceStore.invalidate).toHaveBeenCalledOnce();
    expect(root.messagingThreadDetailStore.refresh).not.toHaveBeenCalled();
  });

  it("does not attach an old pending operation to a newly bound thread", async () => {
    const { store } = makeStore();
    const wait = deferred<{ ok: true; data: { status: "pending"; operationId: string; schemaRevision: number } }>();
    actions.mutateRecordAction.mockReturnValueOnce(wait.promise);
    const mutation = store.link("ada@example.test", ref);
    await vi.waitFor(() => expect(actions.mutateRecordAction).toHaveBeenCalledOnce());
    store.bind("another-thread");
    wait.resolve({ ok: true, data: { status: "pending", operationId: "old-operation", schemaRevision: 3 } });
    await mutation;
    expect(store.pendingOperationId).toBeNull();
    expect(store.pending).toBe(false);
  });

  it("does not dispatch preparation that completes after the thread changes", async () => {
    const { store } = makeStore();
    const wait = deferred<{
      ok: true;
      data: { ref: typeof ref; schemaRevision: number; version: number; identities: [] };
    }>();
    actions.getRecordAction.mockReturnValueOnce(wait.promise);
    const mutation = store.link("ada@example.test", ref);
    store.bind("another-thread");
    wait.resolve({ ok: true, data: { ref, schemaRevision: 3, version: 7, identities: [] } });
    await mutation;
    expect(actions.mutateRecordAction).not.toHaveBeenCalled();
    expect(store.pending).toBe(false);
  });

  it("does not clear a new pending request when the earlier request settles", async () => {
    const { store } = makeStore();
    const first = deferred<{ ok: true; data: { status: "completed"; refs: (typeof ref)[]; schemaRevision: number } }>();
    const second = deferred<{
      ok: true;
      data: { status: "completed"; refs: (typeof ref)[]; schemaRevision: number };
    }>();
    actions.mutateRecordAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const oldMutation = store.link("ada@example.test", ref);
    await vi.waitFor(() => expect(actions.mutateRecordAction).toHaveBeenCalledOnce());
    store.bind("another-thread");
    const newMutation = store.link("ada@example.test", ref);
    await vi.waitFor(() => expect(actions.mutateRecordAction).toHaveBeenCalledTimes(2));
    first.resolve({ ok: true, data: { status: "completed", refs: [ref], schemaRevision: 3 } });
    await oldMutation;
    expect(store.pending).toBe(true);
    second.resolve({ ok: true, data: { status: "completed", refs: [ref], schemaRevision: 3 } });
    await newMutation;
    expect(store.pending).toBe(false);
  });
});
