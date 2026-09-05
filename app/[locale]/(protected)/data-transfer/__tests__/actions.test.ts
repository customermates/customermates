import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";
import { createZodError } from "@/core/validation/validation.utils";

const mocks = vi.hoisted(() => ({ commit: vi.fn(), dryRun: vi.fn(), relationIndex: vi.fn() }));
vi.mock("@/core/di", () => ({
  getCommitImportChunkInteractor: () => ({ invoke: mocks.commit }),
  getDryRunImportChunkInteractor: () => ({ invoke: mocks.dryRun }),
  getGetImportRelationIndexInteractor: () => ({ invoke: mocks.relationIndex }),
}));
import { commitImportChunkAction, dryRunImportChunkAction, getImportRelationIndexAction } from "../actions";

describe("data transfer server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards commit input and serializes record ids", async () => {
    const input = { entityType: EntityType.deal, mode: "create" as const, rows: [{ name: "Renewal" }] };
    mocks.commit.mockResolvedValue({ ok: true, data: [{ id: "deal-1" }] });
    await expect(commitImportChunkAction(input)).resolves.toEqual({ ok: true, ids: ["deal-1"] });
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("forwards update mode unchanged", async () => {
    const input = {
      entityType: EntityType.contact,
      mode: "update" as const,
      rows: [{ id: "contact-1", firstName: "Ada" }],
    };
    mocks.commit.mockResolvedValue({ ok: true, data: [{ id: "contact-1" }] });
    await expect(commitImportChunkAction(input)).resolves.toEqual({ ok: true, ids: ["contact-1"] });
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("forwards a dry run and reports no created ids", async () => {
    const input = { entityType: EntityType.task, mode: "update" as const, rows: [{ name: "Call" }] };
    mocks.dryRun.mockResolvedValue({ ok: true, data: null });
    await expect(dryRunImportChunkAction(input)).resolves.toEqual({ ok: true, ids: [] });
    expect(mocks.dryRun).toHaveBeenCalledExactlyOnceWith(input);
  });

  it.each(["commit", "dryRun"] as const)("serializes %s validation failures without throwing", async (operation) => {
    const error = createZodError("Invalid entity", ["entityType"]);
    mocks[operation].mockResolvedValue({ ok: false, error });
    const action = operation === "commit" ? commitImportChunkAction : dryRunImportChunkAction;
    await expect(action({ entityType: "companies" as EntityType, mode: "create", rows: [{}] })).resolves.toMatchObject({
      ok: false,
      failure: { kind: "validation", issues: [{ path: ["entityType"], message: "Invalid entity" }] },
    });
  });

  it("forwards relation-index requests unchanged", async () => {
    const input = { entityTypes: [EntityType.contact], includeUsers: true };
    const data = { index: {}, truncated: [] };
    mocks.relationIndex.mockResolvedValue({ ok: true, data });
    await expect(getImportRelationIndexAction(input)).resolves.toEqual({ ok: true, data });
    expect(mocks.relationIndex).toHaveBeenCalledExactlyOnceWith(input);
  });
});
