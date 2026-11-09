import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";
import { createZodError } from "@/core/validation/validation.utils";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { ApplyOnboardingPlaybookInteractor } from "../apply-onboarding-playbook.interactor";

const owner = { ...createMockUser({ onboardingWikiStepCompletedAt: null }), company: { slug: "atlas-studio" } };
const REDIRECT = "/w/atlas-studio/settings/channels?from=onboarding";
const PAGE_IDS = [
  "0b4c6a52-3d1e-4f7a-8b2c-9d0e1f2a3b41",
  "0b4c6a52-3d1e-4f7a-8b2c-9d0e1f2a3b42",
  "0b4c6a52-3d1e-4f7a-8b2c-9d0e1f2a3b43",
  "0b4c6a52-3d1e-4f7a-8b2c-9d0e1f2a3b44",
];

type CreateCall = { pages: Array<{ title: string; kind?: string; markdown: string }>; requireEmpty: boolean };

describe("ApplyOnboardingPlaybookInteractor", () => {
  let createPages: { invoke: ReturnType<typeof vi.fn> };
  let setupStep: { markOnboardingSetupStepCompleted: ReturnType<typeof vi.fn> };
  let wizard: { markOnboardingWizardCompleted: ReturnType<typeof vi.fn> };
  let routeGuardService: { resolveAccountState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    let next = 0;
    createPages = {
      invoke: vi.fn(({ pages }: CreateCall) =>
        Promise.resolve({ ok: true, data: pages.map((page) => ({ ...page, id: PAGE_IDS[next++] })) }),
      ),
    };
    setupStep = { markOnboardingSetupStepCompleted: vi.fn().mockResolvedValue(undefined) };
    wizard = { markOnboardingWizardCompleted: vi.fn().mockResolvedValue(undefined) };
    routeGuardService = { resolveAccountState: vi.fn().mockResolvedValue({ state: "onboarding", user: owner }) };
  });

  const interactor = () =>
    new ApplyOnboardingPlaybookInteractor(
      createPages as never,
      setupStep as never,
      wizard as never,
      routeGuardService as never,
    );
  const calls = () => createPages.invoke.mock.calls.map(([call]) => call as CreateCall);

  it("writes the playbook pages into an empty Knowledge Base, links them from a guide and finishes onboarding", async () => {
    await expect(interactor().invoke({ playbook: "consultants", locale: "de" })).resolves.toEqual({
      ok: true,
      data: { playbook: "consultants", pagesWritten: 4, redirectTo: REDIRECT },
    });

    const [pages, guide] = calls();
    expect(pages.requireEmpty).toBe(true);
    expect(pages.pages.map((page) => [page.title, page.kind])).toEqual([
      ["Vertriebs-Playbook", "knowledge"],
      ["Tonalität", "knowledge"],
      ["Regeln zum Nachfassen", "procedure"],
    ]);
    expect(guide.requireEmpty).toBe(false);
    expect(guide.pages).toHaveLength(1);
    expect(guide.pages[0]).toMatchObject({ title: "Betriebsleitfaden", kind: "guide" });
    expect(guide.pages[0].markdown).toContain(`/wiki?page=${PAGE_IDS[0]}`);
    expect(guide.pages[0].markdown).toContain("Beratung");
    expect(setupStep.markOnboardingSetupStepCompleted).toHaveBeenCalledExactlyOnceWith({ userId: owner.id });
    expect(wizard.markOnboardingWizardCompleted).toHaveBeenCalledExactlyOnceWith({ userId: owner.id });
  });

  it("finishes onboarding without writing when the owner skips the playbook", async () => {
    await expect(interactor().invoke({ playbook: null, locale: "en" })).resolves.toEqual({
      ok: true,
      data: { playbook: null, pagesWritten: 0, redirectTo: REDIRECT },
    });
    expect(createPages.invoke).not.toHaveBeenCalled();
    expect(wizard.markOnboardingWizardCompleted).toHaveBeenCalledOnce();
  });

  it("keeps an existing Knowledge Base untouched and still finishes onboarding", async () => {
    createPages.invoke.mockResolvedValueOnce({
      ok: false,
      error: createZodError("not empty", [], { error: "wikiNotEmpty" }),
    });

    await expect(interactor().invoke({ playbook: "smb", locale: "en" })).resolves.toEqual({
      ok: true,
      data: { playbook: "smb", pagesWritten: 0, redirectTo: REDIRECT },
    });
    expect(createPages.invoke).toHaveBeenCalledOnce();
    expect(wizard.markOnboardingWizardCompleted).toHaveBeenCalledOnce();
  });

  it("counts the pages but not the guide when a guide already exists", async () => {
    createPages.invoke
      .mockResolvedValueOnce({ ok: true, data: PAGE_IDS.slice(0, 3).map((id) => ({ id, title: id })) })
      .mockResolvedValueOnce({ ok: false, error: createZodError("guide", [], { error: "wikiGuideExists" }) });

    await expect(interactor().invoke({ playbook: "agencies", locale: "en" })).resolves.toMatchObject({
      ok: true,
      data: { pagesWritten: 3 },
    });
  });

  it("stays in onboarding when the pages cannot be written", async () => {
    const failure = { ok: false, error: createZodError("denied", [], { error: "permissionDenied" }) };
    createPages.invoke.mockResolvedValueOnce(failure);

    await expect(interactor().invoke({ playbook: "freelancers", locale: "en" })).resolves.toBe(failure);
    expect(setupStep.markOnboardingSetupStepCompleted).not.toHaveBeenCalled();
    expect(wizard.markOnboardingWizardCompleted).not.toHaveBeenCalled();
  });

  it("rejects an unknown playbook or locale without writing", async () => {
    await expect(interactor().invoke({ playbook: "crm", locale: "en" } as never)).resolves.toMatchObject({ ok: false });
    await expect(interactor().invoke({ playbook: "smb", locale: "xx" } as never)).resolves.toMatchObject({ ok: false });
    expect(createPages.invoke).not.toHaveBeenCalled();
    expect(routeGuardService.resolveAccountState).not.toHaveBeenCalled();
  });

  it("redirects invited members without writing", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({
      state: "onboarding",
      user: createMockUserWithPermissions([]),
    });

    await expect(interactor().invoke({ playbook: "smb", locale: "en" })).resolves.toEqual({ redirect: "/" });
    expect(createPages.invoke).not.toHaveBeenCalled();
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "onboarding"))(
    "redirects the %s state without writing",
    async (state) => {
      routeGuardService.resolveAccountState.mockResolvedValue({ state, user: owner });
      await expect(interactor().invoke({ playbook: "smb", locale: "en" })).resolves.toEqual({
        redirect: accountStateRedirect(state) ?? "/",
      });
      expect(createPages.invoke).not.toHaveBeenCalled();
    },
  );
});
