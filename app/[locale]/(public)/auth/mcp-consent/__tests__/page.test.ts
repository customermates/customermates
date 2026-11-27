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
vi.mock("@/core/observability/server", () => ({}));
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
const prompt = {
  clientName: "Claude",
  redirectHost: "client.example",
  scopes: ["openid", "profile"],
  workspaceId: null,
};
const card = { clientName: "Claude", redirectHost: "client.example", scopes: ["openid", "profile"] };
const current = { companyId: "company-a", name: "CRM", roleName: "Admin", isCurrent: true, unavailableReason: null };
const taxes = { companyId: "company-b", name: "Taxes", roleName: "Sales", isCurrent: false, unavailableReason: null };

function account(workspaces: object[], termsRequired = false) {
  return { ok: true, data: { workspaces, termsOffered: termsRequired, termsRequired } };
}

describe("McpConsentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAccountState.mockResolvedValue({ state: "onboarding" });
    mocks.getMcpConsentPrompt.mockResolvedValue(prompt);
    mocks.resolveMcpConsentState.mockImplementation((resolution: { state: string }) =>
      Promise.resolve(resolution.state),
    );
    mocks.listMcpConsentWorkspaces.mockResolvedValue(account([current, taxes]));
  });

  it.each(["allowed", "onboarding"])("renders the account-wide consent prompt for %s", async (state) => {
    mocks.resolveAccountState.mockResolvedValue({ state });

    const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

    expect(result.props.children.props).toEqual({
      ...card,
      consentCode: params.consent_code,
      fixedWorkspace: false,
      termsOffered: false,
      termsRequired: false,
      workspaces: [current, taxes],
    });
    expect(mocks.getMcpConsentPrompt).toHaveBeenCalledWith({
      consentCode: params.consent_code,
      clientId: params.client_id,
    });
  });

  it("lets a login without any workspace authorize and passes the terms requirement on", async () => {
    mocks.resolveAccountState.mockResolvedValue({ state: "unregistered" });
    mocks.listMcpConsentWorkspaces.mockResolvedValue(account([], true));

    const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

    expect(result.props.children.props).toMatchObject({ fixedWorkspace: false, termsRequired: true, workspaces: [] });
  });

  it.each(["inactive", "pending", "legal", "subscription"])(
    "offers the account when the current workspace is %s but another one can be used",
    async (state) => {
      const restricted = { ...current, unavailableReason: state === "subscription" ? "plan" : "pending" };
      mocks.resolveAccountState.mockResolvedValue({ state });
      mocks.listMcpConsentWorkspaces.mockResolvedValue(account([restricted, taxes]));

      const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

      expect(result.props.children.props.workspaces).toEqual([restricted, taxes]);
    },
  );

  it.each(ACCOUNT_STATES.filter((state) => !["allowed", "onboarding", "unregistered"].includes(state)))(
    "keeps the canonical redirect for %s when no workspace can be used",
    async (state) => {
      mocks.resolveAccountState.mockResolvedValue({ state });
      mocks.listMcpConsentWorkspaces.mockResolvedValue(
        account([
          { ...current, unavailableReason: "pending" },
          { ...taxes, unavailableReason: "permission" },
        ]),
      );

      await expect(McpConsentPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        `REDIRECT:/en${accountStateRedirect(state)}`,
      );
    },
  );

  it.each(["unauthenticated", "overdueVerification"] as const)(
    "redirects the %s state before listing workspaces",
    async (state) => {
      mocks.resolveAccountState.mockResolvedValue({ state });

      await expect(McpConsentPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
        `REDIRECT:/en${accountStateRedirect(state)}`,
      );
      expect(mocks.listMcpConsentWorkspaces).not.toHaveBeenCalled();
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

  it("fixes the consent to the workspace named by an older per-workspace MCP URL", async () => {
    mocks.resolveAccountState.mockResolvedValue({ state: "allowed" });
    mocks.getMcpConsentPrompt.mockResolvedValue({ ...prompt, workspaceId: taxes.companyId });

    const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

    expect(result.props.children.props).toEqual({
      ...card,
      consentCode: params.consent_code,
      fixedWorkspace: true,
      termsOffered: false,
      termsRequired: false,
      workspaces: [taxes],
    });
  });

  it.each(["inactive", "pending", "legal", "subscription"])(
    "explains an older per-workspace MCP URL on the consent card instead of redirecting for %s",
    async (state) => {
      const blocked = { ...current, unavailableReason: "permission" };
      mocks.resolveAccountState.mockResolvedValue({ state });
      mocks.listMcpConsentWorkspaces.mockResolvedValue(account([blocked, { ...taxes, unavailableReason: "plan" }]));
      mocks.getMcpConsentPrompt.mockResolvedValue({ ...prompt, workspaceId: current.companyId });

      const result = await McpConsentPage({ searchParams: Promise.resolve(params) });

      expect(result.props.children.props).toMatchObject({ fixedWorkspace: true, workspaces: [blocked] });
    },
  );
});
