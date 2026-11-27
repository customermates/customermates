import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import { currentLegalDocumentVersions } from "../../constants/legal-documents";
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { clickHydrated, e2eAppMode } from "./workspace-switching";

test.skip(e2eAppMode() !== "cloud", "Agents create workspaces on Customermates Cloud only");

const REDIRECT_URI = "https://connector.example.test/callback";

const CreatedSchema = z.object({
  slug: z.string(),
  trial: z.boolean(),
  choosePlanUrl: z.string().nullable(),
  setup: z.object({ status: z.string(), reason: z.string().nullable() }),
});

test("a login's second workspace without a trial names the missing plan for Mate and links to choosing one", async ({
  page,
  request,
  database,
  workspace,
}) => {
  test.setTimeout(120_000);
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  const clientId = `connector-${randomUUID()}`;
  await database.query('UPDATE "AuthUser" SET "legalVersions"=$2::jsonb WHERE id=$1', [
    workspace.authUserId,
    JSON.stringify(currentLegalDocumentVersions()),
  ]);
  await database.query(
    'INSERT INTO "OauthApplication" (id,name,"clientId","redirectUrls",type,"updatedAt") VALUES ($1,\'Claude\',$2,$3,\'public\',NOW())',
    [randomUUID(), clientId, REDIRECT_URI],
  );
  const verifier = randomBytes(32).toString("base64url");
  await page.route(`${REDIRECT_URI}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Connector callback</title>" }),
  );
  try {
    await page.goto(
      `/api/auth/mcp/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        scope: "openid offline_access",
        state: "create-state",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        prompt: "consent",
      })}`,
    );
    await clickHydrated(page.getByRole("button", { name: "Approve", exact: true }));
    await expect(page).toHaveURL(/^https:\/\/connector\.example\.test\/callback\?/);
    const code = new URL(page.url()).searchParams.get("code") ?? "";
    const exchanged = await request.post(`${baseUrl}/api/auth/mcp/token`, {
      form: {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      },
    });
    expect(exchanged.status(), await exchanged.text()).toBe(200);
    const { access_token: accessToken } = z.object({ access_token: z.string() }).parse(await exchanged.json());
    const mcp = new Client({ name: "create-workspace-plan-verification", version: "1.0.0" });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      }),
    );
    try {
      const created = await mcp.callTool({
        name: "create_workspace",
        arguments: { name: `Second Bakery ${randomUUID().slice(0, 8)}`, teamSize: "solo", description: "A bakery." },
      });
      expect(created.isError, JSON.stringify(created.content)).not.toBe(true);
      const result = CreatedSchema.parse(created.structuredContent);
      expect(result.slug).not.toBe(workspace.slug);
      expect(result.trial).toBe(false);
      expect(result.choosePlanUrl).toMatch(new RegExp(`/w/${result.slug}/settings/billing$`));
      expect(result.setup.status).toBe("notStarted");
      expect(result.setup.reason).toContain("no active plan and no trial, so Mate cannot build it");
      expect(result.setup.reason).toContain(result.choosePlanUrl ?? "");
      expect(result.setup.reason).not.toMatch(/Validation error|channels/);
    } finally {
      await mcp.close();
    }
  } finally {
    await database.query('DELETE FROM "OauthApplication" WHERE "clientId"=$1', [clientId]);
  }
  expect(errors).toEqual([]);
});
