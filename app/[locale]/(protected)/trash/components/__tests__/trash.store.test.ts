import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const trashActions = vi.hoisted(() => ({
  deleteTrashPermanentlyAction: vi.fn(),
  emptyTrashAction: vi.fn(),
  getTrashAction: vi.fn(),
  previewTrashDeletionAction: vi.fn(),
  restoreTrashAction: vi.fn(),
}));

vi.mock("../../actions", () => trashActions);

const sonner = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("sonner", () => sonner);

import { TrashStore } from "../trash.store";

const BATCH_ID = "40000000-0000-4000-8000-000000000001";
const ITEM_ID = "40000000-0000-4000-8000-000000000002";

function makeStore({ isSystemRole = true } = {}) {
  const invalidate = vi.fn(() => Promise.resolve());
  const deleteConfirmation = { onInitOrRefresh: vi.fn(), open: vi.fn() };
  const store = new TrashStore({
    localeStore: {
      getTranslation: (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
    },
    userStore: { user: { role: { isSystemRole } } },
    recordWorkspaceStore: { invalidate },
    deleteConfirmationModalStore: deleteConfirmation,
  } as unknown as RootStore);
  return { store, invalidate, deleteConfirmation };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrashStore", () => {
  it("offers Empty trash only to admins and only while something is in Trash", () => {
    const admin = makeStore().store;
    expect(admin.canEmpty).toBe(false);
    admin.pagination = { page: 1, pageSize: 25, total: 2, totalPages: 1 };
    expect(admin.canEmpty).toBe(true);
    const member = makeStore({ isSystemRole: false }).store;
    member.pagination = { page: 1, pageSize: 25, total: 2, totalPages: 1 };
    expect(member.canEmpty).toBe(false);
  });

  it("restores the batch behind Undo and tells the deleting surface", async () => {
    const { store, invalidate } = makeStore();
    trashActions.restoreTrashAction.mockResolvedValue({
      ok: true,
      data: { status: "completed", restoredItemIds: [ITEM_ID], blocked: [], restoredRecords: 1, droppedLinks: 0 },
    });
    const onRestored = vi.fn();
    store.announceMovedToTrash({ trashBatchId: BATCH_ID }, onRestored);
    const [message, options] = sonner.toast.success.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe("Trash.movedToTrash");
    expect(options.action.label).toBe("Trash.undo");

    options.action.onClick();

    await vi.waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    expect(trashActions.restoreTrashAction).toHaveBeenCalledExactlyOnceWith({ batchId: BATCH_ID });
    expect(invalidate).toHaveBeenCalledOnce();
    expect(sonner.toast.success).toHaveBeenLastCalledWith('Trash.restored:{"count":1}', expect.anything());
  });

  it("says why nothing came back and reports dropped links", async () => {
    const { store } = makeStore();
    trashActions.restoreTrashAction.mockResolvedValueOnce({
      ok: true,
      data: {
        status: "completed",
        restoredItemIds: [],
        blocked: [{ itemId: ITEM_ID, reason: "listDeleted", typeId: null }],
        restoredRecords: 0,
        droppedLinks: 0,
      },
    });
    expect(await store.restoreItems([ITEM_ID])).toBe(false);
    expect(sonner.toast.error).toHaveBeenCalledWith('Trash.restoreBlocked.listDeleted:{"count":1}', expect.anything());

    trashActions.restoreTrashAction.mockResolvedValueOnce({
      ok: true,
      data: { status: "completed", restoredItemIds: [ITEM_ID], blocked: [], restoredRecords: 1, droppedLinks: 2 },
    });
    expect(await store.restoreItems([ITEM_ID])).toBe(true);
    expect(sonner.toast.success).toHaveBeenLastCalledWith(
      'Trash.restoredWithDroppedLinks:{"count":2}',
      expect.anything(),
    );
  });

  it("confirms a permanent delete with the exact impact and sends its hash", async () => {
    const { store, deleteConfirmation } = makeStore();
    trashActions.previewTrashDeletionAction.mockResolvedValue({
      ok: true,
      data: {
        items: [{ itemId: ITEM_ID, kind: "record", label: "Acme" }],
        removedRecords: [{ typeId: BATCH_ID, label: "Services", count: 1 }],
        removedLinks: 3,
        impactHash: "a".repeat(64),
      },
    });
    trashActions.deleteTrashPermanentlyAction.mockResolvedValue({ ok: true, data: { deletedItemIds: [ITEM_ID] } });
    trashActions.getTrashAction.mockResolvedValue({ items: [] });

    await store.requestPermanentDelete([ITEM_ID], "Acme");

    const confirmation = deleteConfirmation.onInitOrRefresh.mock.calls[0][0];
    expect(confirmation.title).toBe('Trash.deletePermanentlyTitle:{"name":"Acme"}');
    expect(confirmation.details).toEqual([
      'Trash.permanentRecords:{"list":"Services","count":1}',
      'RecordModel.deletionLinks:{"count":3}',
      "Trash.permanentIrreversible",
    ]);
    expect(confirmation.confirmationText).toBeUndefined();
    expect(await confirmation.onConfirm()).toBe(true);
    expect(trashActions.deleteTrashPermanentlyAction).toHaveBeenCalledExactlyOnceWith({
      itemIds: [ITEM_ID],
      expectedImpactHash: "a".repeat(64),
    });
  });
});
