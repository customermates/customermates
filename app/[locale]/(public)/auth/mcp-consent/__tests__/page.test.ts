import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAccountState: vi.fn(),
  getMcpConsentPrompt: vi.fn(),
  resolveMcpConsentState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));
vi.mock("@sentry/nextjs", () => ({}));
vi.mock("@/core/di", () => ({
  getAuthService: () => ({ getMcpConsentPrompt: mocks.getMcpConsentPrompt }),
  getRouteGuardService: () => ({ resolveMcpConsentState: mocks.resolveMcpConsentState }),
}));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveAccountState,
}));
vi.mock("@/components/shared/centered-card-page", () => ({ CenteredCardPage: "centered-card-page" }));
vi.mock("../mcp-consent-card", () => ({ McpConsentCard: "mcp-consent-card" }));

import McpConsentPage from "../page";
import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";

const params = { consent_code: "consent-code", client_id: "client-id" };
const prompt = { clientName: "Claude", redirectHost: "client.example", scopes: ["openid", "profile"] };

describe("McpConsentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAccountState.mockResolvedValue({ state: "onboarding" });
    mocks.getMcpConsentPrompt.mockResolvedValue(prompt);
    mocks.resolveMcpConsentState.mockImplementation((resolution: { state: string }) =>
      Promise.resolve(resolution.state),
    );
  });

  it.each(["allowed", "onboarding"])("renders the validated consent prompt for %s", async (state) => {
    mocks.resolveAccountState.mockResolvedValue({ state });

    const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

    expect(result.props.children.props).toEqual({ ...prompt, consentCode: params.consent_code });
    expect(mocks.getMcpConsentPrompt).toHaveBeenCalledWith({
      consentCode: params.consent_code,
      clientId: params.client_id,
    });
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "allowed" && state !== "onboarding"))(
    "keeps the canonical redirect for %s",
    async (state) => {
      mocks.resolveAccountState.mockResolvedValue({ state });

      await expect(McpConsentPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        `REDIRECT:/en${accountStateRedirect(state)}`,
      );
      expect(mocks.getMcpConsentPrompt).not.toHaveBeenCalled();
    },
  );

  it.each(["legal", "subscription"])(
    "sends onboarding back to the wizard when the workspace would otherwise be in the %s state",
    async (blocked) => {
      mocks.resolveMcpConsentState.mockResolvedValue(blocked);

      await expect(McpConsentPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        `REDIRECT:/en${accountStateRedirect("onboarding")}`,
      );
      expect(mocks.getMcpConsentPrompt).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { client_id: "client-id" },
    { consent_code: "consent-code" },
    { ...params, consent_code: ["one", "two"] },
    { ...params, client_id: ["one", "two"] },
  ])("rejects incomplete or ambiguous consent parameters %#", async (searchParams) => {
    await expect(McpConsentPage({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow("REDIRECT:/");
    expect(mocks.getMcpConsentPrompt).not.toHaveBeenCalled();
  });

  it("rejects an expired, mismatched or already-used consent prompt", async () => {
    mocks.getMcpConsentPrompt.mockResolvedValue(null);

    await expect(McpConsentPage({ searchParams: Promise.resolve(params) })).rejects.toThrow("REDIRECT:/");
  });
});
