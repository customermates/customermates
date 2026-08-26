import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({
  env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { EntitlementService } from "../entitlement.service";

const ACTIVE_TRIAL = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const EXPIRED_TRIAL = new Date(Date.now() - 24 * 60 * 60 * 1000);

function makeService(subscription: { status: string; trialEndDate: Date | null; plan: string }) {
  const getSubscriptionOrThrow = vi.fn().mockResolvedValue(subscription);
  return {
    service: new EntitlementService({ getSubscriptionOrThrow } as never),
    getSubscriptionOrThrow,
  };
}

function denialCode(denied: { code: string } | null): unknown {
  if (!denied) throw new Error("expected a denial");
  return denied.code;
}

describe('EntitlementService.require("messaging")', () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies starter with messagingRequiresPro", async () => {
    const { service } = makeService({
      status: "active",
      trialEndDate: null,
      plan: "starter",
    });
    const denied = await service.require("messaging");
    expect(denied?.ok).toBe(false);
    expect(denied?.error.issues[0].message).toBe("ConnectedAccountsCard.messagingRequiresPro");
    expect(denialCode(denied)).toBe("messagingRequiresPro");
  });

  it("allows pro, business and enterprise", async () => {
    for (const plan of ["pro", "business", "enterprise"]) {
      const { service } = makeService({
        status: "active",
        trialEndDate: null,
        plan,
      });
      expect(await service.require("messaging")).toBeNull();
    }
  });

  it("allows an active trial on a messaging plan", async () => {
    const { service } = makeService({
      status: "trial",
      trialEndDate: ACTIVE_TRIAL,
      plan: "pro",
    });
    expect(await service.require("messaging")).toBeNull();
  });

  it("denies an unusable subscription with paidSubscriptionRequired", async () => {
    const { service } = makeService({
      status: "trial",
      trialEndDate: EXPIRED_TRIAL,
      plan: "pro",
    });
    const denied = await service.require("messaging");
    expect(denialCode(denied)).toBe("paidSubscriptionRequired");
  });
});

describe('EntitlementService.require("sharedAccounts")', () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies pro with sharedAccountsRequiresBusiness", async () => {
    const { service } = makeService({
      status: "active",
      trialEndDate: null,
      plan: "pro",
    });
    const denied = await service.require("sharedAccounts");
    expect(denialCode(denied)).toBe("sharedAccountsRequiresBusiness");
  });

  it("allows business and enterprise", async () => {
    for (const plan of ["business", "enterprise"]) {
      const { service } = makeService({
        status: "active",
        trialEndDate: null,
        plan,
      });
      expect(await service.require("sharedAccounts")).toBeNull();
    }
  });
});

describe('EntitlementService.require("agentChat")', () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows every active cloud plan", async () => {
    for (const plan of ["starter", "pro", "business", "enterprise"]) {
      const { service } = makeService({
        status: "active",
        trialEndDate: null,
        plan,
      });
      expect(await service.require("agentChat")).toBeNull();
    }
  });
});

describe("EntitlementService self-hosted", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies with the cloud message before any subscription lookup", async () => {
    vi.resetModules();
    vi.doMock("@/env", () => ({
      env: { ...MOCK_ENV_MODULE.env, APP_MODE: "self-hosted" },
    }));
    vi.doMock("next-intl/server", () => ({
      getTranslations: () => Promise.resolve((key: string) => key),
      getLocale: () => Promise.resolve("en"),
    }));

    const { EntitlementService: SelfHosted } = await import("../entitlement.service");
    const getSubscriptionOrThrow = vi.fn();
    const service = new SelfHosted({ getSubscriptionOrThrow } as never);

    const messaging = await service.require("messaging");
    expect(denialCode(messaging)).toBe("messagingRequiresCloud");

    const shared = await service.require("sharedAccounts");
    expect(denialCode(shared)).toBe("sharedAccountsRequiresCloud");

    expect(getSubscriptionOrThrow).not.toHaveBeenCalled();
  });
});

describe("EntitlementService demo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows agent chat in demo mode through the ordinary plan gate", async () => {
    vi.resetModules();
    vi.doMock("@/env", () => ({
      env: { ...MOCK_ENV_MODULE.env, APP_MODE: "demo" },
    }));
    vi.doMock("next-intl/server", () => ({
      getTranslations: () => Promise.resolve((key: string) => key),
      getLocale: () => Promise.resolve("en"),
    }));

    const { EntitlementService: Demo } = await import("../entitlement.service");
    const getSubscriptionOrThrow = vi.fn().mockResolvedValue({ plan: "pro", status: "active", trialEndDate: null });
    const service = new Demo({ getSubscriptionOrThrow } as never);

    const denied = await service.require("agentChat");
    expect(denied).toBeNull();
    expect(getSubscriptionOrThrow).toHaveBeenCalledOnce();

    getSubscriptionOrThrow.mockResolvedValue({
      status: "active",
      trialEndDate: null,
      plan: "pro",
    });
    expect(await service.require("messaging")).toBeNull();
    expect(getSubscriptionOrThrow).toHaveBeenCalledTimes(2);
  });
});

describe("EntitlementService Assistant kill switch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies only agent chat before subscription lookup", async () => {
    vi.resetModules();
    vi.doMock("@/env", () => ({
      env: {
        ...MOCK_ENV_MODULE.env,
        APP_MODE: "cloud",
        AGENT_CHAT_DISABLED: true,
      },
    }));
    vi.doMock("next-intl/server", () => ({
      getTranslations: () => Promise.resolve((key: string) => key),
      getLocale: () => Promise.resolve("en"),
    }));

    const { EntitlementService: Disabled } = await import("../entitlement.service");
    const getSubscriptionOrThrow = vi.fn().mockResolvedValue({ status: "active", trialEndDate: null, plan: "pro" });
    const service = new Disabled({ getSubscriptionOrThrow } as never);

    const denied = await service.require("agentChat");
    expect(denialCode(denied)).toBe("agentChatDisabled");
    expect(denied?.error.issues[0]?.message).toBe("ConnectedAccountsCard.agentChatDisabled");
    expect(getSubscriptionOrThrow).not.toHaveBeenCalled();

    expect(await service.require("messaging")).toBeNull();
    expect(getSubscriptionOrThrow).toHaveBeenCalledOnce();
  });
});
