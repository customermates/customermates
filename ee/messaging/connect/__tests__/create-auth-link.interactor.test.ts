import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" } }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { CreateAuthLinkInteractor } from "../create-auth-link.interactor";
import { EntitlementService } from "@/ee/subscription/entitlement.service";

const TRIAL_ACTIVE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const TRIAL_EXPIRED = new Date(Date.now() - 24 * 60 * 60 * 1000);

function makeRepo(overrides: {
  status: string;
  trialEndDate: Date | null;
  plan: string;
  activeAccountsForUser?: number;
}) {
  return {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({
      status: overrides.status,
      trialEndDate: overrides.trialEndDate,
      plan: overrides.plan,
    }),
    countActiveAccountsForUser: vi.fn().mockResolvedValue(overrides.activeAccountsForUser ?? 0),
  };
}

function makeInteractor(repo: ReturnType<typeof makeRepo>) {
  const messagingService = { createAuthLink: vi.fn().mockResolvedValue("https://auth.example.com/link") };
  const entitlements = new EntitlementService({ getSubscriptionOrThrow: repo.getSubscriptionOrThrow } as never);
  return {
    interactor: new CreateAuthLinkInteractor(messagingService as never, repo as never, repo as never, entitlements),
    messagingService,
  };
}

describe("CreateAuthLinkInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks starter plan with messagingRequiresPro", async () => {
    const repo = makeRepo({ status: "active", trialEndDate: null, plan: "starter" });
    const { interactor, messagingService } = makeInteractor(repo);

    const result: any = await interactor.invoke({ channel: "google" });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].message).toBe("ConnectedAccountsCard.messagingRequiresPro");
    expect(result.code).toBe("messagingRequiresPro");
    expect(messagingService.createAuthLink).not.toHaveBeenCalled();
  });

  it("lets a pro plan under its included cap proceed", async () => {
    const repo = makeRepo({ status: "active", trialEndDate: null, plan: "pro", activeAccountsForUser: 0 });
    const { interactor, messagingService } = makeInteractor(repo);

    const result: any = await interactor.invoke({ channel: "google" });

    expect(result.redirect).toBe("https://auth.example.com/link");
    expect(messagingService.createAuthLink).toHaveBeenCalledTimes(1);
  });

  it("blocks a pro plan at its included cap with upgradeToBusinessForMoreAccounts", async () => {
    const repo = makeRepo({ status: "active", trialEndDate: null, plan: "pro", activeAccountsForUser: 1 });
    const { interactor, messagingService } = makeInteractor(repo);

    const result: any = await interactor.invoke({ channel: "google" });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].message).toBe("ConnectedAccountsCard.upgradeToBusinessForMoreAccounts");
    expect(result.code).toBe("upgradeToBusinessForMoreAccounts");
    expect(messagingService.createAuthLink).not.toHaveBeenCalled();
  });

  it("lets a business plan under its included cap proceed", async () => {
    const repo = makeRepo({
      status: "active",
      trialEndDate: null,
      plan: "business",
      activeAccountsForUser: 2,
    });
    const { interactor, messagingService } = makeInteractor(repo);

    const result: any = await interactor.invoke({ channel: "google" });

    expect(result.redirect).toBe("https://auth.example.com/link");
    expect(messagingService.createAuthLink).toHaveBeenCalledTimes(1);
  });

  it("blocks a business plan at its included cap with accountLimitReached", async () => {
    const repo = makeRepo({
      status: "active",
      trialEndDate: null,
      plan: "business",
      activeAccountsForUser: 3,
    });
    const { interactor, messagingService } = makeInteractor(repo);

    const result: any = await interactor.invoke({ channel: "google" });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].message).toBe("ConnectedAccountsCard.accountLimitReached");
    expect(result.code).toBe("accountLimitReached");
    expect(messagingService.createAuthLink).not.toHaveBeenCalled();
  });

  it("lets an active trial on the pro plan proceed", async () => {
    const repo = makeRepo({ status: "trial", trialEndDate: TRIAL_ACTIVE, plan: "pro", activeAccountsForUser: 0 });
    const { interactor, messagingService } = makeInteractor(repo);

    const result: any = await interactor.invoke({ channel: "google" });

    expect(result.redirect).toBe("https://auth.example.com/link");
    expect(messagingService.createAuthLink).toHaveBeenCalledTimes(1);
  });

  it("blocks an expired trial with paidSubscriptionRequired", async () => {
    const repo = makeRepo({ status: "trial", trialEndDate: TRIAL_EXPIRED, plan: "pro" });
    const { interactor, messagingService } = makeInteractor(repo);

    const result: any = await interactor.invoke({ channel: "google" });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].message).toBe("ConnectedAccountsCard.paidSubscriptionRequired");
    expect(result.code).toBe("paidSubscriptionRequired");
    expect(messagingService.createAuthLink).not.toHaveBeenCalled();
  });

  it("blocks self-hosted with messagingRequiresCloud before any subscription lookup", async () => {
    vi.resetModules();
    vi.doMock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "self-hosted" } }));
    vi.doMock("@/core/di", () => createMockDiModule(() => mockUser));
    vi.doMock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
    vi.doMock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
    vi.doMock("next-intl/server", () => ({
      getTranslations: () => Promise.resolve((key: string) => key),
      getLocale: () => Promise.resolve("en"),
    }));

    const { CreateAuthLinkInteractor: SelfHostedInteractor } = await import("../create-auth-link.interactor");
    const { EntitlementService: SelfHostedEntitlementService } = await import("@/ee/subscription/entitlement.service");
    const repo = makeRepo({ status: "expired", trialEndDate: null, plan: "starter" });
    const messagingService = { createAuthLink: vi.fn().mockResolvedValue("https://auth.example.com/link") };
    const entitlements = new SelfHostedEntitlementService({
      getSubscriptionOrThrow: repo.getSubscriptionOrThrow,
    } as never);
    const interactor = new SelfHostedInteractor(messagingService as never, repo as never, repo as never, entitlements);

    const result: any = await interactor.invoke({ channel: "google" });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].message).toBe("ConnectedAccountsCard.messagingRequiresCloud");
    expect(result.code).toBe("messagingRequiresCloud");
    expect(messagingService.createAuthLink).not.toHaveBeenCalled();
    expect(repo.getSubscriptionOrThrow).not.toHaveBeenCalled();
  });
});
