import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAccountState: vi.fn(),
  getMcpConsentPrompt: vi.fn(),
  listMcpConsentWorkspaces: vi.fn(),
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
  getListMcpConsentWorkspacesInteractor: () => ({ invoke: mocks.listMcpConsentWorkspaces }),
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
const current = { companyId: "company-a", name: "CRM", isCurrent: true, unavailableReason: null };
const taxes = { companyId: "company-b", name: "Taxes", isCurrent: false, unavailableReason: null };

describe("McpConsentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAccountState.mockResolvedValue({ state: "onboarding" });
    mocks.getMcpConsentPrompt.mockResolvedValue(prompt);
    mocks.resolveMcpConsentState.mockImplementation((resolution: { state: string }) =>
      Promise.resolve(resolution.state),
    );
    mocks.listMcpConsentWorkspaces.mockResolvedValue({ ok: true, data: [current, taxes] });
  });

  it.each(["allowed", "onboarding"])("renders the validated consent prompt for %s", async (state) => {
    mocks.resolveAccountState.mockResolvedValue({ state });

    const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

    expect(result.props.children.props).toEqual({
      ...prompt,
      consentCode: params.consent_code,
      workspaces: [current, taxes],
    });
    expect(mocks.getMcpConsentPrompt).toHaveBeenCalledWith({
      consentCode: params.consent_code,
      clientId: params.client_id,
    });
  });

  it("still lets a member without API access deny the request for the current workspace", async () => {
    mocks.resolveAccountState.mockResolvedValue({ state: "allowed" });
    mocks.listMcpConsentWorkspaces.mockResolvedValue({
      ok: true,
      data: [{ ...current, unavailableReason: "permission" }],
    });

    const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

    expect(result.props.children.props.workspaces).toEqual([{ ...current, unavailableReason: "permission" }]);
  });

  it.each(["inactive", "pending", "legal", "subscription"])(
    "offers the other workspaces when the current workspace is %s",
    async (state) => {
      const restricted = { ...current, unavailableReason: state === "subscription" ? "plan" : "pending" };
      mocks.resolveAccountState.mockResolvedValue({ state });
      mocks.listMcpConsentWorkspaces.mockResolvedValue({ ok: true, data: [restricted, taxes] });

      const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

      expect(result.props.children.props.workspaces).toEqual([restricted, taxes]);
      expect(mocks.getMcpConsentPrompt).toHaveBeenCalledOnce();
    },
  );

  it.each(ACCOUNT_STATES.filter((state) => state !== "allowed" && state !== "onboarding"))(
    "keeps the canonical redirect for %s when no other workspace can be connected",
    async (state) => {
      mocks.resolveAccountState.mockResolvedValue({ state });
      mocks.listMcpConsentWorkspaces.mockResolvedValue({
        ok: true,
        data: [
          { ...current, unavailableReason: "pending" },
          { ...taxes, unavailableReason: "permission" },
        ],
      });

      await expect(McpConsentPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        `REDIRECT:/en${accountStateRedirect(state)}`,
      );
      expect(mocks.getMcpConsentPrompt).not.toHaveBeenCalled();
    },
  );

  it.each(["unauthenticated", "overdueVerification", "unregistered"] as const)(
    "redirects the %s state before listing workspaces",
    async (state) => {
      mocks.resolveAccountState.mockResolvedValue({ state });

      await expect(McpConsentPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        `REDIRECT:/en${accountStateRedirect(state)}`,
      );
      expect(mocks.listMcpConsentWorkspaces).not.toHaveBeenCalled();
    },
  );

  it.each(["legal", "subscription"])(
    "sends onboarding back to the wizard when the workspace would otherwise be in the %s state",
    async (blocked) => {
      mocks.resolveMcpConsentState.mockResolvedValue(blocked);
      mocks.listMcpConsentWorkspaces.mockResolvedValue({
        ok: true,
        data: [{ ...current, unavailableReason: blocked === "legal" ? "terms" : "plan" }],
      });

      await expect(McpConsentPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        `REDIRECT:/en${accountStateRedirect("onboarding")}`,
      );
      expect(mocks.getMcpConsentPrompt).not.toHaveBeenCalled();
    },
  );

  it("lets blocked onboarding connect another workspace", async () => {
    mocks.resolveMcpConsentState.mockResolvedValue("subscription");
    mocks.listMcpConsentWorkspaces.mockResolvedValue({
      ok: true,
      data: [{ ...current, unavailableReason: "plan" }, taxes],
    });

    const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

    expect(result.props.children.props.workspaces).toEqual([{ ...current, unavailableReason: "plan" }, taxes]);
  });

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
