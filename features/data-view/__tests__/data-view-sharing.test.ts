import type { DataViewDto } from "@/core/data-view/data-view-state.schema";

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

import { ShareDataViewInteractor } from "../share-data-view.interactor";
import { HideSharedDataViewInteractor } from "../hide-shared-data-view.interactor";
import { interactorFailureKind } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const SURFACE = "webhooks-card-store";
const VIEW_ID = "9a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";
const ROLE_A = "1b7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";
const ROLE_B = "2b7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";

function view(overrides: Partial<DataViewDto> = {}): DataViewDto {
  return { id: VIEW_ID, name: "Open deals", position: 0, surfaceKey: SURFACE, state: {}, ...overrides };
}

function failure(result: { ok: boolean; error?: unknown }) {
  const error = (result as { error: { issues: Array<{ params?: { error?: string } }> } }).error;

  return { code: error.issues[0]?.params?.error, kind: interactorFailureKind(error as never) };
}

function shareDoubles(owned: DataViewDto | null, knownRoles = 2) {
  const repo = {
    findOwnedOrNull: vi.fn().mockResolvedValue(owned),
    countCompanyRoles: vi.fn().mockResolvedValue(knownRoles),
    shareOwned: vi.fn((args: { visibility: string; roleIds: string[] }) =>
      Promise.resolve({ id: VIEW_ID, name: "Open deals", position: 0, state: {}, ...args }),
    ),
  };

  return { repo, interactor: new ShareDataViewInteractor(repo as never) };
}

describe("data view sharing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shares an owned view with everyone and drops any role list", async () => {
    const { repo, interactor } = shareDoubles(view());

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ id: VIEW_ID, visibility: "workspace", roleIds: [ROLE_A] }),
    );

    expect(result).toMatchObject({ ok: true, data: { visibility: "workspace", roleIds: [] } });
    expect(repo.countCompanyRoles).not.toHaveBeenCalled();
    expect(repo.shareOwned).toHaveBeenCalledWith({ id: VIEW_ID, visibility: "workspace", roleIds: [] });
  });

  it("shares with selected roles only after every role is found in the workspace", async () => {
    const { repo, interactor } = shareDoubles(view());

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ id: VIEW_ID, visibility: "roles", roleIds: [ROLE_A, ROLE_B, ROLE_A] }),
    );

    expect(result.ok).toBe(true);
    expect(repo.countCompanyRoles).toHaveBeenCalledWith([ROLE_A, ROLE_B]);
    expect(repo.shareOwned).toHaveBeenCalledWith({ id: VIEW_ID, visibility: "roles", roleIds: [ROLE_A, ROLE_B] });
  });

  it("refuses a role from another workspace without changing the view", async () => {
    const { repo, interactor } = shareDoubles(view(), 1);

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ id: VIEW_ID, visibility: "roles", roleIds: [ROLE_A, ROLE_B] }),
    );

    expect(result.ok).toBe(false);
    expect(failure(result)).toEqual({ code: CustomErrorCode.roleNotFound, kind: "not_found" });
    expect(repo.shareOwned).not.toHaveBeenCalled();
  });

  it("requires at least one role when sharing with selected roles", async () => {
    const { repo, interactor } = shareDoubles(view());

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ id: VIEW_ID, visibility: "roles", roleIds: [] }),
    );

    expect(result.ok).toBe(false);
    expect(repo.findOwnedOrNull).not.toHaveBeenCalled();
  });

  it("refuses to share a view the caller does not own", async () => {
    const { repo, interactor } = shareDoubles(null);

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ id: VIEW_ID, visibility: "workspace", roleIds: [] }),
    );

    expect(failure(result)).toEqual({ code: CustomErrorCode.dataViewNotFound, kind: "not_found" });
    expect(repo.shareOwned).not.toHaveBeenCalled();
  });

  it("hides a view shared with the caller and resets the surface to All", async () => {
    const repo = {
      findSharedWithMeOrNull: vi.fn().mockResolvedValue(view()),
      setSharedHidden: vi.fn().mockResolvedValue(undefined),
    };
    const personalization = { upsertP13n: vi.fn().mockResolvedValue(undefined) };

    const result = await runWithTenant(mockUser, () =>
      new HideSharedDataViewInteractor(repo, personalization).invoke({ id: VIEW_ID, hidden: true }),
    );

    expect(result).toEqual({ ok: true, data: { id: VIEW_ID, hidden: true } });
    expect(repo.setSharedHidden).toHaveBeenCalledWith(VIEW_ID, true);
    expect(personalization.upsertP13n).toHaveBeenCalledWith({ p13nId: SURFACE, activeViewKey: "__all__" });
  });

  it("refuses to hide the caller's own or an unshared view", async () => {
    const repo = {
      findSharedWithMeOrNull: vi.fn().mockResolvedValue(null),
      setSharedHidden: vi.fn(),
    };
    const personalization = { upsertP13n: vi.fn() };

    const result = await runWithTenant(mockUser, () =>
      new HideSharedDataViewInteractor(repo, personalization).invoke({ id: VIEW_ID, hidden: true }),
    );

    expect(failure(result)).toEqual({ code: CustomErrorCode.dataViewNotFound, kind: "not_found" });
    expect(repo.setSharedHidden).not.toHaveBeenCalled();
    expect(personalization.upsertP13n).not.toHaveBeenCalled();
  });
});
