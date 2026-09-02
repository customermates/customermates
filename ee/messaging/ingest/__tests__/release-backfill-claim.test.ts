import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({ env: MOCK_ENV_MODULE.env }));

const { ReleaseBackfillClaimInteractor } = await import("../release-backfill-claim.interactor");

function harness() {
  const calls: { token: string; complete: boolean }[] = [];
  const repo = {
    findAccountByIdUnscoped: () => Promise.resolve({ unipileAccountId: "acc_1" }),
    releaseBackfillClaimUnscoped: (_id: string, token: string, complete: boolean) => {
      calls.push({ token, complete });

      return Promise.resolve();
    },
  };

  return { calls, interactor: new ReleaseBackfillClaimInteractor(repo as never) };
}

const ID = "11111111-1111-4111-8111-111111111111";

describe("releasing a backfill claim", () => {
  it("reports completion when the drain finished", async () => {
    const { calls, interactor } = harness();
    await interactor.invoke({ connectedAccountId: ID, token: "t", complete: true });

    expect(calls[0]).toEqual({ token: "t", complete: true });
  });

  it("reports incompletion when sources were deferred or abandoned", async () => {
    const { calls, interactor } = harness();
    await interactor.invoke({ connectedAccountId: ID, token: "t", complete: false });

    expect(calls[0], "an incomplete drain must not claim it finished").toEqual({ token: "t", complete: false });
  });

  it("requires the caller to state completeness rather than defaulting to success", async () => {
    const { calls, interactor } = harness();

    let rejected = false;
    try {
      await interactor.invoke({ connectedAccountId: ID, token: "t" } as never);
    } catch {
      rejected = true;
    }

    expect(rejected, "omitting completeness must not silently pass").toBe(true);
    expect(calls).toHaveLength(0);
  });
});
