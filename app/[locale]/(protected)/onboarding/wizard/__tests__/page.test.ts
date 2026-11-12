import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetupStatus: vi.fn(),
  requireAccountState: vi.fn(),
  resolveOnboardingIntent: vi.fn(),
  getProgress: vi.fn(),
  listWorkspaces: vi.fn(),
  getJobChoice: vi.fn(),
  getTemplateChoice: vi.fn(),
  offeredTemplateCards: vi.fn(),
  preselectOnboardingTemplate: vi.fn(),
  env: { APP_MODE: "cloud" as "cloud" | "self-hosted" | "demo" },
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/features/onboarding-templates/onboarding-template-offer", () => ({
  offeredTemplateCards: mocks.offeredTemplateCards,
  preselectOnboardingTemplate: mocks.preselectOnboardingTemplate,
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
  getListMyWorkspacesInteractor: () => ({ invoke: mocks.listWorkspaces }),
  getGetOnboardingJobChoiceInteractor: () => ({ invoke: mocks.getJobChoice }),
  getGetOnboardingTemplateChoiceInteractor: () => ({ invoke: mocks.getTemplateChoice }),
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
    mocks.getJobChoice.mockResolvedValue({
      ok: true,
      data: { selectedJob: null, signupJob: "agent", preselectedJob: "agent" },
    });
    mocks.env.APP_MODE = "cloud";
    mocks.getTemplateChoice.mockResolvedValue({
      ok: true,
      data: { signupTemplate: null, signupLandingPath: null },
    });
    mocks.offeredTemplateCards.mockReturnValue([]);
    mocks.preselectOnboardingTemplate.mockReturnValue({ slug: null, reason: null });
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

  it("names the invited workspace for a new login that follows an invitation", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      companyId: "company-a",
      companyName: "Bergmann Steuern",
      intent: "signed.invite",
      inviterName: "Invite Admin",
      status: "valid",
      type: "invitation",
    });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "user-a", email: "new@example.com", companyId: null },
      user: null,
    });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({ intent: "signed.invite" }) });

    expect(page.props.children.props).toMatchObject({
      inviterName: "Invite Admin",
      isInvited: true,
      workspaceName: "Bergmann Steuern",
    });
  });

  function registeredOwner(onboardingWikiStepCompletedAt: Date | null) {
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "user-a", email: "owner@example.com", companyId: "company-a" },
      user: { companyId: "company-a", role: { isSystemRole: true }, onboardingWikiStepCompletedAt },
    });
  }

  it("reads what the owner wants to do first while the setup step is open", async () => {
    registeredOwner(null);

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(page.props.children.props).toMatchObject({
      setupStepCompleted: false,
      jobChoice: { selectedJob: null, signupJob: "agent", preselectedJob: "agent" },
    });
  });

  it("still reads the owner's choice once the setup step is completed, so a reload resumes the same flow", async () => {
    registeredOwner(new Date("2026-01-01T00:00:00.000Z"));

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(page.props.children.props.jobChoice).toMatchObject({ signupJob: "agent" });
    expect(mocks.getJobChoice).toHaveBeenCalledOnce();
  });

  it("reads no choice for an invited member and in the demo", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({ status: "absent" });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "user-a", email: "member@example.com", companyId: "company-a" },
      user: { companyId: "company-a", role: { isSystemRole: false }, onboardingWikiStepCompletedAt: null },
    });
    const invited = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });
    expect(invited.props.children.props).toMatchObject({ templates: [] });
    expect(mocks.getJobChoice).not.toHaveBeenCalled();
    expect(mocks.offeredTemplateCards).not.toHaveBeenCalled();

    mocks.env.APP_MODE = "demo";
    mocks.getSetupStatus.mockResolvedValue({ ok: true, data: { available: false, reason: "demo", setup: null } });
    registeredOwner(null);
    const demo = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });
    expect(demo.props.children.props.jobChoice).toBeUndefined();
    expect(demo.props.children.props).toMatchObject({ setupStepCompleted: true, templates: [] });
    expect(mocks.getJobChoice).not.toHaveBeenCalled();
  });

  it("offers the templates of the language and the cloud, and preselects from the signup", async () => {
    registeredOwner(null);
    const cards = [{ slug: "client-tracker", name: "Client tracker" }];
    mocks.offeredTemplateCards.mockReturnValue(cards);
    mocks.getTemplateChoice.mockResolvedValue({
      ok: true,
      data: { signupTemplate: "client-tracker", signupLandingPath: "/en/for/consultants" },
    });
    mocks.preselectOnboardingTemplate.mockReturnValue({ slug: "client-tracker", reason: "signup" });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(mocks.offeredTemplateCards).toHaveBeenCalledExactlyOnceWith({ locale: "en", deployment: "cloud" });
    expect(mocks.preselectOnboardingTemplate).toHaveBeenCalledExactlyOnceWith({
      cards,
      signupTemplate: "client-tracker",
      landingPath: "/en/for/consultants",
    });
    expect(page.props.children.props).toMatchObject({
      templates: cards,
      templatePreselection: { slug: "client-tracker", reason: "signup" },
    });
  });

  it("offers a self-hosted owner the choice with the templates a self-hosted instance can run", async () => {
    mocks.env.APP_MODE = "self-hosted";
    registeredOwner(null);
    mocks.getSetupStatus.mockResolvedValue({ ok: true, data: { available: false, reason: "selfHosted", setup: null } });

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(mocks.offeredTemplateCards).toHaveBeenCalledWith({ locale: "en", deployment: "self-hosted" });
    expect(page.props.children.props).toMatchObject({ setupStepCompleted: false });
    expect(page.props.children.props.jobChoice).toBeDefined();
  });

  it("offers the templates before the profile exists, without a stored choice", async () => {
    mocks.resolveOnboardingIntent.mockResolvedValue({
      type: "createCompany",
      authUserId: "user-a",
      intent: "signed.create",
      status: "valid",
    });
    mocks.requireAccountState.mockResolvedValue({
      sessionUser: { id: "user-a", email: "owner@example.com", companyId: null },
      user: null,
    });
    mocks.offeredTemplateCards.mockReturnValue([{ slug: "client-tracker" }]);

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({ intent: "signed.create" }) });

    expect(page.props.children.props).toMatchObject({ templates: [{ slug: "client-tracker" }], profileCompleted: false });
    expect(mocks.getTemplateChoice).not.toHaveBeenCalled();
  });

  it("skips the setup step only after the owner completed it", async () => {
    registeredOwner(new Date("2026-01-01T00:00:00.000Z"));

    const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

    expect(page.props.children.props).toMatchObject({ profileCompleted: true, setupStepCompleted: true });
  });

  it.each(["selfHosted", "configured"])(
    "lets the owner choose how to set up even where Mate's setup is unavailable (%s)",
    async (reason) => {
      registeredOwner(null);
      const unavailable = { available: false, reason, setup: null };
      mocks.getSetupStatus.mockResolvedValue({ ok: true, data: unavailable });

      const page = await OnboardingWizardPage({ searchParams: Promise.resolve({}) });

      expect(page.props.children.props).toMatchObject({
        profileCompleted: true,
        setupStatus: unavailable,
        setupStepCompleted: false,
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

  function memberOf(...workspaces: Array<{ companyId: string; isCurrent: boolean; status?: string }>) {
    mocks.listWorkspaces.mockResolvedValue({
      ok: true,
      data: workspaces.map((workspace) => ({
        name: `Workspace ${workspace.companyId}`,
        slug: `workspace-${workspace.companyId}`,
        status: "active",
        ...workspace,
      })),
    });
  }

  it("opens the setup in the workspace a setup email names, under that workspace's URL", async () => {
    memberOf({ companyId: "company-a", isCurrent: true }, { companyId: "company-b", isCurrent: false });

    await expect(OnboardingWizardPage({ searchParams: Promise.resolve({ workspace: "company-b" }) })).rejects.toThrow(
      "REDIRECT:/en/w/workspace-company-b/onboarding/wizard",
    );
    expect(mocks.requireAccountState).not.toHaveBeenCalled();
  });

  it("drops the workspace from the link when it already names the workspace this page shows", async () => {
    memberOf({ companyId: "company-a", isCurrent: true });

    await expect(OnboardingWizardPage({ searchParams: Promise.resolve({ workspace: "company-a" }) })).rejects.toThrow(
      "REDIRECT:/en/w/workspace-company-a/onboarding/wizard",
    );
  });

  it.each([
    { name: "no longer belongs to", workspaces: [{ companyId: "company-a", isCurrent: true }] },
    {
      name: "only asked to join",
      workspaces: [{ companyId: "company-b", isCurrent: false, status: "pendingAuthorization" }],
    },
  ])("sends someone who $name the linked workspace home instead of into another setup", async ({ workspaces }) => {
    memberOf(...workspaces);

    await expect(OnboardingWizardPage({ searchParams: Promise.resolve({ workspace: "company-b" }) })).rejects.toThrow(
      "REDIRECT:/en/dashboard",
    );
  });
});
