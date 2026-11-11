import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@react-email/render";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env } }));

const { DeleteAccountsForPlanInteractor } = await import("../delete-accounts-for-plan.interactor");
const { WorkspaceSlugResolver } = await import("@/features/workspace/workspace-slug-resolver");

function account(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "acc-1",
    userId: "user-1",
    createdAt: new Date("2026-01-01"),
    provider: "linkedin",
    displayName: "Jane Doe",
    emailAddress: null,
    ...overrides,
  };
}

function makeConnectedAccountRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listActiveAccountsForCompanyUnscoped: vi.fn().mockResolvedValue([]),
    listSharedAccountsForCompanyUnscoped: vi.fn().mockResolvedValue([]),
    makeAccountPrivateUnscoped: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeUserRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findCompanyAdminsUnscoped: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeDeleteService() {
  return { deleteForBillingOrThrow: vi.fn().mockResolvedValue(undefined) };
}

function makeEmailService() {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function makeEventService() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function makeSlugResolver() {
  return new WorkspaceSlugResolver({ findWorkspaceSlugUnscoped: vi.fn().mockResolvedValue("acme") });
}

beforeEach(() => vi.clearAllMocks());

describe("DeleteAccountsForPlanInteractor", () => {
  it("is a no-op for an unlimited plan", async () => {
    const connectedAccountRepo = makeConnectedAccountRepo();
    const userRepo = makeUserRepo();
    const deleteService = makeDeleteService();
    const emailService = makeEmailService();
    const service = new DeleteAccountsForPlanInteractor(
      connectedAccountRepo as never,
      userRepo as never,
      deleteService as never,
      emailService as never,
      makeSlugResolver(),
      makeEventService() as never,
    );

    await service.invoke({ companyId: "company-1", plan: "enterprise" });

    expect(connectedAccountRepo.listActiveAccountsForCompanyUnscoped).not.toHaveBeenCalled();
    expect(deleteService.deleteForBillingOrThrow).not.toHaveBeenCalled();
  });

  it("removes the 2 newest accounts for a user with 3 accounts downgrading business -> pro", async () => {
    const oldest = account({ id: "acc-oldest", createdAt: new Date("2026-01-01") });
    const middle = account({ id: "acc-middle", createdAt: new Date("2026-02-01") });
    const newest = account({ id: "acc-newest", createdAt: new Date("2026-03-01") });
    const connectedAccountRepo = makeConnectedAccountRepo({
      listActiveAccountsForCompanyUnscoped: vi.fn().mockResolvedValue([oldest, middle, newest]),
    });
    const userRepo = makeUserRepo();
    const deleteService = makeDeleteService();
    const emailService = makeEmailService();
    const service = new DeleteAccountsForPlanInteractor(
      connectedAccountRepo as never,
      userRepo as never,
      deleteService as never,
      emailService as never,
      makeSlugResolver(),
      makeEventService() as never,
    );

    await service.invoke({ companyId: "company-1", plan: "pro" });

    expect(deleteService.deleteForBillingOrThrow).toHaveBeenCalledTimes(2);
    expect(deleteService.deleteForBillingOrThrow).toHaveBeenCalledWith("acc-newest", "planDowngrade");
    expect(deleteService.deleteForBillingOrThrow).toHaveBeenCalledWith("acc-middle", "planDowngrade");
    expect(deleteService.deleteForBillingOrThrow).not.toHaveBeenCalledWith("acc-oldest", "planDowngrade");
  });

  it("does nothing and sends no notice when everyone already fits the new plan", async () => {
    const connectedAccountRepo = makeConnectedAccountRepo({
      listActiveAccountsForCompanyUnscoped: vi.fn().mockResolvedValue([account()]),
    });
    const userRepo = makeUserRepo();
    const deleteService = makeDeleteService();
    const emailService = makeEmailService();
    const service = new DeleteAccountsForPlanInteractor(
      connectedAccountRepo as never,
      userRepo as never,
      deleteService as never,
      emailService as never,
      makeSlugResolver(),
      makeEventService() as never,
    );

    await service.invoke({ companyId: "company-1", plan: "pro" });

    expect(deleteService.deleteForBillingOrThrow).not.toHaveBeenCalled();
    expect(userRepo.findCompanyAdminsUnscoped).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("emails every company admin once accounts were removed", async () => {
    const newest = account({
      id: "acc-newest",
      createdAt: new Date("2026-03-01"),
      provider: "mail",
      displayName: "Inbox",
    });
    const middle = account({ id: "acc-middle", createdAt: new Date("2026-02-01") });
    const connectedAccountRepo = makeConnectedAccountRepo({
      listActiveAccountsForCompanyUnscoped: vi.fn().mockResolvedValue([middle, newest]),
    });
    const userRepo = makeUserRepo({
      findCompanyAdminsUnscoped: vi.fn().mockResolvedValue([
        { id: "admin-1", email: "admin1@x.com", firstName: "Ada", displayLanguage: "en" },
        { id: "admin-2", email: "admin2@x.com", firstName: "Bo", displayLanguage: "de" },
      ]),
    });
    const deleteService = makeDeleteService();
    const emailService = makeEmailService();
    const service = new DeleteAccountsForPlanInteractor(
      connectedAccountRepo as never,
      userRepo as never,
      deleteService as never,
      emailService as never,
      makeSlugResolver(),
      makeEventService() as never,
    );

    await service.invoke({ companyId: "company-1", plan: "starter" });

    expect(emailService.send).toHaveBeenCalledTimes(2);
    expect(emailService.send.mock.calls[0][0].to).toBe("admin1@x.com");
    expect(emailService.send.mock.calls[1][0].to).toBe("admin2@x.com");

    const englishHtml = await render(emailService.send.mock.calls[0][0].react);
    const germanHtml = await render(emailService.send.mock.calls[1][0].react);
    expect(englishHtml).toContain("Email (Inbox)");
    expect(germanHtml).toContain("E-Mail (Inbox)");
    expect(germanHtml).toContain("Dein Plan wurde auf Starter umgestellt");
    expect(germanHtml).not.toContain("mail (Inbox)");
    expect(englishHtml).toContain(`${MOCK_ENV_MODULE.env.BASE_URL}/w/acme/settings/channels`);
  });
  describe("shared accounts", () => {
    function setup(shared: unknown[], overrides: Partial<Record<string, unknown>> = {}) {
      const connectedAccountRepo = makeConnectedAccountRepo({
        listSharedAccountsForCompanyUnscoped: vi.fn().mockResolvedValue(shared),
        ...overrides,
      });
      const eventService = makeEventService();
      const service = new DeleteAccountsForPlanInteractor(
        connectedAccountRepo as never,
        makeUserRepo() as never,
        makeDeleteService() as never,
        makeEmailService() as never,
        makeSlugResolver(),
        eventService as never,
      );
      return { service, connectedAccountRepo, eventService };
    }

    it.each(["starter", "pro"] as const)("sets every shared account private on %s", async (plan) => {
      const first = account({ id: "acc-1", userId: "user-1" });
      const second = account({ id: "acc-2", userId: "user-2", provider: "google", emailAddress: "two@example.com" });
      const { service, connectedAccountRepo, eventService } = setup([first, second]);

      await service.invoke({ companyId: "company-1", plan });

      expect(connectedAccountRepo.makeAccountPrivateUnscoped).toHaveBeenCalledTimes(2);
      expect(connectedAccountRepo.makeAccountPrivateUnscoped).toHaveBeenCalledWith("company-1", "acc-1");
      expect(connectedAccountRepo.makeAccountPrivateUnscoped).toHaveBeenCalledWith("company-1", "acc-2");
      expect(eventService.publish).toHaveBeenCalledTimes(2);
      expect(eventService.publish).toHaveBeenCalledWith(
        "connected_account.updated",
        {
          entityId: "acc-2",
          payload: {
            connectedAccount: { provider: "google", displayName: "Jane Doe", emailAddress: "two@example.com" },
            changes: { visibility: { previous: "shared", current: "private" } },
          },
        },
        { systemCompanyId: "company-1", systemUserId: "user-2" },
      );
    });

    it.each(["business", "max"] as const)("leaves shared accounts alone on %s", async (plan) => {
      const { service, connectedAccountRepo, eventService } = setup([account()]);

      await service.invoke({ companyId: "company-1", plan });

      expect(connectedAccountRepo.listSharedAccountsForCompanyUnscoped).not.toHaveBeenCalled();
      expect(connectedAccountRepo.makeAccountPrivateUnscoped).not.toHaveBeenCalled();
      expect(eventService.publish).not.toHaveBeenCalled();
    });

    it("audits only the accounts it changed itself when another run already made one private", async () => {
      const { service, eventService } = setup([account({ id: "acc-1" }), account({ id: "acc-2" })], {
        makeAccountPrivateUnscoped: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      });

      await service.invoke({ companyId: "company-1", plan: "pro" });

      expect(eventService.publish).toHaveBeenCalledTimes(1);
      expect(eventService.publish.mock.calls[0][1].entityId).toBe("acc-2");
    });

    it("writes nothing when no account is shared", async () => {
      const { service, connectedAccountRepo, eventService } = setup([]);

      await service.invoke({ companyId: "company-1", plan: "pro" });

      expect(connectedAccountRepo.makeAccountPrivateUnscoped).not.toHaveBeenCalled();
      expect(eventService.publish).not.toHaveBeenCalled();
    });
  });
});
