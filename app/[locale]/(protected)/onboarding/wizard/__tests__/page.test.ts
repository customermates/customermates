import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAgentEntitlement: vi.fn(),
  getWikiPages: vi.fn(),
  requireAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn().mockResolvedValue("en") }));
vi.mock("@/features/auth/next/require", () => ({ requireAccountState: mocks.requireAccountState }));
vi.mock("@/core/di", () => ({
  getEntitlementService: () => ({ require: mocks.requireAgentEntitlement }),
  getGetWikiPagesInteractor: () => ({ invoke: mocks.getWikiPages }),
}));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: "centered-card-page" }));
vi.mock("../components/onboarding-wizard", () => ({ OnboardingWizard: "onboarding-wizard" }));

import OnboardingWizardPage from "../page";

describe("OnboardingWizardPage authentication detours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWikiPages.mockResolvedValue({ ok: true, data: { items: [], total: 0, page: 1, pageSize: 5 } });
    mocks.requireAgentEntitlement.mockResolvedValue(null);
  });

  it.each([
    {
      name: "registered creator",
      user: { companyId: "company-a", role: { isSystemRole: true } },
      intent: null,
      isInvited: false,
    },
    {
      name: "registered invitee",
      user: { companyId: "company-a", role: { isSystemRole: false } },
      intent: null,
      isInvited: true,
    },
    { name: "explicit invitee", user: null, intent: { type: "invitation", intent: "signed.invite" }, isInvited: true },
    { name: "pre-tenant binding", user: null, intent: null, isInvited: true },
    {
      name: "explicit creator with an old binding",
      user: null,
      intent: { type: "createCompany", authUserId: "user-a", intent: "signed.create" },
      isInvited: false,
    },
  ])("uses the correct progress presentation for a $name", async ({ user, intent, isInvited }) => {
    mocks.resolveOnboardingIntent.mockResolvedValue(intent ? { ...intent, status: "valid" } : { status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "user-a", email: "owner@example.com", companyId: "company-a" },
      user,
    });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(page.props.children.props).toMatchObject({
      canSetupWithMate: Boolean(user?.role?.isSystemRole),
      isInvited,
      profileCompleted: Boolean(user),
    });
  });

  it("skips the Wiki step after an owner already has pages", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "user-a", email: "owner@example.com", companyId: "company-a" },
      user: { companyId: "company-a", role: { isSystemRole: true } },
    });
    mocks.getWikiPages.mockResolvedValue({ ok: true, data: { items: [], total: 5, page: 1, pageSize: 5 } });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(page.props.children.props).toMatchObject({ profileCompleted: true, wikiCompleted: true });
  });

  it("does not offer setup when the owner's Agent entitlement is unavailable", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "user-a", email: "owner@example.com", companyId: "company-a" },
      user: { companyId: "company-a", role: { isSystemRole: true } },
    });
    mocks.requireAgentEntitlement.mockResolvedValue({ ok: false });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(page.props.children.props.canSetupWithMate).toBe(false);
  });

  it("preserves an invitation when a cached session loses its identity", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      companyId: "company-a",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      intent: "signed.intent",
      inviterName: "Invite Admin",
      source: "explicit",
      status: "valid",
      token: "invite-a",
      type: "invitation",
    });
    mocks.requireAccountState.mockImplementation((_expected, _fallback, redirects) => {
      throw new Error(`REDIRECT:${redirects.unauthenticated}`);
    });

    await expect(OnboardingWizardPage({ searchParams: Promise.resolve({ intent: "signed.intent" }) })).rejects.toThrow(
      "REDIRECT:/auth/signin?intent=signed.intent",
    );
    expect(mocks.requireAccountState).toHaveBeenCalledWith(
      ["unregistered", "onboarding"],
      "/",
      expect.objectContaining({ unauthenticated: "/auth/signin?intent=signed.intent" }),
    );
  });
});
