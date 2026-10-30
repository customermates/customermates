import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn() }));
vi.mock("@/core/auth/better-auth", () => ({
  auth: { api: { getSession: state.session } },
}));
vi.mock("@/core/di", () => ({
  getActiveWorkspaceService: () => ({ resolveMembership: state.user }),
}));

import { requestErrorContext } from "../request-context";

beforeEach(() => {
  state.session.mockReset().mockResolvedValue({
    user: {
      id: "auth-id",
      email: "fixture@example.com",
      companyId: "company",
    },
  });
  state.user.mockReset().mockResolvedValue({ id: "tenant-user", companyId: "company", status: "active" });
});

describe("error identity from an interactive request", () => {
  it.each<Record<string, string>>([
    {},
    { cookie: "unrelated=app.session_token=fake" },
    {
      cookie: "app.session_token=fake",
      authorization: "Bearer external-token",
    },
    { cookie: "app.session_token=fake", "x-api-key": "external-key" },
  ])("does not authenticate a non-interactive request: %j", async (headers) => {
    expect(await requestErrorContext(new Headers(headers))).toEqual({});
    expect(state.session).not.toHaveBeenCalled();
    expect(state.user).not.toHaveBeenCalled();
  });

  it.each(["app.session_token", "__Secure-app.session_token"])(
    "uses the tenant user ID, excludes email, and does not refresh %s",
    async (name) => {
      const headers = new Headers({ cookie: `${name}=fixture` });
      expect(await requestErrorContext(headers)).toEqual({
        user: { id: "tenant-user" },
        tags: { companyId: "company" },
      });
      expect(state.session).toHaveBeenCalledWith({
        headers,
        query: { disableRefresh: true },
      });
      expect(state.user).toHaveBeenCalledWith(await state.session.mock.results.at(-1)?.value, headers);
    },
  );

  it("leaves the report unscoped when the tenant cannot be verified", async () => {
    state.user.mockResolvedValue(null);
    expect(await requestErrorContext(new Headers({ cookie: "app.session_token=fixture" }))).toEqual({});
  });

  it("leaves the report unscoped if the optional tenant lookup fails", async () => {
    state.user.mockRejectedValue(new Error("database unavailable"));
    expect(await requestErrorContext(new Headers({ cookie: "app.session_token=fixture" }))).toEqual({});
  });

  it("resolves the reported workspace through the membership service instead of the last-used workspace", async () => {
    const headers = new Headers({ cookie: "app.session_token=fixture", "x-cm-workspace": "other" });
    await requestErrorContext(headers, "/de/w/acme/settings/profile");
    const forwarded = state.user.mock.calls[0][1] as Headers;
    expect(forwarded.get("x-cm-workspace")).toBe("acme");
    expect(headers.get("x-cm-workspace")).toBe("other");
  });

  it("does not attach an inactive workspace member to the report", async () => {
    state.user.mockResolvedValue({ id: "inactive-user", companyId: "company", status: "inactive" });
    expect(await requestErrorContext(new Headers({ cookie: "app.session_token=fixture" }))).toEqual({});
  });

  it("does not invent identity for an invalid session", async () => {
    state.session.mockResolvedValue(null);
    expect(await requestErrorContext(new Headers({ cookie: "app.session_token=fixture" }))).toEqual({});
    expect(state.user).not.toHaveBeenCalled();
  });
});
