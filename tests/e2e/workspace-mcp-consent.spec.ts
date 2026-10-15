import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { addBrowserWorkspace } from "./workspace";
import { clickHydrated, e2eAppMode, expectHydrated, giveMemberRole, setMembershipStatus } from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const REDIRECT_URI = "https://connector.example.test/callback";

test("the MCP consent picker binds the connection to the chosen workspace and explains the unavailable ones", async ({
  page,
  request,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  const target = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const pending = await addBrowserWorkspace(database, workspace, "Pending Partners");
  await setMembershipStatus(database, pending, "pendingAuthorization");
  const deactivated = await addBrowserWorkspace(database, workspace, "Paused Agency");
  await setMembershipStatus(database, deactivated, "inactive");
  const unpaid = await addBrowserWorkspace(database, workspace, "Unpaid Studio");
  await database.query('UPDATE "Subscription" SET status=\'expired\' WHERE "companyId"=$1', [unpaid.companyId]);
  const reader = await addBrowserWorkspace(database, workspace, "Reading Room");
  await giveMemberRole(database, reader, "Reader");
  const clientId = `connector-${randomUUID()}`;
  await database.query(
    'INSERT INTO "OauthApplication" (id,name,"clientId","redirectUrls",type,"updatedAt") VALUES ($1,\'Claude\',$2,$3,\'public\',NOW())',
    [randomUUID(), clientId, REDIRECT_URI],
  );
  const verifier = randomBytes(32).toString("base64url");
  const authorize = (state: string) =>
    `/api/auth/mcp/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "openid offline_access",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "consent",
    })}`;
  const option = (companyId: string) => page.locator(`#mcp-consent-workspace-${companyId}`);
  const label = (companyId: string) => page.locator(`label[for="mcp-consent-workspace-${companyId}"]`);
  const tokens = async () =>
    (
      await database.query<{ accessToken: string; companyId: string | null }>(
        'SELECT "accessToken","companyId" FROM "OauthAccessToken" WHERE "clientId"=$1',
        [clientId],
      )
    ).rows;
  await page.route(`${REDIRECT_URI}**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Connector callback</title>" }),
  );
  try {
    await page.goto(authorize("approve-state"));
    await expect(page).toHaveURL(/\/en\/auth\/mcp-consent\?/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Connect Claude to Browser workspace", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(englishMessages.McpConsentWorkspace.pickerLabel, { exact: true })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(6);
    await expect(option(workspace.companyId)).toHaveAttribute("data-state", "checked");
    await expect(label(workspace.companyId)).toContainText(englishMessages.McpConsentWorkspace.current);
    await expect(option(target.companyId)).toBeEnabled();
    for (const [membership, reason] of [
      [pending, englishMessages.Common.userStatuses.pendingAuthorization],
      [deactivated, englishMessages.McpConsentWorkspace.unavailable.inactive],
      [unpaid, englishMessages.McpConsentWorkspace.unavailable.plan],
      [reader, englishMessages.McpConsentWorkspace.unavailable.permission],
    ] as const) {
      await expect(option(membership.companyId)).toBeDisabled();
      await expect(label(membership.companyId)).toContainText(reason);
    }
    await page.screenshot({ path: testInfo.outputPath("ws-mcp-consent-picker.png"), fullPage: true });

    await expectHydrated(option(target.companyId));
    await label(target.companyId).click();
    await expect(option(target.companyId)).toHaveAttribute("data-state", "checked");
    await expect(
      page.getByRole("heading", { level: 1, name: "Connect Claude to Bergmann Steuern", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page).toHaveURL(/^https:\/\/connector\.example\.test\/callback\?/);
    const approved = new URL(page.url());
    expect(approved.searchParams.get("state")).toBe("approve-state");
    const code = approved.searchParams.get("code");
    expect(code).toBeTruthy();

    const exchanged = await request.post(`${baseUrl}/api/auth/mcp/token`, {
      form: {
        grant_type: "authorization_code",
        code: code ?? "",
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      },
    });
    expect(exchanged.status(), await exchanged.text()).toBe(200);
    const { access_token: accessToken } = z.object({ access_token: z.string() }).parse(await exchanged.json());
    expect(await tokens()).toEqual([{ accessToken, companyId: target.companyId }]);
    const mcp = new Client({ name: "workspace-consent-verification", version: "1.0.0" });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      }),
    );
    try {
      const context = await mcp.callTool({ name: "get_workspace_context", arguments: {} });
      expect(context.isError, "get_workspace_context returned a tool error").not.toBe(true);
      expect(context.structuredContent).toMatchObject({
        company: { id: target.companyId, name: "Bergmann Steuern" },
      });
    } finally {
      await mcp.close();
    }

    await page.goto(authorize("deny-state"));
    await expect(
      page.getByRole("heading", { level: 1, name: "Connect Claude to Browser workspace", exact: true }),
    ).toBeVisible();
    await clickHydrated(page.getByRole("button", { name: "Deny", exact: true }));
    await expect(page).toHaveURL(/^https:\/\/connector\.example\.test\/callback\?/);
    const denied = new URL(page.url());
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.get("state")).toBe("deny-state");
    expect(denied.searchParams.get("code")).toBeNull();
    expect(await tokens()).toEqual([{ accessToken, companyId: target.companyId }]);
  } finally {
    await database.query('DELETE FROM "OauthApplication" WHERE "clientId"=$1', [clientId]);
  }
  expect(errors).toEqual([]);
});
