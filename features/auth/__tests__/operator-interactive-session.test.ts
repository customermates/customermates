import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  headers: {} as Record<string, string>,
  getSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers(state.headers)),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock("@/core/auth/better-auth", () => ({
  auth: { api: { getSession: state.getSession } },
}));
vi.mock("@/prisma/db", () => ({ prisma: {} }));
vi.mock("@/core/decorators/tenant-context", () => ({ runWithoutTenant: vi.fn() }));
vi.mock("@/env", () => ({
  env: { BASE_URL: "http://localhost:4000", RESEND_OPERATOR_EMAIL: "operator@example.invalid" },
}));

import { AuthService } from "@/features/auth/auth.service";

const deniedHeaders: Array<{ headers: Record<string, string>; label: string }> = [
  { headers: {}, label: "a missing cookie" },
  { headers: { cookie: "not_app.session_token=value" }, label: "a cookie-name substring" },
  { headers: { cookie: "app.session_token=value", "x-api-key": "key" }, label: "an API key" },
  { headers: { cookie: "app.session_token=value", authorization: "Bearer token" }, label: "a bearer token" },
];

describe("AuthService.getInteractiveSession", () => {
  const service = new AuthService({ send: vi.fn() } as never);
  const session = { session: { id: "session-id" }, user: { id: "auth-user-id" } };

  beforeEach(() => {
    state.headers = {};
    state.getSession.mockReset().mockResolvedValue(session);
  });

  it.each(["app.session_token=value", "__Secure-app.session_token=value"])(
    "accepts the first-party browser cookie %s",
    async (cookie) => {
      state.headers = { cookie };

      await expect(service.getInteractiveSession()).resolves.toBe(session);
      expect(state.getSession).toHaveBeenCalledOnce();
    },
  );

  it.each(deniedHeaders)("rejects $label", async ({ headers }) => {
    state.headers = headers;

    await expect(service.getInteractiveSession()).resolves.toBeNull();
    expect(state.getSession).not.toHaveBeenCalled();
  });

  it("fails closed when Better Auth cannot resolve the cookie", async () => {
    state.headers = { cookie: "app.session_token=value" };
    state.getSession.mockRejectedValueOnce(new Error("auth unavailable"));

    await expect(service.getInteractiveSession()).resolves.toBeNull();
  });
});
