import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readCookie: vi.fn(), resolve: vi.fn() }));

vi.mock("@/core/di", () => ({ getOnboardingIntentService: () => ({ resolve: mocks.resolve }) }));
vi.mock("../invite-token-cookie", () => ({ readInviteTokenCookie: mocks.readCookie }));

import { resolveOnboardingIntent } from "../onboarding-intent";

describe("onboarding intent Next adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readCookie.mockResolvedValue("legacy-token");
    mocks.resolve.mockResolvedValue({ status: "absent" });
  });

  it("does not read ambient invitation state when an explicit intent is present", async () => {
    await resolveOnboardingIntent("signed.intent");

    expect(mocks.readCookie).not.toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith("signed.intent", undefined);
  });

  it("passes the rollout cookie only when no explicit intent is present", async () => {
    await resolveOnboardingIntent();

    expect(mocks.readCookie).toHaveBeenCalledOnce();
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith(undefined, "legacy-token");
  });
});
