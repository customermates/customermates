import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { Client } from "pg";
import { localE2eEnvironment } from "./local-environment";
import { createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";

type Fixtures = {
  database: Client;
  workspace: Awaited<ReturnType<typeof createBrowserWorkspace>>;
  companyId: string;
  signedIn: void;
};
export const test = base.extend<Fixtures>({
  database: async ({}, use) => {
    const { databaseUrl } = localE2eEnvironment();
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await use(client);
    } finally {
      await client.end();
    }
  },
  workspace: async ({ database }, use) => {
    const workspace = await createBrowserWorkspace(database);
    try {
      await use(workspace);
    } finally {
      await removeBrowserWorkspace(database, workspace);
    }
  },
  companyId: async ({ workspace }, use) => {
    await use(workspace.companyId);
  },
  signedIn: [
    async ({ context, database, companyId, workspace }, use) => {
      const { baseUrl } = localE2eEnvironment();
      const secret = process.env.BETTER_AUTH_SECRET;
      if (!secret) throw new Error("A local authentication secret is required");
      const sessionId = randomUUID();
      const token = randomBytes(32).toString("hex");
      await database.query(
        'INSERT INTO "AuthSession" (id,token,"userId","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW(),NOW())',
        [sessionId, token, workspace.authUserId],
      );
      const signed = encodeURIComponent(
        `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`,
      );
      await context.addCookies([
        {
          name: "app.session_token",
          value: signed,
          url: baseUrl,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await context.route(
        (url) =>
          !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
          !["data:", "blob:"].includes(url.protocol),
        async (route) => {
          const url = new URL(route.request().url());
          if (
            url.hostname === "customermates.com" &&
            /^\/demo\/avatars\/photos\/[a-z-]+\.png$/.test(url.pathname) &&
            existsSync(resolve("public", url.pathname.slice(1)))
          )
            await route.fulfill({
              path: resolve("public", url.pathname.slice(1)),
            });
          else await route.abort("blockedbyclient");
        },
      );
      try {
        if (process.env.CRM_E2E_SERVER_MODE === "development") {
          const type = await database.query(
            "SELECT id FROM \"RecordTypeDefinition\" WHERE \"companyId\"=$1 AND definition->>'embedded'='false' ORDER BY id LIMIT 1",
            [companyId],
          );
          if (!type.rows[0])
            throw new Error("The browser baseline record types are missing");
          for (const path of [
            "/en/configure",
            `/en/records/${type.rows[0].id}`,
          ]) {
            const response = await context.request.get(`${baseUrl}${path}`, {
              timeout: 120000,
            });
            if (!response.ok())
              throw new Error(
                `Local development route warmup failed with status ${response.status()}`,
              );
          }
        }
        await use();
      } finally {
        await Promise.all(context.pages().map((page) => page.close()));
        await database.query('DELETE FROM "AuthSession" WHERE id=$1', [
          sessionId,
        ]);
      }
    },
    { auto: true, timeout: 180000 },
  ],
});
export { isAppConsoleError, isBenignPageError } from "./browser-noise";
export { expect };
