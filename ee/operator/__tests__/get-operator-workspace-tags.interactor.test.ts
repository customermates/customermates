import { describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "@/core/decorators/operator-context";
import type { OperatorRepo } from "../operator.repo";

const actor: OperatorActor = {
  authUserId: "auth-1",
  userId: "user-1",
  companyId: "company-1",
  email: "operator@example.invalid",
};

vi.mock("@/core/di", () => ({
  getOperatorAccessService: () => ({ authorizeFresh: () => Promise.resolve(actor) }),
}));

import { GetOperatorWorkspaceTagsInteractor } from "../get/get-operator-workspace-tags.interactor";

function repoReturning(tags: string[]) {
  return { listWorkspaceTagsUnscoped: () => Promise.resolve(tags) } as unknown as OperatorRepo;
}

describe("GetOperatorWorkspaceTagsInteractor", () => {
  it("validates a non-empty tag list against the element schema rather than an array schema", async () => {
    const interactor = new GetOperatorWorkspaceTagsInteractor(repoReturning(["Acme Group", "ProspeIQ"]));

    await expect(interactor.invoke()).resolves.toEqual({ ok: true, data: ["Acme Group", "ProspeIQ"] });
  });

  it("returns an empty list when no workspace carries a tag", async () => {
    const interactor = new GetOperatorWorkspaceTagsInteractor(repoReturning([]));

    await expect(interactor.invoke()).resolves.toEqual({ ok: true, data: [] });
  });
});
