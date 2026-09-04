import type { DataViewDto, DataViewState } from "@/core/data-view/data-view-state.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve({ raw: (key: string) => key }) }));

import { ApplyDataViewOverrideInteractor } from "../apply-data-view-override.interactor";
import { DeleteDataViewInteractor } from "../delete-data-view.interactor";
import { UpsertDataViewInteractor } from "../upsert-data-view.interactor";
import { interactorFailureKind } from "@/core/validation/validation.utils";
import { ViewMode } from "@/core/base/base-query-builder";
import { CustomErrorCode } from "@/core/validation/validation.types";

const SURFACE = "contacts-card-store";
const OPERATOR_SURFACE = "operator-users";
const FOREIGN_VIEW_ID = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";
const MISSING_VIEW_ID = "11111111-2222-4333-8444-555555555555";
const OWN_VIEW_ID = "9a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";

const foreignView: DataViewDto = {
  id: FOREIGN_VIEW_ID,
  name: "Sofia's pipeline",
  visibility: "workspace",
  position: 0,
  isOwner: false,
  ownerName: "Sofia Rossi",
  surfaceKey: SURFACE,
  state: {},
};

function ownedView(overrides: Partial<DataViewDto> = {}): DataViewDto {
  return {
    id: OWN_VIEW_ID,
    name: "Open deals",
    visibility: "workspace",
    position: 0,
    isOwner: true,
    ownerName: "Max Mustermann",
    surfaceKey: SURFACE,
    state: { filters: [], viewMode: ViewMode.card },
    ...overrides,
  };
}

function upsertDoubles(owned: DataViewDto | null) {
  const repo = {
    findOwnedOrNull: vi.fn().mockResolvedValue(owned),
    nextPosition: vi.fn().mockResolvedValue(0),
    createView: vi.fn((args: Record<string, unknown>) =>
      Promise.resolve({ ...foreignView, ...args, isOwner: true, id: MISSING_VIEW_ID }),
    ),
    updateOwned: vi.fn((args: { name?: string; visibility?: DataViewDto["visibility"]; state?: DataViewState }) =>
      Promise.resolve(
        owned
          ? {
              ...owned,
              ...(args.name === undefined ? {} : { name: args.name }),
              ...(args.visibility === undefined ? {} : { visibility: args.visibility }),
              ...(args.state === undefined ? {} : { state: { ...owned.state, ...args.state } }),
            }
          : null,
      ),
    ),
  };
  const overrides = { upsertOverride: vi.fn(), deleteOverride: vi.fn().mockResolvedValue(true) };
  const personalization = { upsertP13n: vi.fn().mockResolvedValue(undefined) };

  return {
    repo,
    overrides,
    personalization,
    interactor: new UpsertDataViewInteractor(repo, overrides, personalization),
  };
}

function failureCode(result: { ok: boolean; error?: unknown }) {
  const error = (result as { error: { issues: Array<{ params?: { error?: string } }> } }).error;

  return { code: error.issues[0]?.params?.error, kind: interactorFailureKind(error as never) };
}

