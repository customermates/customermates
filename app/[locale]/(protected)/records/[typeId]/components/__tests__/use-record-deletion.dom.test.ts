import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordDto } from "@/features/records/record-model.schema";

const mocks = vi.hoisted(() => ({
  previewRecordDeletionAction: vi.fn(),
  mutateRecordAction: vi.fn(),
  showConfirmation: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../actions", () => mocks);
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showConfirmation: mocks.showConfirmation }),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
import { useRecordDeletion } from "../use-record-deletion";

const record: RecordDto = {
  ref: { typeId: "10000000-0000-4000-8000-000000000001", recordId: "10000000-0000-4000-8000-000000000002" },
  version: 1,
  schemaRevision: 1,
  createdAt: "2026-10-02T12:00:00.000Z",
  updatedAt: "2026-10-02T12:00:00.000Z",
  fields: [],
  assignedUserIds: [],
  assignedUsers: [],
  memberUsers: [],
  relationships: [],
};
let root: Root;
let container: HTMLElement;
let session = 1;
let canDelete = true;
const onMutating = vi.fn();
const onDeleted = vi.fn();
const onPending = vi.fn();
const onInvalidated = vi.fn();
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Harness({ current }: { current: number }) {
  const deletion = useRecordDeletion({
    canDelete: () => canDelete,
    onMutating,
    sessionKey: current,
    captureSession: () => {
      const captured = session;
      return () => captured === session;
    },
    onDeleted,
    onPending,
    onInvalidated,
  });
  return createElement(
    "button",
    { disabled: deletion.isPreviewing, onClick: () => void deletion.requestDeletion(record, 1, "Earlier record") },
    "Delete",
  );
}
function changeSession() {
  session += 1;
  act(() => root.render(createElement(Harness, { current: session })));
}
async function preview() {
  await act(async () => {
    (container.querySelector("button") as HTMLButtonElement).click();
    await Promise.resolve();
  });
}
function confirm(): Promise<boolean> {
  const latest = mocks.showConfirmation.mock.calls.at(-1);
  if (!latest) throw new Error("No deletion confirmation was created");
  return latest[0].onConfirm();
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  session = 1;
  canDelete = true;
  onDeleted.mockResolvedValue(undefined);
  onInvalidated.mockResolvedValue(undefined);
  mocks.previewRecordDeletionAction.mockResolvedValue({
    ok: true,
    data: {
      removedRecords: [{ label: "Earlier list", count: 1 }],
      removedLinks: 0,
      calculations: [],
      impactHash: "approved-impact",
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness, { current: session })));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("record deletion ownership", () => {
  it("does not present a deletion preview after an owned channel draft becomes dirty", async () => {
    const wait = deferred<unknown>();
    mocks.previewRecordDeletionAction.mockReturnValueOnce(wait.promise);
    await preview();
    canDelete = false;
    await act(async () => {
      wait.resolve({ ok: true, data: { removedRecords: [], removedLinks: 0, calculations: [], impactHash: "old" } });
      await wait.promise;
      await Promise.resolve();
    });
    expect(mocks.showConfirmation).not.toHaveBeenCalled();
    expect((container.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
  });
  it("rechecks current draft ownership before a previously approved deletion dispatches", async () => {
    await preview();
    canDelete = false;
    expect(await confirm()).toBe(false);
    expect(mocks.mutateRecordAction).not.toHaveBeenCalled();
    expect(onMutating).not.toHaveBeenCalled();
  });
  it("holds the editor mutation state until an uncertain deletion request completes", async () => {
    await preview();
    const wait = deferred<unknown>();
    mocks.mutateRecordAction.mockReturnValueOnce(wait.promise);
    const deletion = confirm();
    expect(onMutating).toHaveBeenLastCalledWith(true);
    wait.resolve({ ok: false, error: {} });
    expect(await deletion).toBe(false);
    expect(onMutating.mock.calls.map(([value]) => value)).toEqual([true, false]);
    expect(onDeleted).not.toHaveBeenCalled();
  });
  it("does not present a deletion preview that belongs to an earlier editor", async () => {
    const wait = deferred<unknown>();
    mocks.previewRecordDeletionAction.mockReturnValueOnce(wait.promise);
    await preview();
    changeSession();
    await act(async () => {
      wait.resolve({ ok: true, data: { removedRecords: [], removedLinks: 0, calculations: [], impactHash: "old" } });
      await wait.promise;
      await Promise.resolve();
    });
    expect(mocks.showConfirmation).not.toHaveBeenCalled();
    expect((container.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
  });
  it("does not dispatch an old confirmation after another record becomes current", async () => {
    await preview();
    changeSession();
    expect(await confirm()).toBe(false);
    expect(mocks.mutateRecordAction).not.toHaveBeenCalled();
  });
  it("invalidates an accepted earlier deletion without closing the current record", async () => {
    await preview();
    const wait = deferred<unknown>();
    mocks.mutateRecordAction.mockReturnValueOnce(wait.promise);
    const deletion = confirm();
    changeSession();
    wait.resolve({ ok: true, data: { status: "completed", refs: [record.ref], schemaRevision: 1 } });
    expect(await deletion).toBe(true);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onPending).not.toHaveBeenCalled();
    expect(onInvalidated).toHaveBeenCalledOnce();
  });
  it("does not attach a pending deletion to a new editor session", async () => {
    await preview();
    const wait = deferred<unknown>();
    mocks.mutateRecordAction.mockReturnValueOnce(wait.promise);
    const deletion = confirm();
    changeSession();
    wait.resolve({ ok: true, data: { status: "pending", operationId: "old-operation", schemaRevision: 1 } });
    expect(await deletion).toBe(true);
    expect(onPending).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
