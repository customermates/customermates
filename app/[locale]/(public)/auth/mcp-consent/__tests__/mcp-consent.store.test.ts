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

const crm = { companyId: "company-a", name: "CRM", isCurrent: true, unavailableReason: null };
const taxes = { companyId: "company-b", name: "Taxes", isCurrent: false, unavailableReason: null };
const waiting = { companyId: "company-c", name: null, isCurrent: false, unavailableReason: "pending" as const };

describe("McpConsentStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the serialized redirect and keeps the submitting state for navigation", async () => {
    authActions.decideMcpConsentAction.mockResolvedValue({
      ok: true,
      data: { redirectURI: "https://client.example/callback" },
    });
    const store = new McpConsentStore(rootStore);

    await expect(store.decide("consent-code", true)).resolves.toBe("https://client.example/callback");

    expect(authActions.decideMcpConsentAction).toHaveBeenCalledWith({
      consentCode: "consent-code",
      accept: true,
    });
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

  it("defaults to the current workspace and binds the decision to it", async () => {
    authActions.decideMcpConsentAction.mockResolvedValue({
      ok: true,
      data: { redirectURI: "https://client.example/callback" },
    });
    const store = new McpConsentStore(rootStore);
    store.initialize([taxes, crm, waiting]);

    expect(store.selectedWorkspace).toEqual(crm);
    expect(store.canApprove).toBe(true);

    await store.decide("consent-code", true);

    expect(authActions.decideMcpConsentAction).toHaveBeenCalledWith({
      consentCode: "consent-code",
      accept: true,
      companyId: "company-a",
    });
  });

  it("switches to another available workspace and ignores unavailable ones", () => {
    const store = new McpConsentStore(rootStore);
    store.initialize([crm, taxes, waiting]);

    store.select("company-b");
    expect(store.selectedCompanyId).toBe("company-b");

    store.select("company-c");
    store.select("unknown-company");
    expect(store.selectedCompanyId).toBe("company-b");
  });

  it("falls back to the first available workspace when the current one cannot be connected", () => {
    const store = new McpConsentStore(rootStore);
    store.initialize([{ ...crm, unavailableReason: "pending" }, waiting, taxes]);

    expect(store.selectedCompanyId).toBe("company-b");
    expect(store.canApprove).toBe(true);
  });

  it("keeps the current workspace selected for a denial when nothing can be connected", () => {
    const store = new McpConsentStore(rootStore);
    store.initialize([waiting, { ...crm, unavailableReason: "permission" }]);

    expect(store.selectedCompanyId).toBe("company-a");
    expect(store.canApprove).toBe(false);
  });

  it("does not change the workspace while a decision is submitting", async () => {
    let resolveDecision: (value: unknown) => void = () => undefined;
    authActions.decideMcpConsentAction.mockReturnValue(
      new Promise((resolve) => {
        resolveDecision = resolve;
      }),
    );
    const store = new McpConsentStore(rootStore);
    store.initialize([crm, taxes]);

    const decision = store.decide("consent-code", true);
    store.select("company-b");

    expect(store.selectedCompanyId).toBe("company-a");
    resolveDecision({ ok: true, data: { redirectURI: "https://client.example/callback" } });
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
