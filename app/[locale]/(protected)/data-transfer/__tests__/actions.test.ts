import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({ commit: vi.fn(), dryRun: vi.fn(), relationIndex: vi.fn() }));
vi.mock("@/core/di", () => ({
  getCommitImportChunkInteractor: () => ({ invoke: mocks.commit }),
  getDryRunImportChunkInteractor: () => ({ invoke: mocks.dryRun }),
  getGetImportRelationIndexInteractor: () => ({ invoke: mocks.relationIndex }),
}));
import { commitImportChunkAction, dryRunImportChunkAction, getImportRelationIndexAction } from "../actions";

describe("data transfer server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["commit", "dryRun"] as const)(
    "rejects retired %s writes before calling a legacy interactor",
    async (operation) => {
      const action = operation === "commit" ? commitImportChunkAction : dryRunImportChunkAction;
      await expect(
        action({ entityType: EntityType.deal, mode: "create", rows: [{ name: "Renewal" }] }),
      ).rejects.toThrow(/retired/);
      expect(mocks[operation]).not.toHaveBeenCalled();
    },
  );

  it("forwards relation-index requests unchanged", async () => {
    const input = { entityTypes: [EntityType.contact], includeUsers: true };
    const data = { index: {}, truncated: [] };
    mocks.relationIndex.mockResolvedValue({ ok: true, data });
    await expect(getImportRelationIndexAction(input)).resolves.toEqual({ ok: true, data });
    expect(mocks.relationIndex).toHaveBeenCalledExactlyOnceWith(input);
  });
});
