import type { TrashItem } from "../trash.repo";
import type { TrashKindHandler } from "../trash-kind-handler";

import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());

vi.mock("@/core/observability/server", () => ({ captureException }));
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: (fn: () => Promise<unknown>) => fn(),
  runInSavepoint: async (fn: () => Promise<unknown>) => {
    try {
      return { ok: true, value: await fn() };
    } catch (error) {
      return { ok: false, error };
    }
  },
}));

import { unwindFailure } from "@/core/validation/failure-unwind";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { purgeTrashItems } from "../purge-trash-items";

const item = { id: "item-1", kind: "list", targetId: "list-1" } as TrashItem;
const scope = { companyId: "company-1", actorId: null };
const blockedPurge = (reasons: string, blockedBy: string) =>
  unwindFailure(CustomErrorCode.recordConfigurationInvalid, "validation", [], { reasons, blockedBy });

function setup(error: unknown) {
  const trash = { find: vi.fn().mockResolvedValue([item]) };
  const handler = {
    kinds: ["list"],
    restoreOrder: 0,
    purge: vi.fn().mockRejectedValue(error),
  } as unknown as TrashKindHandler;
  return { trash, handler };
}

describe("reporting a Trash item that could not be purged", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports an item that waits for another item in Trash as a warning that names the reason", async () => {
    const waiting = blockedPurge("calculation", "trash");
    const { trash, handler } = setup(waiting);

    expect(await purgeTrashItems(trash, [handler], [item], scope)).toEqual({
      deletedItemIds: [],
      pendingItemIds: [],
      failedItemIds: ["item-1"],
    });
    expect(captureException).toHaveBeenCalledExactlyOnceWith(
      waiting,
      expect.objectContaining({
        level: "warning",
        tags: { kind: "trash-purge", companyId: "company-1", itemKind: "list", reasons: "calculation" },
      }),
    );
  });

  it("keeps an item blocked by something outside Trash an error and names every reason", async () => {
    const blocked = blockedPurge("widget_incompatible,webhook", "model");
    const { trash, handler } = setup(blocked);

    await purgeTrashItems(trash, [handler], [item], scope);

    const context = captureException.mock.calls[0][1];
    expect(context).not.toHaveProperty("level");
    expect(context.tags).toEqual({
      kind: "trash-purge",
      companyId: "company-1",
      itemKind: "list",
      reasons: "widget_incompatible,webhook",
    });
  });

  it("reports any other failure as an error without a reason", async () => {
    const failure = new Error("connection lost");
    const { trash, handler } = setup(failure);

    await purgeTrashItems(trash, [handler], [item], scope);

    const context = captureException.mock.calls[0][1];
    expect(context).not.toHaveProperty("level");
    expect(context.tags).toEqual({ kind: "trash-purge", companyId: "company-1", itemKind: "list" });
  });
});