describe("data view ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an update of a workspace view owned by someone else, exactly as it refuses a missing id", async () => {
    const foreign = upsertDoubles(null);
    const missing = upsertDoubles(null);

    const onForeign = await runWithTenant(mockUser, () =>
      foreign.interactor.invoke({ id: FOREIGN_VIEW_ID, surfaceKey: SURFACE, name: "Stolen", state: {} }),
    );
    const onMissing = await runWithTenant(mockUser, () =>
      missing.interactor.invoke({ id: MISSING_VIEW_ID, surfaceKey: SURFACE, name: "Stolen", state: {} }),
    );

    expect(onForeign.ok).toBe(false);
    expect(failureCode(onForeign)).toEqual({ code: CustomErrorCode.dataViewNotFound, kind: "not_found" });
    expect(failureCode(onForeign)).toEqual(failureCode(onMissing));
    expect(foreign.repo.updateOwned).not.toHaveBeenCalled();
    expect(foreign.overrides.deleteOverride).not.toHaveBeenCalled();
  });

  it("refuses a save-from-override on a view the caller does not own", async () => {
    const { interactor, repo, overrides } = upsertDoubles(null);

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({
        id: FOREIGN_VIEW_ID,
        surfaceKey: SURFACE,
        name: "Sofia's pipeline",
        state: { pageSize: 10 },
        commitFromOverride: true,
      }),
    );

    expect(result.ok).toBe(false);
    expect(repo.updateOwned).not.toHaveBeenCalled();
    expect(overrides.deleteOverride).not.toHaveBeenCalled();
  });

  it("refuses a delete of a view the caller does not own and records no write", async () => {
    const repo = { deleteOwned: vi.fn().mockResolvedValue(false) };

    const result = await runWithTenant(mockUser, () =>
      new DeleteDataViewInteractor(repo).invoke({ id: FOREIGN_VIEW_ID }),
    );

    expect(result.ok).toBe(false);
    expect(failureCode(result)).toEqual({ code: CustomErrorCode.dataViewNotFound, kind: "not_found" });
  });

  it("coerces a workspace visibility on an operator surface to private", async () => {
    const { interactor, repo } = upsertDoubles(null);

    await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: OPERATOR_SURFACE, name: "Escalations", visibility: "workspace", state: {} }),
    );

    expect(repo.createView.mock.calls[0][0].visibility).toBe("private");
  });

  it("keeps a workspace visibility on a shareable surface", async () => {
    const { interactor, repo } = upsertDoubles(null);

    await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, name: "Shared", visibility: "workspace", state: {} }),
    );

    expect(repo.createView.mock.calls[0][0].visibility).toBe("workspace");
  });

  it("lets anyone duplicate a readable view, clearing their override on the source and pointing the chip at the copy", async () => {
    const { interactor, repo, overrides, personalization } = upsertDoubles(null);

    await runWithTenant(mockUser, () =>
      interactor.invoke({
        surfaceKey: SURFACE,
        name: "Sofia's pipeline copy",
        state: { pageSize: 10 },
        fromViewKey: FOREIGN_VIEW_ID,
      }),
    );

    expect(repo.createView).toHaveBeenCalled();
    expect(overrides.deleteOverride).toHaveBeenCalledWith({ surfaceKey: SURFACE, viewKey: FOREIGN_VIEW_ID });
    expect(personalization.upsertP13n).toHaveBeenCalledWith({ p13nId: SURFACE, activeViewKey: MISSING_VIEW_ID });
  });

  it("leaves a workspace view shared when the save carries no visibility", async () => {
    const { interactor, repo } = upsertDoubles(ownedView());

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ id: OWN_VIEW_ID, surfaceKey: SURFACE, name: "Open deals", state: { filters: [] } }),
    );

    expect(repo.updateOwned.mock.calls[0][0].visibility).toBeUndefined();
    expect(result.ok && result.data.visibility).toBe("workspace");
  });

  it("writes the visibility the owner explicitly asked for", async () => {
    const { interactor, repo } = upsertDoubles(ownedView());

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({
        id: OWN_VIEW_ID,
        surfaceKey: SURFACE,
        name: "Open deals",
        visibility: "private",
        state: {},
      }),
    );

    expect(repo.updateOwned.mock.calls[0][0].visibility).toBe("private");
    expect(result.ok && result.data.visibility).toBe("private");
  });

  it("refuses an update that names a surface the stored view does not live on", async () => {
    const stored = upsertDoubles(ownedView({ surfaceKey: OPERATOR_SURFACE, visibility: "private" }));
    const missing = upsertDoubles(null);

    const onMismatch = await runWithTenant(mockUser, () =>
      stored.interactor.invoke({
        id: OWN_VIEW_ID,
        surfaceKey: SURFACE,
        name: "Escalations",
        visibility: "workspace",
        state: {},
      }),
    );
    const onMissing = await runWithTenant(mockUser, () =>
      missing.interactor.invoke({ id: MISSING_VIEW_ID, surfaceKey: SURFACE, name: "Escalations", state: {} }),
    );

    expect(onMismatch.ok).toBe(false);
    expect(failureCode(onMismatch)).toEqual(failureCode(onMissing));
    expect(stored.repo.updateOwned).not.toHaveBeenCalled();
    expect(stored.overrides.deleteOverride).not.toHaveBeenCalled();
  });

  it("forces a view on a non-shareable surface back to private on every update", async () => {
    const { interactor, repo } = upsertDoubles(ownedView({ surfaceKey: OPERATOR_SURFACE, visibility: "private" }));

    await runWithTenant(mockUser, () =>
      interactor.invoke({
        id: OWN_VIEW_ID,
        surfaceKey: OPERATOR_SURFACE,
        name: "Escalations",
        visibility: "workspace",
        state: {},
      }),
    );

    expect(repo.updateOwned.mock.calls[0][0].visibility).toBe("private");
  });

  it("gives the override writer no way to name, rename or share a view", async () => {
    const views = { findViewById: vi.fn().mockResolvedValue(foreignView) };
    const overrides = { upsertOverride: vi.fn(), deleteOverride: vi.fn().mockResolvedValue(true) };

    await expect(
      runWithTenant(mockUser, () =>
        new ApplyDataViewOverrideInteractor(views, overrides).invoke({
          surfaceKey: SURFACE,
          viewKey: FOREIGN_VIEW_ID,
          mode: "save",
          state: {},
          name: "Stolen",
          visibility: "private",
        } as never),
      ),
    ).rejects.toThrow();
  });
});
