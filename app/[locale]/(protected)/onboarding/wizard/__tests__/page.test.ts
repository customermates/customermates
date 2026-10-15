import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetupStatus: vi.fn(),
  requireAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
  getProgress: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
}));
vi.mock("@/features/auth/next/require", () => ({
  requireAccountState: mocks.requireAccountState,
}));
vi.mock("@/core/di", () => ({
  getGetOnboardingWizardProgressInteractor: () => ({ invoke: mocks.getProgress }),
  getGetWorkspaceSetupStatusInteractor: () => ({ invoke: mocks.getSetupStatus }),
}));
vi.mock("@/features/company/next/onboarding-intent", () => ({
  resolveOnboardingIntent: mocks.resolveOnboardingIntent,
}));
vi.mock("@/components/shared/centered-card-page", () => ({
  CenteredCardPage: "centered-card-page",
}));
vi.mock("../components/onboarding-wizard", () => ({
  OnboardingWizard: "onboarding-wizard",
}));

import OnboardingWizardPage from "../page";

describe("OnboardingWizardPage authentication detours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSetupStatus.mockResolvedValue({ ok: true, data: { available: true, setup: null } });
    mocks.getProgress.mockResolvedValue({ ok: true, data: { step: "invite", inviteTab: "link" } });
  });

  it("passes the saved AI setup and owner identity to a fresh wizard render", async () => {
    const progress = { step: "ai", inviteTab: "email", ai: { route: { screen: "claude" }, claudeMethod: "account" } };
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "auth-a" },
      user: {
        id: "owner-a",
        companyId: "company-a",
        role: { isSystemRole: true },
        onboardingWikiStepCompletedAt: new Date(),
      },
    });
    mocks.getProgress.mockResolvedValue({ ok: true, data: progress });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });
    expect(page.props.children.props).toMatchObject({
      savedProgress: progress,
      userId: "owner-a",
      profileCompleted: true,
    });
  });

  it("neither reads nor writes saved progress for a registered member without a system role", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "auth-b", companyId: "company-a" },
      user: { id: "member-b", companyId: "company-a", role: { isSystemRole: false } },
    });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(mocks.getProgress).not.toHaveBeenCalled();
    expect(page.props.children.props).toMatchObject({ userId: undefined, savedProgress: undefined });
  });

  it.each([
    {
      name: "registered creator",
      user: {
        companyId: "company-a",
        role: { isSystemRole: true },
        onboardingWikiStepCompletedAt: null,
      },
      intent: null,
      isInvited: false,
    },
    {
      name: "registered invitee",
      user: {
        companyId: "company-a",
        role: { isSystemRole: false },
        onboardingWikiStepCompletedAt: null,
      },
      intent: null,
      isInvited: true,
    },
    {
      name: "explicit invitee",
      user: null,
      intent: { type: "invitation", intent: "signed.invite" },
      isInvited: true,
    },
    { name: "pre-tenant binding", user: null, intent: null, isInvited: true },
    {
      name: "explicit creator with an old binding",
      user: null,
      intent: {
        type: "createCompany",
        authUserId: "user-a",
        intent: "signed.create",
      },
      isInvited: false,
    },
  ])("uses the correct progress presentation for a $name", async ({ user, intent, isInvited }) => {
    mocks.resolveOnboardingIntent.mockResolvedValue(intent ? { ...intent, status: "valid" } : { status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: {
        id: "user-a",
        email: "owner@example.com",
        companyId: "company-a",
      },
      user,
    });

    const page = await OnboardingWizardPage({
      searchParams: Promise.resolve({}),
    });

    expect(page.props.children.props).toMatchObject({
      setupStatus: user?.role?.isSystemRole ? { available: true, setup: null } : undefined,
      isInvited,
      profileCompleted: Boolean(user),
    });
  });

  function registeredOwner(onboardingWikiStepCompletedAt: Date | null) {
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "user-a", email: "owner@example.com", companyId: "company-a" },
      user: { companyId: "company-a", role: { isSystemRole: true }, onboardingWikiStepCompletedAt },
    });
  }

  it("skips the setup step only after the owner completed it", async () => {
    registeredOwner(new Date("2026-01-01T00:00:00.000Z"));

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(page.props.children.props).toMatchObject({ profileCompleted: true, setupStepCompleted: true });
  });

  it.each(["selfHosted", "configured"])(
    "never waits on the setup step where it is unavailable (%s)",
    async (reason) => {
      registeredOwner(null);
      const unavailable = { available: false, reason, setup: null };
      mocks.getSetupStatus.mockResolvedValue({ ok: true, data: unavailable });

      const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

      expect(page.props.children.props).toMatchObject({
        profileCompleted: true,
        setupStatus: unavailable,
        setupStepCompleted: true,
      });
    },
  );

  it("restores a running setup from its persisted status after a refresh", async () => {
    registeredOwner(null);
    const building = { available: true, setup: { id: "setup-a", status: "building" } };
    mocks.getSetupStatus.mockResolvedValue({ ok: true, data: building });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(page.props.children.props).toMatchObject({
      profileCompleted: true,
      setupStepCompleted: false,
      setupStatus: building,
    });
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

    await expect(
      OnboardingWizardPage({
        searchParams: Promise.resolve({ intent: "signed.intent" }),
      }),
    ).rejects.toThrow("REDIRECT:/auth/signin?intent=signed.intent");
    expect(mocks.requireAccountState).toHaveBeenCalledWith(
      ["unregistered", "onboarding"],
      "/",
      expect.objectContaining({
        unauthenticated: "/auth/signin?intent=signed.intent",
      }),
    );
  });
});
