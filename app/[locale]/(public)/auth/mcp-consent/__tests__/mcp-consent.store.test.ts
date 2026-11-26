import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const authActions = vi.hoisted(() => ({ decideMcpConsentAction: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/app/[locale]/(public)/auth/actions", () => authActions);
vi.mock("sonner", () => ({ toast }));

import { McpConsentStore } from "../mcp-consent.store";

const rootStore = {
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;

const active = { unavailableReason: null, inactiveReason: null };
const crm = { companyId: "company-a", name: "CRM", roleName: "Admin", isCurrent: true, ...active };
const taxes = { companyId: "company-b", name: "Taxes", roleName: "Sales", isCurrent: false, ...active };
const waiting = {
  companyId: "company-c",
  name: null,
  roleName: null,
  isCurrent: false,
  unavailableReason: "pending" as const,
  inactiveReason: null,
};
const accountWide = { fixedWorkspace: false, termsRequired: false };
const redirect = { ok: true, data: { redirectURI: "https://client.example/callback" } };

describe("McpConsentStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the serialized redirect and keeps the submitting state for navigation", async () => {
    authActions.decideMcpConsentAction.mockResolvedValue(redirect);
    const store = new McpConsentStore(rootStore);
    store.initialize([crm, taxes], accountWide);

    await expect(store.decide("consent-code", true)).resolves.toBe("https://client.example/callback");

    expect(authActions.decideMcpConsentAction).toHaveBeenCalledWith({ consentCode: "consent-code", accept: true });
    expect(store.isSubmitting).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    ["blocked decision", { ok: true, data: null }],
    ["validation failure", { ok: false, error: { errors: ["invalid"] } }],
  ])("shows an error and resets submitting for a %s", async (_label, result) => {
    authActions.decideMcpConsentAction.mockResolvedValue(result);
    const store = new McpConsentStore(rootStore);

    await expect(store.decide("consent-code", false)).resolves.toBeNull();

    expect(store.isSubmitting).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("McpConsentCard.error", expect.any(Object));
  });

  it.each([
    ["one workspace", [crm], true],
    ["two workspaces", [crm, taxes], true],
    ["an account without any workspace", [], true],
    ["only workspaces that cannot be used", [waiting, { ...crm, unavailableReason: "permission" as const }], false],
  ])("approves the whole account for %s", (_label, workspaces, approvable) => {
    const store = new McpConsentStore(rootStore);
    store.initialize(workspaces, accountWide);

    expect(store.canApprove).toBe(approvable);
  });

  it("asks an account without a workspace to accept the terms before it can approve, and sends the acceptance", async () => {
    authActions.decideMcpConsentAction.mockResolvedValue(redirect);
    const store = new McpConsentStore(rootStore);
    store.initialize([], { fixedWorkspace: false, termsRequired: true });

    expect(store.canApprove).toBe(true);
    expect(store.canSubmitApproval).toBe(false);

    store.setTermsAccepted(true);
    expect(store.canSubmitApproval).toBe(true);

    await store.decide("consent-code", true);

    expect(authActions.decideMcpConsentAction).toHaveBeenCalledWith({
      consentCode: "consent-code",
      accept: true,
      acceptTerms: true,
    });
  });

  it("offers the terms to an account with workspaces without requiring them, and sends the answer", async () => {
    authActions.decideMcpConsentAction.mockResolvedValue(redirect);
    const store = new McpConsentStore(rootStore);
    store.initialize([crm], { fixedWorkspace: false, termsOffered: true, termsRequired: false });

    expect(store.termsOffered).toBe(true);
    expect(store.canSubmitApproval).toBe(true);

    await store.decide("consent-code", true);

    expect(authActions.decideMcpConsentAction).toHaveBeenCalledWith({
      consentCode: "consent-code",
      accept: true,
      acceptTerms: false,
    });
  });

  it("does not send a terms answer with a denial", async () => {
    authActions.decideMcpConsentAction.mockResolvedValue(redirect);
    const store = new McpConsentStore(rootStore);
    store.initialize([], { fixedWorkspace: false, termsRequired: true });

    await store.decide("consent-code", false);

    expect(authActions.decideMcpConsentAction).toHaveBeenCalledWith({ consentCode: "consent-code", accept: false });
  });

  it("keeps the fixed workspace of an older per-workspace URL approvable only while it can be used", () => {
    const store = new McpConsentStore(rootStore);
    store.initialize([taxes], { fixedWorkspace: true, termsRequired: true });

    expect(store.canApprove).toBe(true);
    expect(store.termsRequired).toBe(false);

    store.initialize([{ ...taxes, unavailableReason: "plan" }], { fixedWorkspace: true, termsRequired: false });
    expect(store.canApprove).toBe(false);

    store.initialize([], { fixedWorkspace: true, termsRequired: false });
    expect(store.canApprove).toBe(false);
  });

  it("does not change the terms answer while a decision is submitting", async () => {
    let resolveDecision: (value: unknown) => void = () => undefined;
    authActions.decideMcpConsentAction.mockReturnValue(
      new Promise((resolve) => {
        resolveDecision = resolve;
      }),
    );
    const store = new McpConsentStore(rootStore);
    store.initialize([], { fixedWorkspace: false, termsRequired: true });
    store.setTermsAccepted(true);

    const decision = store.decide("consent-code", true);
    store.setTermsAccepted(false);

    expect(store.termsAccepted).toBe(true);
    resolveDecision(redirect);
    await decision;
  });

  it("shows an error and resets submitting when the action rejects", async () => {
    authActions.decideMcpConsentAction.mockRejectedValue(new Error("request failed"));
    const store = new McpConsentStore(rootStore);

    await expect(store.decide("consent-code", true)).resolves.toBeNull();

    expect(store.isSubmitting).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("McpConsentCard.error", expect.any(Object));
  });
});
