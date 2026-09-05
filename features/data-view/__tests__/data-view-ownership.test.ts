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

function ownedView(overrides: Partial<DataViewDto> = {}): DataViewDto {
  return {
    id: OWN_VIEW_ID,
    name: "Open deals",
    position: 0,
    surfaceKey: SURFACE,
    state: { filters: [], viewMode: ViewMode.card },
    ...overrides,
  };
}

function upsertDoubles(owned: DataViewDto | null) {
  const repo = {
    findOwnedOrNull: vi.fn().mockResolvedValue(owned),
    nextPosition: vi.fn().mockResolvedValue(3),
    createView: vi.fn((args: Record<string, unknown>) =>
      Promise.resolve({ ...ownedView(), ...args, id: MISSING_VIEW_ID }),
    ),
    updateOwned: vi.fn((args: { name?: string; position?: number; state?: DataViewState }) =>
      Promise.resolve(
        owned
          ? {
              ...owned,
              ...(args.name === undefined ? {} : { name: args.name }),
              ...(args.position === undefined ? {} : { position: args.position }),
              ...(args.state === undefined ? {} : { state: { ...owned.state, ...args.state } }),
            }
          : null,
      ),
    ),
  };
  const personalization = { upsertP13n: vi.fn().mockResolvedValue(undefined) };

  return { repo, personalization, interactor: new UpsertDataViewInteractor(repo, personalization) };
}

function failureCode(result: { ok: boolean; error?: unknown }) {
  const error = (result as { error: { issues: Array<{ params?: { error?: string } }> } }).error;

  return { code: error.issues[0]?.params?.error, kind: interactorFailureKind(error as never) };
}

describe("data view ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an update of a view owned by someone else, exactly as it refuses a missing id", async () => {
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
    expect(foreign.personalization.upsertP13n).not.toHaveBeenCalled();
  });

  it("refuses a delete of a view the caller does not own and records no write", async () => {
    const repo = { deleteOwned: vi.fn().mockResolvedValue(false) };

    const result = await runWithTenant(mockUser, () =>
      new DeleteDataViewInteractor(repo).invoke({ id: FOREIGN_VIEW_ID }),
    );

    expect(result.ok).toBe(false);
    expect(failureCode(result)).toEqual({ code: CustomErrorCode.dataViewNotFound, kind: "not_found" });
  });

  it("creates a view at the caller's next position and points the surface at it", async () => {
    const { interactor, repo, personalization } = upsertDoubles(null);

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, name: "Hot leads", state: { pageSize: 10 } }),
    );

    expect(result.ok && result.data.id).toBe(MISSING_VIEW_ID);
    expect(repo.createView).toHaveBeenCalledWith({
      surfaceKey: SURFACE,
      name: "Hot leads",
      position: 3,
      state: { pageSize: 10 },
    });
    expect(personalization.upsertP13n).toHaveBeenCalledWith({ p13nId: SURFACE, activeViewKey: MISSING_VIEW_ID });
  });

  it("renames and moves an owned view without touching the remembered tab", async () => {
    const { interactor, repo, personalization } = upsertDoubles(ownedView());

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ id: OWN_VIEW_ID, surfaceKey: SURFACE, name: "Renamed", position: 2, state: {} }),
    );

    expect(result.ok && result.data).toMatchObject({ id: OWN_VIEW_ID, name: "Renamed", position: 2 });
    expect(repo.updateOwned).toHaveBeenCalledWith({ id: OWN_VIEW_ID, name: "Renamed", position: 2, state: {} });
    expect(personalization.upsertP13n).not.toHaveBeenCalled();
  });

  it("refuses an update that names a surface the stored view does not live on", async () => {
    const stored = upsertDoubles(ownedView({ surfaceKey: OPERATOR_SURFACE }));
    const missing = upsertDoubles(null);

    const onMismatch = await runWithTenant(mockUser, () =>
      stored.interactor.invoke({ id: OWN_VIEW_ID, surfaceKey: SURFACE, name: "Escalations", state: {} }),
    );
    const onMissing = await runWithTenant(mockUser, () =>
      missing.interactor.invoke({ id: MISSING_VIEW_ID, surfaceKey: SURFACE, name: "Escalations", state: {} }),
    );

    expect(onMismatch.ok).toBe(false);
    expect(failureCode(onMismatch)).toEqual(failureCode(onMissing));
    expect(stored.repo.updateOwned).not.toHaveBeenCalled();
  });

  it("rejects a visibility key on the wire now that every view is personal", async () => {
    const { interactor, repo } = upsertDoubles(null);

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, name: "Shared", visibility: "workspace", state: {} } as never),
    );

    expect(result.ok).toBe(false);
    expect(repo.createView).not.toHaveBeenCalled();
  });
});
