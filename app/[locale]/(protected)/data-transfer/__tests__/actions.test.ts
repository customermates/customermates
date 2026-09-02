import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

const di = vi.hoisted(() => ({
  getCreateManyContactsInteractor: vi.fn(),
  getCreateManyDealsInteractor: vi.fn(),
  getCreateManyOrganizationsInteractor: vi.fn(),
  getCreateManyServicesInteractor: vi.fn(),
  getCreateManyTasksInteractor: vi.fn(),
  getDryRunImportContactsInteractor: vi.fn(),
  getDryRunImportDealsInteractor: vi.fn(),
  getDryRunImportOrganizationsInteractor: vi.fn(),
  getDryRunImportServicesInteractor: vi.fn(),
  getDryRunImportTasksInteractor: vi.fn(),
  getGetImportRelationIndexInteractor: vi.fn(),
  getUpdateManyContactsInteractor: vi.fn(),
  getUpdateManyDealsInteractor: vi.fn(),
  getUpdateManyOrganizationsInteractor: vi.fn(),
  getUpdateManyServicesInteractor: vi.fn(),
  getUpdateManyTasksInteractor: vi.fn(),
}));

vi.mock("@/core/di", () => di);

import { commitImportChunkAction, dryRunImportChunkAction } from "../actions";

function useInteractor(getter: ReturnType<typeof vi.fn>, result: unknown) {
  const invoke = vi.fn().mockResolvedValue(result);
  getter.mockReturnValue({ invoke });
  return invoke;
}

describe("data transfer server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an entity type outside the enum instead of dereferencing undefined", async () => {
    const rows = [{ firstName: "Ada" }];

    await expect(
      commitImportChunkAction({ entityType: "companies" as EntityType, mode: "create", rows }),
    ).rejects.toThrow("Unknown entity type");

    await expect(
      dryRunImportChunkAction({ entityType: "companies" as EntityType, mode: "create", rows }),
    ).rejects.toThrow("Unknown entity type");
  });

  it("sends rows under the collection key the write interactor expects", async () => {
    const invoke = useInteractor(di.getCreateManyDealsInteractor, { ok: true, data: [{ id: "deal-1" }] });
    const rows = [{ name: "Renewal" }];

    await expect(commitImportChunkAction({ entityType: EntityType.deal, mode: "create", rows })).resolves.toEqual({
      ok: true,
      ids: ["deal-1"],
    });
    expect(invoke).toHaveBeenCalledWith({ deals: rows });
  });

  it("routes update mode to the update interactor", async () => {
    const create = useInteractor(di.getCreateManyContactsInteractor, { ok: true, data: [] });
    const update = useInteractor(di.getUpdateManyContactsInteractor, { ok: true, data: [{ id: "contact-1" }] });
    const rows = [{ id: "contact-1", firstName: "Ada" }];

    await expect(commitImportChunkAction({ entityType: EntityType.contact, mode: "update", rows })).resolves.toEqual({
      ok: true,
      ids: ["contact-1"],
    });
    expect(update).toHaveBeenCalledWith({ contacts: rows });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports a dry run success as no created ids", async () => {
    useInteractor(di.getDryRunImportTasksInteractor, { ok: true, data: null });

    await expect(
      dryRunImportChunkAction({ entityType: EntityType.task, mode: "create", rows: [{ name: "Call" }] }),
    ).resolves.toEqual({ ok: true, ids: [] });
  });
});
