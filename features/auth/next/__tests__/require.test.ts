import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  resolveRequestAccountState: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ setTag: vi.fn(), setUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn().mockResolvedValue("en") }));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: mocks.resolveRequestAccountState,
}));

import { requireAccountState } from "../require";

describe("requireAccountState redirect overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves an onboarding intent when authentication has expired", async () => {
    mocks.resolveRequestAccountState.mockResolvedValue({ state: "unauthenticated" });

    await expect(
      requireAccountState("unregistered", "/", {
        unauthenticated: "/auth/signin?intent=signed.intent",
      }),
    ).rejects.toThrow("REDIRECT:/en/auth/signin?intent=signed.intent");
  });

  it("keeps the canonical redirect when no override is supplied", async () => {
    mocks.resolveRequestAccountState.mockResolvedValue({ state: "overdueVerification" });

    await expect(requireAccountState("unregistered")).rejects.toThrow("REDIRECT:/en/auth/verify-email");
  });
});
