import type * as CapabilitiesModule from "@/core/capabilities/capabilities";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/capabilities/capabilities", async (importOriginal) => {
  const original = await importOriginal<typeof CapabilitiesModule>();
  return { ...original, SHIPPED_CAPABILITIES: new Set(original.CAPABILITIES) };
});

import { loadTemplateBundle } from "@/core/templates/template-bundle-loader";

import { GetOnboardingTemplatePromptInteractor } from "../get-onboarding-template-prompt.interactor";

const owner = createMockUser({ onboardingWizardCompletedAt: null, companyId: "6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f" });
const env = MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted"; BASE_URL: string };

describe("GetOnboardingTemplatePromptInteractor", () => {
  let routeGuardService: { resolveAccountState: ReturnType<typeof vi.fn> };
  let loadBundle: ReturnType<typeof vi.fn>;
  let agentStatus: { findOnboardingAgentStatus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    env.APP_MODE = "cloud";
    env.BASE_URL = "https://app.example.test";
    routeGuardService = { resolveAccountState: vi.fn().mockResolvedValue({ state: "onboarding", user: owner }) };
    loadBundle = vi.fn(loadTemplateBundle);
    agentStatus = { findOnboardingAgentStatus: vi.fn().mockResolvedValue({ connected: true, schemaRevision: 2 }) };
  });

  const interactor = () =>
    new GetOnboardingTemplatePromptInteractor(loadBundle as never, routeGuardService as never, agentStatus as never);

  it("renders the prompt of the chosen template for this workspace in the user's language", async () => {
    const result = await interactor().invoke({ slug: "sales-pipeline", locale: "de" });

    expect(result).toMatchObject({ ok: true });
    const prompt = (result as { data: { prompt: string } }).data.prompt;
    expect(prompt).toContain("## 1. Dein Workspace");
    expect(prompt).not.toContain("## 1. Your workspace");
    expect(prompt).not.toContain("?template=");
    expect(prompt).toContain("https://app.example.test/api/v1/mcp/w/6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f");
    expect(loadBundle).toHaveBeenCalledExactlyOnceWith("sales-pipeline");
  });

  it("says the assistant is connected only once its first call reached the workspace", async () => {
    const connected = await interactor().invoke({ slug: "sales-pipeline", locale: "en" });
    expect(connected).toMatchObject({ ok: true, data: { connected: true } });
    expect((connected as { data: { prompt: string } }).data.prompt).toContain("you are connected to it through MCP");

    agentStatus.findOnboardingAgentStatus.mockResolvedValue({ connected: false, schemaRevision: 2 });
    const later = await interactor().invoke({ slug: "sales-pipeline", locale: "en" });
    expect(later).toMatchObject({ ok: true, data: { connected: false } });
    const prompt = (later as { data: { prompt: string } }).data.prompt;
    expect(prompt).toContain("your assistant is not connected to it yet");
    expect(prompt).not.toContain("you are connected");
    expect(prompt).toContain("https://app.example.test/api/v1/mcp/w/6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f");
  });

  it("writes the self-hosted variant on a self-hosted instance without any cloud sign-up", async () => {
    env.APP_MODE = "self-hosted";

    const result = await interactor().invoke({ slug: "sales-pipeline", locale: "en" });

    const prompt = (result as { data: { prompt: string } }).data.prompt;
    expect(prompt).toContain("## 1. Your workspace");
    expect(prompt).not.toContain("signup");
  });

  it("answers without a prompt for a template that is not offered on this deployment", async () => {
    env.APP_MODE = "self-hosted";

    await expect(interactor().invoke({ slug: "real-estate-pipeline", locale: "en" })).resolves.toEqual({
      ok: true,
      data: { prompt: null, connected: false },
    });
    expect(loadBundle).not.toHaveBeenCalled();
    expect(agentStatus.findOnboardingAgentStatus).not.toHaveBeenCalled();
  });

  it("answers without a prompt when the bundle cannot be loaded", async () => {
    loadBundle.mockResolvedValue(null);

    await expect(interactor().invoke({ slug: "sales-pipeline", locale: "en" })).resolves.toEqual({
      ok: true,
      data: { prompt: null, connected: false },
    });
  });

  it("rejects a slug that is not in the library and a locale that is not an app locale", async () => {
    expect(await interactor().invoke({ slug: "../../secret", locale: "en" } as never)).toMatchObject({ ok: false });
    expect(await interactor().invoke({ slug: "sales-pipeline", locale: "xx" } as never)).toMatchObject({ ok: false });
    expect(loadBundle).not.toHaveBeenCalled();
  });

  it("redirects invited members and visitors without a session", async () => {
    routeGuardService.resolveAccountState.mockResolvedValue({
      state: "onboarding",
      user: createMockUserWithPermissions([]),
    });
    await expect(interactor().invoke({ slug: "sales-pipeline", locale: "en" })).resolves.toEqual({ redirect: "/" });

    routeGuardService.resolveAccountState.mockResolvedValue({ state: "onboarding", user: null });
    await expect(interactor().invoke({ slug: "sales-pipeline", locale: "en" })).resolves.toEqual({
      redirect: "/auth/signin",
    });
    expect(loadBundle).not.toHaveBeenCalled();
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "onboarding"))("redirects the %s state", async (state) => {
    routeGuardService.resolveAccountState.mockResolvedValue({ state, user: owner });

    await expect(interactor().invoke({ slug: "sales-pipeline", locale: "en" })).resolves.toEqual({
      redirect: accountStateRedirect(state) ?? "/",
    });
    expect(loadBundle).not.toHaveBeenCalled();
  });
});
