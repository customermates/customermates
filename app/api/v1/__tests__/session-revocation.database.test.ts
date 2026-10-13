import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createApiKeyTenant } from "@/tests/helpers/api-key-tenant-fixture";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
  cookies: () =>
    Promise.resolve({ get: () => undefined, getAll: () => [], set: () => undefined, delete: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

import { POST as listRoutines } from "../routines/list/route";
import { POST as createWikiPages } from "../wiki/create/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const PASSWORD = `Replay-${randomUUID()}`;

async function authRequest(path: string, init: { cookie?: string; body?: unknown }) {
  const { auth } = await import("@/core/auth/better-auth");
  const { env } = await import("@/env");
  const origin = new URL(env.BASE_URL).origin;
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: JSON.stringify(init.body ?? {}),
    }),
  );
}

function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function rest(handler: (request: NextRequest) => Promise<Response>, path: string, cookie: string, body: unknown) {
  const headers = new Headers({ "content-type": "application/json", cookie });
  requestContext.headers = headers;
  const response = await handler(
    new NextRequest(`http://localhost:4105/api/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body) }),
  );
  return response.status;
}

const read = (cookie: string) => rest(listRoutines, "routines/list", cookie, {});
const write = (cookie: string) =>
  rest(createWikiPages, "wiki/create", cookie, { pages: [{ title: `Replay ${randomUUID()}`, markdown: "Body" }] });

describeDatabase("session cookies after sign-out, session revocation and deactivation", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  let tenant: Awaited<ReturnType<typeof createApiKeyTenant>>;
  let userId: string;
  let authUserId: string;
  let email: string;

  async function signIn() {
    const response = await authRequest("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(response.status).toBe(200);
    return cookieHeader(response);
  }

  beforeAll(async () => {
    await client.connect();
    tenant = await createApiKeyTenant(client, [
      {
        label: "session-replay",
        systemRole: false,
        permissions: [
          ["routines", "readAll"],
          ["wiki", "readAll"],
          ["wiki", "create"],
        ],
      },
    ]);
    userId = tenant.members[0].userId;
    const authUser = await client.query<{ id: string; email: string }>(
      'SELECT a."id", a."email" FROM "AuthUser" a JOIN "User" u ON u."email" = a."email" WHERE u."id" = $1',
      [userId],
    );
    authUserId = authUser.rows[0].id;
    email = authUser.rows[0].email;
    await client.query(
      'INSERT INTO "AuthAccount" ("id", "accountId", "providerId", "userId", "password", "updatedAt") VALUES ($1, $2, \'credential\', $2, $3, CURRENT_TIMESTAMP)',
      [randomUUID(), authUserId, await hashPassword(PASSWORD)],
    );
  });

  afterAll(async () => {
    await tenant?.remove();
    await client.end();
  });

  it("issues no cached session cookie and refuses a replayed cookie on read and write right after sign-out", async () => {
    const cookie = await signIn();
    expect(cookie).toContain("session_token=");
    expect(cookie).not.toContain("session_data=");
    expect(await read(cookie)).toBe(200);
    expect(await write(cookie)).toBe(200);

    const signedOut = await authRequest("/sign-out", { cookie });
    expect(signedOut.status).toBe(200);

    expect(await read(cookie)).toBe(401);
    expect(await write(cookie)).toBe(401);
  });

  it("refuses a cookie as soon as its session is revoked", async () => {
    const cookie = await signIn();
    expect(await read(cookie)).toBe(200);

    await client.query('DELETE FROM "AuthSession" WHERE "userId" = $1', [authUserId]);

    expect(await read(cookie)).toBe(401);
    expect(await write(cookie)).toBe(401);
  });

  it("refuses a live session as soon as the member is deactivated", async () => {
    const cookie = await signIn();
    expect(await read(cookie)).toBe(200);

    await client.query('UPDATE "User" SET "status" = \'inactive\' WHERE "id" = $1', [userId]);

    expect(await read(cookie)).toBe(403);
    expect(await write(cookie)).toBe(403);
  });
});
