import type { TenantUser } from "@/features/user/user.schema";
import type { FakeOauthToken } from "./fake-connected-app-repo";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const tenant = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => tenant.user as TenantUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";

import { DisconnectConnectedAppInteractor } from "../disconnect-connected-app.interactor";
import { GetConnectedAppsInteractor } from "../get-connected-apps.interactor";

import { FakeConnectedAppRepo } from "./fake-connected-app-repo";

const NOW = new Date("2026-11-19T09:00:00.000Z");
const DAY_MS = 86_400_000;
const LOGIN = "login-own";
const OTHER_LOGIN = "login-colleague";
const COMPANY = "company-own";
const OTHER_COMPANY = "company-other";
const NAMES = { claude: "Claude", chatgpt: "ChatGPT", cursor: "Cursor" };

const OWN = { id: LOGIN, email: createMockUser().email };
const COLLEAGUE = { id: OTHER_LOGIN, email: `colleague.${OWN.email}` };

const days = (count: number) => new Date(NOW.getTime() + count * DAY_MS);

function token(overrides: Partial<FakeOauthToken> = {}): FakeOauthToken {
  return {
    userId: LOGIN,
    companyId: COMPANY,
    clientId: "claude",
    createdAt: days(-3),
    updatedAt: days(-3),
    refreshTokenExpiresAt: days(27),
    ...overrides,
  };
}

function signedInAs(user: { id: string; email: string } | null) {
  return { getInteractiveSession: vi.fn().mockResolvedValue(user ? { user } : null) };
}

function list(tokens: FakeOauthToken[], session = signedInAs(OWN)) {
  const repo = new FakeConnectedAppRepo(tokens, NAMES);
  return { repo, interactor: new GetConnectedAppsInteractor(repo, session, () => NOW) };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenant.user = createMockUser({ companyId: COMPANY });
});

describe("GetConnectedAppsInteractor", () => {
  it("lists one row per app with the first connection and the latest activity of its tokens", async () => {
    const { interactor } = list([
      token({ createdAt: days(-40), updatedAt: days(-40), refreshTokenExpiresAt: days(-10) }),
      token({ createdAt: days(-9), updatedAt: days(-9), refreshTokenExpiresAt: days(21) }),
      token({ createdAt: days(-1), updatedAt: days(-1), refreshTokenExpiresAt: days(29) }),
      token({ clientId: "chatgpt", createdAt: days(-2), updatedAt: days(-2), refreshTokenExpiresAt: days(28) }),
    ]);

    expect(await interactor.invoke()).toEqual({
      ok: true,
      data: [
        {
          id: "claude",
          name: "Claude",
          device: null,
          accountWide: false,
          connectedAt: days(-40),
          lastActiveAt: days(-1),
        },
        {
          id: "chatgpt",
          name: "ChatGPT",
          device: null,
          accountWide: false,
          connectedAt: days(-2),
          lastActiveAt: days(-2),
        },
      ],
    });
  });

  it("leaves out an app whose refresh tokens have all expired", async () => {
    const { interactor } = list([
      token({ refreshTokenExpiresAt: days(-1) }),
      token({ refreshTokenExpiresAt: NOW }),
      token({ clientId: "chatgpt" }),
    ]);

    const result = await interactor.invoke();

    expect(result.data.map((app) => app.id)).toEqual(["chatgpt"]);
  });

  it("never shows another member's connections and shows the member's account-wide connections in every workspace", async () => {
    const { interactor, repo } = list([
      token({ userId: OTHER_LOGIN, clientId: "cursor" }),
      token({ companyId: OTHER_COMPANY, clientId: "chatgpt" }),
      token({ companyId: null, clientId: "grok" }),
      token(),
    ]);

    const result = await interactor.invoke();

    expect(result.data.map((app) => app.id).sort()).toEqual(["chatgpt", "claude", "grok"]);
    expect(Object.fromEntries(result.data.map((app) => [app.id, app.accountWide]))).toEqual({
      chatgpt: false,
      claude: false,
      grok: true,
    });
    expect(repo.askedFor).toEqual([LOGIN]);
  });

  it("lists nothing without a browser session of the member and reads no tokens", async () => {
    const signedOut = list([token()], signedInAs(null));
    const someoneElse = list([token()], signedInAs(COLLEAGUE));

    expect(await signedOut.interactor.invoke()).toEqual({ ok: true, data: [] });
    expect(await someoneElse.interactor.invoke()).toEqual({ ok: true, data: [] });
    expect(signedOut.repo.askedFor).toEqual([]);
    expect(someoneElse.repo.askedFor).toEqual([]);
  });

  it("needs the permission that connecting an app needs", async () => {
    tenant.user = createMockUserWithPermissions([{ resource: Resource.api, action: Action.create }]);

    await expect(list([token()]).interactor.invoke()).rejects.toThrow("readAll on api");
  });
});

describe("DisconnectConnectedAppInteractor", () => {
  function disconnect(session = signedInAs(OWN)) {
    const revokeOauthClientAccess = vi.fn().mockResolvedValue(2);
    return {
      revokeOauthClientAccess,
      interactor: new DisconnectConnectedAppInteractor({ ...session, revokeOauthClientAccess }),
    };
  }

  it("revokes the account-wide app of the signed-in login", async () => {
    const { interactor, revokeOauthClientAccess } = disconnect();

    expect(await interactor.invoke({ id: "claude" })).toEqual({ ok: true, data: "claude" });
    expect(revokeOauthClientAccess).toHaveBeenCalledTimes(1);
    expect(revokeOauthClientAccess).toHaveBeenCalledWith({ authUserId: LOGIN, clientId: "claude" });
  });

  it("works for a member who may use the API without managing keys", async () => {
    tenant.user = {
      ...createMockUserWithPermissions([{ resource: Resource.api, action: Action.readAll }]),
      companyId: COMPANY,
    };
    const { interactor, revokeOauthClientAccess } = disconnect();

    expect(await interactor.invoke({ id: "claude" })).toMatchObject({ ok: true });
    expect(revokeOauthClientAccess).toHaveBeenCalledWith({ authUserId: LOGIN, clientId: "claude" });
  });

  it("revokes nothing without a browser session of the member", async () => {
    const signedOut = disconnect(signedInAs(null));
    const someoneElse = disconnect(signedInAs(COLLEAGUE));

    for (const { interactor, revokeOauthClientAccess } of [signedOut, someoneElse]) {
      const result = await interactor.invoke({ id: "claude" });

      expect(result).toMatchObject({ ok: false });
      if (!result.ok)
        expect(result.error.issues[0]).toMatchObject({ params: { error: CustomErrorCode.permissionDenied } });
      expect(revokeOauthClientAccess).not.toHaveBeenCalled();
    }
  });

  it("refuses an empty app id and a member without API access", async () => {
    const empty = disconnect();
    expect(await empty.interactor.invoke({ id: "" })).toMatchObject({ ok: false });
    expect(empty.revokeOauthClientAccess).not.toHaveBeenCalled();

    tenant.user = createMockUserWithPermissions([]);
    const denied = disconnect();
    await expect(denied.interactor.invoke({ id: "claude" })).rejects.toThrow("readAll on api");
    expect(denied.revokeOauthClientAccess).not.toHaveBeenCalled();
  });
});
