import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "../operator-context";

const authorizeFresh = vi.hoisted(() => vi.fn<() => Promise<OperatorActor>>());

vi.mock("@/core/di", () => ({
  getOperatorAccessService: () => ({ authorizeFresh }),
}));

import { OperatorInteractor } from "../operator-interactor.decorator";
import { getOperatorActor } from "../operator-context";

const actor: OperatorActor = {
  authUserId: "auth-user-id",
  userId: "operator-user-id",
  companyId: "operator-company-id",
  email: "operator@example.invalid",
};

@OperatorInteractor
class TestOperatorInteractor {
  async invoke(value: string) {
    await Promise.resolve();
    return { actor: getOperatorActor(), value };
  }
}

describe("OperatorInteractor", () => {
  beforeEach(() => {
    authorizeFresh.mockReset().mockResolvedValue(actor);
  });

  it("authorizes every invocation and retains actor context for the operation", async () => {
    const interactor = new TestOperatorInteractor();

    await expect(interactor.invoke("first")).resolves.toEqual({ actor, value: "first" });
    await expect(interactor.invoke("second")).resolves.toEqual({ actor, value: "second" });
    expect(authorizeFresh).toHaveBeenCalledTimes(2);
  });

  it("does not invoke operator work after authorization fails", async () => {
    authorizeFresh.mockRejectedValueOnce(new Error("denied"));

    await expect(new TestOperatorInteractor().invoke("blocked")).rejects.toThrow("denied");
  });
});
