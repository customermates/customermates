import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findApiKey: vi.fn(),
  findAccessToken: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}), headers: () => Promise.resolve(new Headers()) }));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock("@/core/auth/better-auth", () => ({ auth: { api: {} } }));
vi.mock("@/prisma/db", () => ({
  prisma: {
    apikey: { findUnique: mocks.findApiKey },
    oauthAccessToken: { findUnique: mocks.findAccessToken },
  },
}));
vi.mock("@/core/decorators/tenant-context", () => ({ runWithoutTenant: vi.fn() }));
vi.mock("@/env", () => ({ env: { BASE_URL: "https://app.example.test", RESEND_OPERATOR_EMAIL: "mail@example.com" } }));

import { AuthService } from "@/features/auth/auth.service";

const session = (id: string, token = id) =>
  ({ session: { id, token }, user: { id: "auth-user-1", email: "max@example.com" } }) as never;

describe("AuthService.getCredentialVia", () => {
  const service = new AuthService({ send: vi.fn() } as never);

  beforeEach(() => vi.clearAllMocks());

  it("names the API key a request authenticated with", async () => {
    mocks.findApiKey.mockResolvedValue({ name: "Zapier production", referenceId: "auth-user-1" });

    await expect(service.getCredentialVia(session("key-1"), new Headers({ "x-api-key": "secret" }))).resolves.toEqual({
      kind: "apiKey",
      name: "Zapier production",
    });
    expect(mocks.findApiKey).toHaveBeenCalledWith({
      where: { id: "key-1" },
      select: { name: true, referenceId: true },
    });
  });

  it("names the connected application behind an OAuth access token", async () => {
    mocks.findAccessToken.mockResolvedValue({ userId: "auth-user-1", oauthapplication: { name: "Claude Desktop" } });

    await expect(
      service.getCredentialVia(session("token-1"), new Headers({ authorization: "Bearer token-1" })),
    ).resolves.toEqual({ kind: "oauthApplication", name: "Claude Desktop" });
    expect(mocks.findAccessToken).toHaveBeenCalledWith({
      where: { accessToken: "token-1" },
      select: { userId: true, oauthapplication: { select: { name: true } } },
    });
  });

  it("selects only names, never a key or token value", async () => {
    mocks.findApiKey.mockResolvedValue({ name: "Zapier", referenceId: "auth-user-1" });
    mocks.findAccessToken.mockResolvedValue({ userId: "auth-user-1", oauthapplication: { name: "ChatGPT" } });

    await service.getCredentialVia(session("key-1"), new Headers({ "x-api-key": "secret" }));
    await service.getCredentialVia(session("token-1"), new Headers({ authorization: "Bearer token-1" }));

    expect(JSON.stringify(mocks.findApiKey.mock.calls[0][0].select)).not.toMatch(/"key"|secret/);
    expect(Object.keys(mocks.findAccessToken.mock.calls[0][0].select)).toEqual(["userId", "oauthapplication"]);
  });

  it("records nothing for a credential that belongs to another login", async () => {
    mocks.findApiKey.mockResolvedValue({ name: "Someone else's key", referenceId: "auth-user-2" });
    mocks.findAccessToken.mockResolvedValue({ userId: "auth-user-2", oauthapplication: { name: "ChatGPT" } });

    await expect(
      service.getCredentialVia(session("key-1"), new Headers({ "x-api-key": "secret" })),
    ).resolves.toBeNull();
    await expect(
      service.getCredentialVia(session("token-1"), new Headers({ authorization: "Bearer token-1" })),
    ).resolves.toBeNull();
  });

  it("records nothing for a missing credential row, a blank name or a browser session", async () => {
    mocks.findApiKey.mockResolvedValue(null);
    await expect(
      service.getCredentialVia(session("key-1"), new Headers({ "x-api-key": "secret" })),
    ).resolves.toBeNull();

    mocks.findApiKey.mockResolvedValue({ name: "  ", referenceId: "auth-user-1" });
    await expect(
      service.getCredentialVia(session("key-1"), new Headers({ "x-api-key": "secret" })),
    ).resolves.toBeNull();

    await expect(
      service.getCredentialVia(session("session-1"), new Headers({ cookie: "app.session_token=x" })),
    ).resolves.toBeNull();
    expect(mocks.findAccessToken).not.toHaveBeenCalled();
  });
});
