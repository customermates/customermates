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

  it("shows an error and resets submitting when the action rejects", async () => {
    authActions.decideMcpConsentAction.mockRejectedValue(new Error("request failed"));
    const store = new McpConsentStore(rootStore);

    await expect(store.decide("consent-code", true)).resolves.toBeNull();

    expect(store.isSubmitting).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("McpConsentCard.error", expect.any(Object));
  });
});
