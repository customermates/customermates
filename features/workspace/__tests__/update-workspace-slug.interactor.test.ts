import { beforeEach, describe, expect, it, vi } from "vitest";
import { Action, Resource } from "@/generated/prisma";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { UpdateWorkspaceSlugInteractor } from "../update-workspace-slug.interactor";

const admin = createMockUser();

describe("UpdateWorkspaceSlugInteractor", () => {
  let repo: { updateCompanySlug: ReturnType<typeof vi.fn> };

  function update(slug: string, user = admin) {
    return runWithTenant(user, () => new UpdateWorkspaceSlugInteractor(repo as never).invoke({ slug }));
  }

  beforeEach(() => {
    repo = { updateCompanySlug: vi.fn().mockResolvedValue("updated") };
  });

  it("saves a normalized slug for a member who may update the workspace", async () => {
    expect(await update("  Acme-Taxes ")).toEqual({ ok: true, data: { slug: "acme-taxes" } });
    expect(repo.updateCompanySlug).toHaveBeenCalledWith("acme-taxes");
  });

  it("lets a custom role with update permission on the workspace change it", async () => {
    const editor = createMockUserWithPermissions([{ resource: Resource.company, action: Action.update }]);

    await expect(update("acme", editor)).resolves.toMatchObject({ ok: true });
  });

  it("refuses members who may not update the workspace", async () => {
    const reader = createMockUserWithPermissions([{ resource: Resource.company, action: Action.readAll }]);

    await expect(update("acme", reader)).rejects.toThrow(/Access denied/u);
    expect(repo.updateCompanySlug).not.toHaveBeenCalled();
  });

  it.each(["dashboard", "w", "api", "-acme", "acme--taxes", "acme_taxes", "", "a".repeat(41)])(
    "rejects the reserved or malformed slug %j without writing",
    async (slug) => {
      const result = await update(slug);

      expect(result.ok).toBe(false);
      expect(repo.updateCompanySlug).not.toHaveBeenCalled();
    },
  );

  it("answers a conflict on the slug field when another workspace already uses it", async () => {
    repo.updateCompanySlug.mockResolvedValue("taken");

    const result = await update("acme");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceSlugTaken]);
      expect(result.error.issues[0]?.path).toEqual(["slug"]);
    }
  });
});
