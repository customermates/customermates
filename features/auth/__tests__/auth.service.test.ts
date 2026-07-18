import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  signInSocial: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/env", () => ({ env: { BASE_URL: "https://feat-oauth.customermates.com" } }));
vi.mock("@/prisma/db", () => ({ prisma: {} }));
vi.mock("@/core/auth/better-auth", () => ({ auth: { api: { signInSocial: mocks.signInSocial } } }));

import { AuthService } from "../auth.service";

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.signInSocial.mockResolvedValue({ redirect: true });
  });

  it("returns social authentication errors to the current environment", async () => {
    const service = new AuthService({} as never);

    await service.continueWithSocials({
      provider: "google",
      errorCallbackURL: "/auth/signup",
    });

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        provider: "google",
        callbackURL: "https://feat-oauth.customermates.com",
        errorCallbackURL: "https://feat-oauth.customermates.com/auth/signup",
      },
    });
  });
});
